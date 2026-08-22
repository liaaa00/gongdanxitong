export const DEFAULT_MAX_IMPORT_SIZE_MB = 50;
export const DEFAULT_MAX_ATTACHMENT_SIZE_MB = 20;

const BYTES_PER_MB = 1024 * 1024;

export function parseUploadSizeMb(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMaxExcelUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  return parseUploadSizeMb(env.MAX_IMPORT_SIZE_MB, DEFAULT_MAX_IMPORT_SIZE_MB) * BYTES_PER_MB;
}

export function getMaxAttachmentUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  return parseUploadSizeMb(env.MAX_ATTACHMENT_SIZE_MB, DEFAULT_MAX_ATTACHMENT_SIZE_MB) * BYTES_PER_MB;
}
