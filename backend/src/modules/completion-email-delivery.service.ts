import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { WorkOrderCompletionEmail } from 'src/entities';
import { UploadService } from 'src/modules/upload/upload.service';
import { PortalNotificationEligibilityService } from './portal-notifications/portal-notification-eligibility.service';

type MailTransport = {
  sendMail(options: {
    from: string;
    to: string[];
    cc?: string[];
    replyTo?: string;
    subject: string;
    text: string;
    messageId: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  }): Promise<unknown>;
};

const BATCH_SIZE = 20;
const STALE_SENDING_MS = 10 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

@Injectable()
export class CompletionEmailDeliveryService {
  private readonly logger = new Logger(CompletionEmailDeliveryService.name);
  private running = false;

  constructor(
    @InjectRepository(WorkOrderCompletionEmail)
    private readonly emailRepository: Repository<WorkOrderCompletionEmail>,
    private readonly uploadService: UploadService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly eligibility: PortalNotificationEligibilityService,
  ) {}

  @Cron('*/30 * * * * *')
  async processPending(): Promise<number> {
    if (this.running) return 0;
    const config = this.getMailConfig();
    // An explicitly disabled queue is an administrative choice and should not
    // mutate records. An enabled queue without transport settings is a real
    // delivery failure and must remain visible to operators.
    if (!config.enabled) return 0;
    this.running = true;
    try {
      const now = new Date();
      const tasks = await this.emailRepository.find({
        where: [
          { status: 'pending', nextRetryAt: IsNull() },
          { status: 'pending', nextRetryAt: LessThanOrEqual(now) },
          { status: 'failed', nextRetryAt: LessThanOrEqual(now) },
          { status: 'sending', updatedAt: LessThanOrEqual(new Date(now.getTime() - STALE_SENDING_MS)) },
        ],
        order: { createdAt: 'ASC' },
        take: BATCH_SIZE,
      });
      let sent = 0;
      for (const task of tasks) {
        if (await this.deliverOne(task)) sent += 1;
      }
      if (sent > 0) this.logger.log(`Delivered ${sent} completion result emails`);
      return sent;
    } catch (error) {
      this.logger.error('Failed to process completion result email queue', error instanceof Error ? error.stack : String(error));
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliverOne(task: WorkOrderCompletionEmail): Promise<boolean> {
    const claimed = await this.claim(task);
    if (!claimed) return false;
    try {
      const eligible = await this.eligibility.evaluate(task);
      if (eligible.cancelReason) {
        await this.finishClaim(task, { status: 'cancelled', lastError: eligible.cancelReason, nextRetryAt: null });
        return false;
      }
      if (eligible.error) throw new Error(eligible.error);
      task.toRecipients = eligible.recipients;
      if (!task.toRecipients.length) throw new Error('邮件没有有效收件人，未发送');
      if (!this.isConfigured()) {
        await this.finishClaim(task, { status: 'failed', lastError: '邮件服务尚未配置（SMTP 主机、发件地址或端口缺失），未发送', nextRetryAt: null });
        return false;
      }
      const attachmentIds = [...new Set([...(task.attachmentId ? [task.attachmentId] : []), ...(task.attachmentIds ?? [])])];
      const attachments = attachmentIds.length ? await Promise.all(attachmentIds.map((id) => this.readAttachment(id))) : undefined;
      const config = this.getMailConfig();
      await this.createTransport().sendMail({
        from: config.from,
        to: task.toRecipients,
        cc: task.ccRecipients.length > 0 ? task.ccRecipients : undefined,
        replyTo: task.replyTo ?? undefined,
        subject: task.subject,
        text: task.bodySnapshot,
        messageId: `<portal-queue-${task.id}@ticket-system.local>`,
        attachments,
      });
      return this.finishClaim(task, { status: 'sent', sentAt: new Date(), lastError: null, nextRetryAt: null, toRecipients: task.toRecipients });
    } catch (error) {
      await this.markFailed(task, error);
      return false;
    }
  }

  private async claim(task: WorkOrderCompletionEmail): Promise<boolean> {
    // Database compare-and-swap protects the shared queue across processes.
    if (task.status === 'sending' && task.updatedAt && Date.now() - task.updatedAt.getTime() < STALE_SENDING_MS) return false;
    if (!['pending', 'failed', 'sending'].includes(task.status)) return false;
    const where = {
      id: task.id, status: task.status, attemptCount: task.attemptCount,
      ...(task.status === 'sending'
        ? { updatedAt: LessThanOrEqual(new Date(Date.now() - STALE_SENDING_MS)) }
        : { nextRetryAt: task.nextRetryAt ? LessThanOrEqual(new Date()) : IsNull() }),
    };
    if (task.attemptCount >= this.getMailConfig().maxAttempts) {
      await this.emailRepository.update(where, { status: 'failed', lastError: task.lastError || '重试次数已达上限，请人工检查后重试', nextRetryAt: null, claimToken: null });
      return false;
    }
    const changes = { status: 'sending' as const, attemptCount: task.attemptCount + 1, claimToken: randomUUID(), updatedAt: new Date() };
    const result = await this.emailRepository.update(where, changes);
    if (result.affected !== 1) return false;
    Object.assign(task, changes);
    return true;
  }

  private async finishClaim(task: WorkOrderCompletionEmail, changes: Partial<WorkOrderCompletionEmail>): Promise<boolean> {
    const result = await this.emailRepository.update({ id: task.id, status: 'sending', claimToken: task.claimToken! }, { ...changes, claimToken: null, updatedAt: new Date() });
    if (result.affected === 1) Object.assign(task, changes, { claimToken: null });
    return result.affected === 1;
  }

  private async markFailed(task: WorkOrderCompletionEmail, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = this.getMailConfig().maxAttempts;
    const nextRetryAt = task.attemptCount >= maxAttempts
      ? null
      : new Date(Date.now() + Math.min(RETRY_BASE_MS * (2 ** Math.max(task.attemptCount - 1, 0)), RETRY_MAX_MS));
    await this.finishClaim(task, { status: 'failed', lastError: message.slice(0, 4000), nextRetryAt });
    this.logger.error(`Completion result email ${task.id} failed: ${message}`);
  }

  private async readAttachment(fileId: string): Promise<{ filename: string; content: Buffer; contentType?: string }> {
    const meta = await this.uploadService.resolveFile(fileId);
    return {
      filename: meta.originalName,
      content: await readFile(meta.filePath),
      contentType: meta.mimeType,
    };
  }

  private isConfigured(): boolean {
    const config = this.getMailConfig();
    return config.enabled && Boolean(config.host && config.from && config.port > 0 && config.maxAttempts > 0);
  }

  private getMailConfig(): AppConfig['mail'] {
    return this.configService?.get<AppConfig['mail']>('mail', { infer: true }) ?? {
      enabled: false,
      host: '',
      port: 465,
      secure: true,
      user: '',
      pass: '',
      from: '',
      maxAttempts: 3,
    };
  }

  private createTransport(): MailTransport {
    const config = this.getMailConfig();
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 120_000,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }
}
