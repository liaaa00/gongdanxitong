import { Repository } from 'typeorm';
import { AttachmentsService } from 'src/modules/attachments/attachments.service';
import { OrderAttachment } from 'src/entities';
import { UploadsService } from 'src/modules/uploads/uploads.service';

describe('AttachmentsService.list field-name conversion', () => {
  function makeService(rows: Partial<OrderAttachment>[]) {
    const repo = {
      find: jest.fn(async () => rows as OrderAttachment[]),
      create: jest.fn((input: Partial<OrderAttachment>) => input as OrderAttachment),
      save: jest.fn(async (input: Partial<OrderAttachment>) => input as OrderAttachment),
    } as unknown as Repository<OrderAttachment>;
    const uploads = {} as unknown as UploadsService;
    return new AttachmentsService(repo, uploads);
  }

  it('returns snake_case fields and download_url so the frontend can show real file name / preview', async () => {
    const service = makeService([
      {
        id: 'att-1',
        workOrderId: 'wo-1',
        bizPurpose: 'resignation_material',
        fileId: 'file-9',
        fileName: 'stored-uuid.pdf',
        originalName: '离职证明.pdf',
        mimeType: 'application/pdf',
        filePath: '/data/stored-uuid.pdf',
        fileSize: 2048,
        status: 'uploaded',
      },
    ]);

    const result = (await service.list({ work_order_id: 'wo-1' })) as Record<string, unknown>[];

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.file_name).toBe('stored-uuid.pdf');
    expect(item.original_name).toBe('离职证明.pdf');
    expect(item.file_id).toBe('file-9');
    expect(item.file_size).toBe(2048);
    expect(item.download_url).toBe('/api/files/file-9');
    // must NOT leak raw camelCase entity fields
    expect(item).not.toHaveProperty('fileName');
    expect(item).not.toHaveProperty('originalName');
  });

  it('returns external hyperlink as download_url for link-only imported attachments', async () => {
    const service = makeService([
      {
        id: 'att-link',
        workOrderId: 'wo-1',
        bizPurpose: 'resignation_material',
        fileId: 'external:abc',
        fileName: 'proof.pdf',
        originalName: 'proof.pdf',
        mimeType: 'text/uri-list',
        filePath: 'https://example.com/proof.pdf',
        fileSize: 0,
        status: 'uploaded',
        metadata: { externalUrl: 'https://example.com/proof.pdf', source: 'excel_hyperlink' },
      },
    ]);

    const result = (await service.list({ work_order_id: 'wo-1' })) as Record<string, unknown>[];

    expect(result[0].download_url).toBe('https://example.com/proof.pdf');
    expect(result[0].metadata).toMatchObject({ source: 'excel_hyperlink' });
  });


  it('creates buffer and external-link attachments as received by default', async () => {
    const saved: Partial<OrderAttachment>[] = [];
    const repo = {
      create: jest.fn((input: Partial<OrderAttachment>) => input as OrderAttachment),
      save: jest.fn(async (input: Partial<OrderAttachment>) => {
        saved.push(input);
        return { ...input, id: `att-${saved.length}` } as OrderAttachment;
      }),
      find: jest.fn(),
    } as unknown as Repository<OrderAttachment>;
    const uploads = {
      save: jest.fn(async () => ({
        fileId: 'file-1',
        fileName: 'stored.png',
        originalName: 'photo.png',
        mimeType: 'image/png',
        filePath: '/uploads/attachment/stored.png',
        size: 10,
      })),
    } as unknown as UploadsService;
    const service = new AttachmentsService(repo, uploads);

    await service.createFromBuffer('wo-1', { buffer: Buffer.from('x'), originalName: 'photo.png', mimeType: 'image/png' }, 'user-1');
    await service.createFromExternalLink('wo-1', { url: 'https://example.com/a.png', originalName: 'a.png' }, 'user-1');

    expect(saved[0]).toMatchObject({ status: 'received' });
    expect(saved[0].receivedAt).toBeInstanceOf(Date);
    expect(saved[1]).toMatchObject({ status: 'received', filePath: 'https://example.com/a.png' });
    expect(saved[1].receivedAt).toBeInstanceOf(Date);
  });

});
