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
});
