import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { SystemSetting } from 'src/entities';
import {
  DEFAULT_OPERATION_LOG_RETENTION_DAYS,
  MAX_OPERATION_LOG_RETENTION_DAYS,
  MIN_OPERATION_LOG_RETENTION_DAYS,
  OPERATION_LOG_RETENTION_SETTING_KEY,
} from 'src/modules/admin/system-settings/system-settings.service';

const RETENTION_CACHE_TTL_MS = 30_000;

interface RetentionSettingValue {
  days?: unknown;
}

@Injectable()
export class OperationLogCleanupService {
  private readonly logger = new Logger(OperationLogCleanupService.name);
  private readonly batchSize = 2000;
  private retentionDaysCache: { days: number | null; expiresAt: number } | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
  ) {}

  @Cron('0 0 3 * * *')
  async cleanupExpiredLogs(): Promise<void> {
    const retentionDays = await this.getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const queryRunner = this.dataSource.createQueryRunner();
    let totalDeleted = 0;

    await queryRunner.connect();
    try {
      while (true) {
        const deletedRows = await queryRunner.query(
          `
            DELETE FROM operation_logs
            WHERE id IN (
              SELECT id
              FROM operation_logs
              WHERE created_at < $1
              ORDER BY created_at ASC
              LIMIT $2
            )
            RETURNING 1
          `,
          [cutoff, this.batchSize],
        );
        const deletedCount = Array.isArray(deletedRows) ? deletedRows.length : 0;
        totalDeleted += deletedCount;

        if (deletedCount < this.batchSize) {
          break;
        }
      }

      this.logger.log(
        `operation_logs cleanup completed: retentionDays=${retentionDays}, cutoff=${cutoff.toISOString()}, deleted=${totalDeleted}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.stack : String(error);
      this.logger.error('operation_logs cleanup failed', message);
    } finally {
      await queryRunner.release();
    }
  }

  async getRetentionDays(): Promise<number> {
    const storedDays = await this.getStoredRetentionDaysCached();
    if (storedDays !== null) return storedDays;

    const configuredDays = this.configService.get<number>('operationLog.retentionDays', { infer: true });
    return this.isAllowedRetentionDays(configuredDays) ? configuredDays : DEFAULT_OPERATION_LOG_RETENTION_DAYS;
  }

  private async getStoredRetentionDaysCached(): Promise<number | null> {
    const now = Date.now();
    if (this.retentionDaysCache && this.retentionDaysCache.expiresAt > now) {
      return this.retentionDaysCache.days;
    }

    const days = await this.readStoredRetentionDays();
    this.retentionDaysCache = { days, expiresAt: now + RETENTION_CACHE_TTL_MS };
    return days;
  }

  private async readStoredRetentionDays(): Promise<number | null> {
    try {
      const row = await this.settingsRepo.findOne({ where: { key: OPERATION_LOG_RETENTION_SETTING_KEY } });
      if (!row) return null;

      const parsed = JSON.parse(row.value) as RetentionSettingValue;
      const days = Number(parsed.days);
      return this.isAllowedRetentionDays(days) ? days : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load operation log retention setting from system_settings: ${message}`);
      return null;
    }
  }

  private isAllowedRetentionDays(days: unknown): days is number {
    if (typeof days !== 'number') return false;
    return Number.isInteger(days) && days >= MIN_OPERATION_LOG_RETENTION_DAYS && days <= MAX_OPERATION_LOG_RETENTION_DAYS;
  }
}
