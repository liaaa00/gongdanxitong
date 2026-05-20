import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

type AiProvider = 'openai' | 'qwen' | 'deepseek';

function IsHttpUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isHttpUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'string') return false;
          const trimmed = value.trim();
          if (!trimmed) return false;
          if (trimmed !== value) return false;
          if (/[^\x21-\x7E]/.test(trimmed)) return false;
          try {
            const parsed = new URL(trimmed);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid http/https URL`;
        },
      },
    });
  };
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsString()
  @IsIn(['openai', 'qwen', 'deepseek'])
  provider?: AiProvider;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  api_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsUrl({ require_protocol: true, require_tld: false })
  @IsHttpUrl({ message: 'baseUrl must be a valid http/https URL' })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsUrl({ require_protocol: true, require_tld: false })
  @IsHttpUrl({ message: 'base_url must be a valid http/https URL' })
  base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}

export class TestAiSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  api_key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsUrl({ require_protocol: true, require_tld: false })
  @IsHttpUrl({ message: 'baseUrl must be a valid http/https URL' })
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @IsUrl({ require_protocol: true, require_tld: false })
  @IsHttpUrl({ message: 'base_url must be a valid http/https URL' })
  base_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;
}
