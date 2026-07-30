import { PassThrough, Readable } from 'stream';
import { FileController } from 'src/modules/upload/file.controller';
import { UploadService } from 'src/modules/upload/upload.service';

describe('FileController', () => {
  it('sets download headers and streams the file response', async () => {
    const uploadService = {
      createReadStream: jest.fn(async () => ({
        stream: Readable.from(['hello']),
        meta: {
          mimeType: 'text/plain',
          originalName: 'report.xlsx',
        },
      })),
    } as unknown as UploadService;

    const controller = new FileController(uploadService);
    const setHeader = jest.fn();
    const response = Object.assign(new PassThrough(), { setHeader });

    await controller.download('file-1', response as never);

    expect(uploadService.createReadStream).toHaveBeenCalledWith('file-1');
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain');
    expect(setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="report.xlsx"');
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('streams the file when the signed download token is valid', async () => {
    const uploadService = {
      verifyDownloadToken: jest.fn(() => true),
      createReadStream: jest.fn(async () => ({
        stream: Readable.from(['hello']),
        meta: { mimeType: 'application/pdf', originalName: '身份证.pdf' },
      })),
    } as unknown as UploadService;

    const controller = new FileController(uploadService);
    const setHeader = jest.fn();
    const response = Object.assign(new PassThrough(), { setHeader });

    await controller.downloadSigned('file-9', '123', 'sig-abc', response as never);

    expect(uploadService.verifyDownloadToken).toHaveBeenCalledWith('file-9', 123, 'sig-abc');
    expect(uploadService.createReadStream).toHaveBeenCalledWith('file-9');
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
  });

  it('rejects the signed download when the token is invalid or expired', async () => {
    const uploadService = {
      verifyDownloadToken: jest.fn(() => false),
      createReadStream: jest.fn(),
    } as unknown as UploadService;

    const controller = new FileController(uploadService);
    const response = Object.assign(new PassThrough(), { setHeader: jest.fn() });

    await expect(
      controller.downloadSigned('file-9', '1', 'bad-sig', response as never),
    ).rejects.toThrow('下载链接无效或已过期');
    expect(uploadService.createReadStream).not.toHaveBeenCalled();
  });
});
