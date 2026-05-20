import { BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { encryptSecret } from 'src/common/crypto/aes.util';
import { AiSettingsService } from 'src/modules/admin/ai-settings/ai-settings.service';
import { TestAiSettingsDto, UpdateAiSettingsDto } from 'src/modules/admin/ai-settings/dto/update-ai-settings.dto';
import { validate } from 'class-validator';

function createService(input?: { row?: { key: string; value: string; isEncrypted: boolean }; httpGet?: jest.Mock }) {
  const repo = {
    findOne: jest.fn(async () => input?.row ?? null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const http = {
    get: input?.httpGet ?? jest.fn(() => of({ data: { data: [] } })),
  };
  return { service: new AiSettingsService(repo as never, http as never), repo, http };
}

describe('AiSettingsService', () => {
  it('returns decryptOk=true and masks api key when stored config decrypts', async () => {
    const stored = { provider: 'openai', apiKey: 'sk-1234567890', baseUrl: 'https://api.example.com/v1', model: 'gpt-test' };
    const { service } = createService({
      row: { key: 'ai.config', value: encryptSecret(JSON.stringify(stored)), isEncrypted: true },
    });

    const result = await service.getConfigPublic();

    expect(result.decryptOk).toBe(true);
    expect(result.hasApiKey).toBe(true);
    expect(result.apiKeyMasked).toBe('sk-1****7890');
    expect(result.baseUrl).toBe('https://api.example.com/v1');
  });

  it('returns decryptOk=false without fake defaults when encrypted config cannot be decrypted', async () => {
    const { service } = createService({
      row: { key: 'ai.config', value: 'invalid-encrypted-payload', isEncrypted: true },
    });

    const result = await service.getConfigPublic();

    expect(result.decryptOk).toBe(false);
    expect(result.hasApiKey).toBe(false);
    expect(result.baseUrl).toBe('');
    expect(result.model).toBe('');
    expect(result.error).toBeTruthy();
  });

  it('tests AI connection successfully without echoing api key', async () => {
    const httpGet = jest.fn(() => of({ data: { data: [] } }));
    const { service } = createService({ httpGet });

    const result = await service.testConnection({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret-key',
      model: 'gpt-test',
    });

    expect(result).toEqual({ success: true, model: 'gpt-test' });
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(httpGet).toHaveBeenCalledWith('https://api.example.com/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer secret-key' },
    }));
  });

  it('classifies AI connection 401 without echoing api key', async () => {
    const httpGet = jest.fn(() => throwError(() => ({ response: { status: 401, data: { error: { message: 'bad key' } } } })));
    const { service } = createService({ httpGet });

    const result = await service.testConnection({ baseUrl: 'https://api.example.com/v1', apiKey: 'secret-key' });

    expect(result.success).toBe(false);
    expect(result.fallbackReason).toBe('401');
    expect(result.detail).toContain('HTTP 401');
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('classifies AI connection timeout', async () => {
    const timeoutError = Object.assign(new Error('Timeout has occurred'), { name: 'TimeoutError' });
    const httpGet = jest.fn(() => throwError(() => timeoutError));
    const { service } = createService({ httpGet });

    const result = await service.testConnection({ baseUrl: 'https://api.example.com/v1', apiKey: 'secret-key' });

    expect(result.success).toBe(false);
    expect(result.fallbackReason).toBe('timeout');
  });

  it('updates model/baseUrl without provider or apiKey and keeps stored provider/key', async () => {
    const stored = { provider: 'deepseek', apiKey: 'sk-keep-secret', baseUrl: 'https://api.deepseek.com', model: 'old-model' };
    const row = { key: 'ai.config', value: encryptSecret(JSON.stringify(stored)), isEncrypted: true };
    const { service, repo } = createService({ row });

    const result = await service.updateConfig({ baseUrl: 'https://api.deepseek.com', model: 'new-model' });

    expect(result.provider).toBe('deepseek');
    expect(result.model).toBe('new-model');
    expect(result.hasApiKey).toBe(true);
    expect(result.apiKeyMasked).toBe('sk-k****cret');
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects invalid baseUrl at service layer', async () => {
    const { service } = createService();

    await expect(service.updateConfig({ provider: 'openai', baseUrl: 'not-a-url', model: 'gpt-test', apiKey: 'sk' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects explicitly empty baseUrl at service layer', async () => {
    const { service } = createService();

    await expect(service.updateConfig({ provider: 'openai', baseUrl: '', model: 'gpt-test', apiKey: 'sk' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unicode/control-character baseUrl at service layer', async () => {
    const { service } = createService();

    await expect(service.updateConfig({ provider: 'openai', baseUrl: 'http://例子.invalid/\u0000/v1', model: 'gpt-test', apiKey: 'sk' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates DTO baseUrl as http/https URL', async () => {
    const dto = new UpdateAiSettingsDto();
    dto.provider = 'openai';
    dto.baseUrl = 'ftp://example.com';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'baseUrl')).toBe(true);
  });

  it('validates DTO baseUrl empty string as invalid when explicitly provided', async () => {
    const dto = new UpdateAiSettingsDto();
    dto.provider = 'openai';
    dto.baseUrl = '';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'baseUrl')).toBe(true);
  });

  it('validates DTO unicode/control-character baseUrl as invalid', async () => {
    const dto = new UpdateAiSettingsDto();
    dto.provider = 'openai';
    dto.baseUrl = 'http://例子.invalid/\u0000/v1';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'baseUrl')).toBe(true);
  });

  it('validates test DTO baseUrl as http/https URL', async () => {
    const dto = new TestAiSettingsDto();
    dto.baseUrl = 'bad-url';

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'baseUrl')).toBe(true);
  });
});
