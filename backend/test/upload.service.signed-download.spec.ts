import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/modules/upload/upload.service';

const makeService = (secret = 'test-secret'): UploadService => {
  const configService = {
    get: jest.fn((key: string) => (key === 'app.jwtSecret' ? secret : undefined)),
  } as unknown as ConfigService;
  return new UploadService(configService);
};

const parseToken = (url: string): { fileId: string; exp: number; sig: string } => {
  const query = new URL(url).searchParams;
  return {
    fileId: query.get('fileId') ?? '',
    exp: Number(query.get('exp')),
    sig: query.get('sig') ?? '',
  };
};

describe('UploadService signed download token', () => {
  it('generates a signed URL that verifies successfully', () => {
    const service = makeService();
    const url = service.buildSignedDownloadUrl('http://localhost:3000', 'file-123');
    const { fileId, exp, sig } = parseToken(url);

    expect(url).toContain('/api/files/download?fileId=file-123');
    expect(service.verifyDownloadToken(fileId, exp, sig)).toBe(true);
  });

  it('rejects a tampered fileId', () => {
    const service = makeService();
    const { exp, sig } = parseToken(service.buildSignedDownloadUrl('http://localhost:3000', 'file-123'));
    expect(service.verifyDownloadToken('file-999', exp, sig)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const service = makeService();
    const { fileId, exp } = parseToken(service.buildSignedDownloadUrl('http://localhost:3000', 'file-123'));
    expect(service.verifyDownloadToken(fileId, exp, 'deadbeef')).toBe(false);
  });

  it('rejects an expired token', () => {
    const service = makeService();
    const url = service.buildSignedDownloadUrl('http://localhost:3000', 'file-123', -1000);
    const { fileId, exp, sig } = parseToken(url);
    expect(service.verifyDownloadToken(fileId, exp, sig)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const signer = makeService('secret-A');
    const verifier = makeService('secret-B');
    const { fileId, exp, sig } = parseToken(signer.buildSignedDownloadUrl('http://localhost:3000', 'file-123'));
    expect(verifier.verifyDownloadToken(fileId, exp, sig)).toBe(false);
  });

  it('rejects malformed inputs', () => {
    const service = makeService();
    expect(service.verifyDownloadToken('', 123, 'sig')).toBe(false);
    expect(service.verifyDownloadToken('file', Number.NaN, 'sig')).toBe(false);
    expect(service.verifyDownloadToken('file', 123, '')).toBe(false);
  });
});
