import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsNumberString,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsNumberString()
  PORT?: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional()
  @IsString()
  DB_HOST?: string;

  @IsOptional()
  @IsNumberString()
  DB_PORT?: string;

  @IsOptional()
  @IsString()
  DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  DB_DATABASE?: string;

  @IsOptional()
  @IsString()
  DB_SCHEMA?: string;

  @IsOptional()
  @IsBooleanString()
  DB_LOGGING?: string;

  @IsOptional()
  @IsString()
  AI_PROVIDER?: string;

  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  @IsOptional()
  @IsString()
  AI_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  UPLOAD_DIR?: string;

  @IsOptional()
  @IsNumberString()
  MAX_IMPORT_SIZE_MB?: string;

  @IsOptional()
  @IsNumberString()
  MAX_ATTACHMENT_SIZE_MB?: string;

  @IsOptional()
  @IsNumberString()
  OPERATION_LOG_RETENTION_DAYS?: string;
}

export const validateEnv = (config: Record<string, unknown>): EnvironmentVariables => {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
};
