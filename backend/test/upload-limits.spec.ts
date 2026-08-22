import {
  DEFAULT_MAX_ATTACHMENT_SIZE_MB,
  DEFAULT_MAX_IMPORT_SIZE_MB,
  getMaxAttachmentUploadBytes,
  getMaxExcelUploadBytes,
  parseUploadSizeMb,
} from 'src/config/upload-limits';

describe('upload size limits', () => {
  it('defaults Excel uploads to 50 MB and attachments to 20 MB', () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(DEFAULT_MAX_IMPORT_SIZE_MB).toBe(50);
    expect(DEFAULT_MAX_ATTACHMENT_SIZE_MB).toBe(20);
    expect(getMaxExcelUploadBytes(env)).toBe(50 * 1024 * 1024);
    expect(getMaxAttachmentUploadBytes(env)).toBe(20 * 1024 * 1024);
  });

  it('uses positive environment overrides', () => {
    const env = {
      MAX_IMPORT_SIZE_MB: '32',
      MAX_ATTACHMENT_SIZE_MB: '24',
    } as NodeJS.ProcessEnv;

    expect(getMaxExcelUploadBytes(env)).toBe(32 * 1024 * 1024);
    expect(getMaxAttachmentUploadBytes(env)).toBe(24 * 1024 * 1024);
  });

  it('falls back for invalid or non-positive values', () => {
    expect(parseUploadSizeMb(undefined, 50)).toBe(50);
    expect(parseUploadSizeMb('not-a-number', 50)).toBe(50);
    expect(parseUploadSizeMb('0', 50)).toBe(50);
    expect(parseUploadSizeMb('-1', 50)).toBe(50);
  });
});
