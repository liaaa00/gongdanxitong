import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from 'src/config/configuration';
import { SystemSetting } from 'src/entities';
import { UpdateOperationLogRetentionDto } from './dto/update-operation-log-retention.dto';

export const OPERATION_LOG_RETENTION_SETTING_KEY = 'operationLog.retentionDays';
export const DEFAULT_OPERATION_LOG_RETENTION_DAYS = 365;
export const MIN_OPERATION_LOG_RETENTION_DAYS = 7;
export const MAX_OPERATION_LOG_RETENTION_DAYS = 3650;

interface OperationLogRetentionStoredValue {
  days?: unknown;
}

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepo: Repository<SystemSetting>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async getOperationLogRetention(): Promise<{ days: number }> {
    const storedDays = await this.readStoredOperationLogRetentionDays();
    return { days: storedDays ?? this.resolveEnvRetentionDays() };
  }

  async updateOperationLogRetention(dto: UpdateOperationLogRetentionDto): Promise<{ days: number }> {
    const value = JSON.stringify({ days: dto.days });
    const row = await this.settingsRepo.findOne({ where: { key: OPERATION_LOG_RETENTION_SETTING_KEY } });

    if (row) {
      row.value = value;
      row.isEncrypted = false;
      await this.settingsRepo.save(row);
    } else {
      await this.settingsRepo.save(
        this.settingsRepo.create({
          key: OPERATION_LOG_RETENTION_SETTING_KEY,
          value,
          isEncrypted: false,
        }),
      );
    }

    return { days: dto.days };
  }

  private async readStoredOperationLogRetentionDays(): Promise<number | null> {
    try {
      const row = await this.settingsRepo.findOne({ where: { key: OPERATION_LOG_RETENTION_SETTING_KEY } });
      if (!row) return null;

      const parsed = JSON.parse(row.value) as OperationLogRetentionStoredValue;
      const days = Number(parsed.days);
      return this.isAllowedRetentionDays(days) ? days : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to load operation log retention setting from system_settings: ${message}`);
      return null;
    }
  }

  private resolveEnvRetentionDays(): number {
    const configuredDays = this.configService.get<number>('operationLog.retentionDays', { infer: true });
    return this.isAllowedRetentionDays(configuredDays) ? configuredDays : DEFAULT_OPERATION_LOG_RETENTION_DAYS;
  }

  private isAllowedRetentionDays(days: unknown): days is number {
    if (typeof days !== 'number') return false;
    return Number.isInteger(days) && days >= MIN_OPERATION_LOG_RETENTION_DAYS && days <= MAX_OPERATION_LOG_RETENTION_DAYS;
  }
}
