import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import * as nodemailer from 'nodemailer';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { WorkOrderCompletionEmail } from 'src/entities';
import { UploadService } from 'src/modules/upload/upload.service';

type MailTransport = {
  sendMail(options: {
    from: string;
    to: string[];
    cc?: string[];
    replyTo?: string;
    subject: string;
    text: string;
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
    @Optional()
    private readonly configService?: ConfigService<AppConfig, true>,
  ) {}

  @Cron('*/30 * * * * *')
  async processPending(): Promise<number> {
    if (this.running) return 0;
    const config = this.getMailConfig();
    // An explicitly disabled queue is an administrative choice and should not
    // mutate records. An enabled queue without transport settings is a real
    // delivery failure and must remain visible to operators.
    if (!config.enabled) return 0;
    if (!this.isConfigured()) return this.markConfigurationFailures();
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

  private async markConfigurationFailures(): Promise<number> {
    const tasks = await this.emailRepository.find({
      where: [
        { status: 'pending' },
        { status: 'sending' },
      ],
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
    });
    if (!tasks.length) return 0;
    const message = '邮件服务尚未配置（SMTP 主机、发件地址或端口缺失），未发送';
    for (const task of tasks) {
      task.status = 'failed';
      task.lastError = message;
      task.nextRetryAt = null;
      await this.emailRepository.save(task);
    }
    return 0;
  }

  private async deliverOne(task: WorkOrderCompletionEmail): Promise<boolean> {
    const claimed = await this.claim(task);
    if (!claimed) return false;
    try {
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
        attachments,
      });
      task.status = 'sent';
      task.sentAt = new Date();
      task.lastError = null;
      task.nextRetryAt = null;
      await this.emailRepository.save(task);
      return true;
    } catch (error) {
      await this.markFailed(task, error);
      return false;
    }
  }

  private async claim(task: WorkOrderCompletionEmail): Promise<boolean> {
    // The worker is single-flight in this process. Reclaim an abandoned `sending` task after a crash.
    if (task.status === 'sending' && task.updatedAt && Date.now() - task.updatedAt.getTime() < STALE_SENDING_MS) return false;
    task.status = 'sending';
    task.attemptCount = (task.attemptCount ?? 0) + 1;
    await this.emailRepository.save(task);
    return true;
  }

  private async markFailed(task: WorkOrderCompletionEmail, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = this.getMailConfig().maxAttempts;
    task.status = 'failed';
    task.lastError = message.slice(0, 4000);
    task.nextRetryAt = task.attemptCount >= maxAttempts
      ? null
      : new Date(Date.now() + Math.min(RETRY_BASE_MS * (2 ** Math.max(task.attemptCount - 1, 0)), RETRY_MAX_MS));
    await this.emailRepository.save(task);
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
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }
}
