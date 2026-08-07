import { Workbook } from 'exceljs';
import * as JSZip from 'jszip';
import { ExportTemplatesService } from 'src/modules/admin/export-templates/export-templates.service';

describe('contract attachment export', () => {
  function makeService(rows: Array<Record<string, unknown>>) {
    const attachmentRepository = {
      find: jest.fn(async () => rows),
    };
    const upload = {
      buildSignedDownloadUrl: jest.fn((base: string, id: string) => base + '/api/files/' + id),
      resolveFile: jest.fn(async () => ({
        filePath: process.cwd() + '/src/assets/certificates/income-certificate.docx',
      })),
      saveBuffer: jest.fn(async ({ originalName }: { originalName: string }) => ({
        fileId: 'zip-file',
        originalName,
      })),
    };
    const service = new ExportTemplatesService(
      { findOne: jest.fn() } as never,
      { findOne: jest.fn() } as never,
      { create: jest.fn((value) => value), save: jest.fn() } as never,
      { find: jest.fn(async () => []) } as never,
      attachmentRepository as never,
      upload as never,
    );
    return { service, upload, attachmentRepository };
  }

  it('adds an attachment index and preserves multiple employee links', async () => {
    const rows = [
      { workOrderId: 'wo-1', originalName: '劳动合同.docx', fileId: 'file-1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { workOrderId: 'wo-1', originalName: '补充协议.pdf', fileId: 'file-2', mimeType: 'application/pdf' },
    ];
    const { service } = makeService(rows);
    const workbook = new Workbook();
    const entries = await (service as any).appendContractAttachmentIndex(workbook, [{
      parentOrder: { id: 'wo-1', employeeName: '张三', employeeIdCard: '330206199001011234', extraData: {} },
    }]);
    expect(entries).toHaveLength(2);
    const sheet = workbook.getWorksheet('附件索引');
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.getCell(2, 1).value).toBe('张三');
    expect(sheet?.getCell(2, 2).value).toBe('1234');
    expect(sheet?.getCell(2, 4).value).toEqual(expect.objectContaining({ hyperlink: expect.stringContaining('file-1') }));
  });

  it('loads contract attachments stored against the dispatched order', async () => {
    const { service, attachmentRepository } = makeService([{
      workOrderId: 'wo-1',
      dispatchedOrderId: 'do-1',
      bizPurpose: 'contract_material',
      originalName: '劳动合同.pdf',
      fileId: 'file-1',
      mimeType: 'application/pdf',
    }]);
    const workbook = new Workbook();
    const entries = await (service as any).appendContractAttachmentIndex(workbook, [{
      id: 'do-1',
      parentOrder: { id: 'wo-1', employeeName: '张三', employeeIdCard: '330206199001011234', extraData: {} },
    }]);

    expect(entries).toHaveLength(1);
    expect(entries[0].order.id).toBe('do-1');
    expect(workbook.getWorksheet('附件索引')?.getCell(2, 3).value).toBe('劳动合同.pdf');
    expect(attachmentRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.arrayContaining([
        expect.objectContaining({ workOrderId: expect.anything(), bizPurpose: expect.anything() }),
        expect.objectContaining({ dispatchedOrderId: expect.anything(), bizPurpose: expect.anything() }),
      ]),
      select: expect.arrayContaining(['workOrderId', 'dispatchedOrderId']),
    }));
  });

  it('writes employee folders and attachment bytes into the ZIP', async () => {
    const { service, upload } = makeService([]);
    const result = await (service as any).buildContractAttachmentsZip([{
      order: { parentOrder: { id: 'wo-1', employeeName: '张三', employeeIdCard: '330206199001011234', extraData: {} } },
      row: { workOrderId: 'wo-1', originalName: 'income-certificate.docx', fileId: 'file-1', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    }], '劳动合同批导出');
    expect(result.originalName).toContain('.zip');
    const captured = (upload.saveBuffer as jest.Mock).mock.calls[0][0].buffer as Buffer;
    const zip = await JSZip.loadAsync(captured);
    const names = Object.keys(zip.files);
    expect(names).toContain('张三-1234/income-certificate.docx');
    expect((await zip.file('张三-1234/income-certificate.docx')?.async('nodebuffer'))?.length).toBeGreaterThan(0);
  });

  it('returns both Excel and attachment ZIP from the batch export entry point', async () => {
    const order = {
      id: 'do-1',
      moduleCode: 'contract',
      visibleFields: ['employee_name'],
      status: 'pending',
      dispatchedAt: new Date('2026-08-07T00:00:00.000Z'),
      acceptedAt: null,
      completedAt: null,
      parentOrder: {
        id: 'wo-1',
        orderNo: 'ON-1',
        employeeName: '张三',
        employeeIdCard: '330206199001011234',
        businessScope: 'beilun',
        extraData: { employee_name: '张三', esign_platform: '速创' },
        creator: { realName: '业务员' },
      },
    };
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [order]),
    };
    const template = {
      id: 'template-contract',
      templateName: '劳动合同签订批导出模板-速创',
      moduleCode: 'contract',
      fieldList: [{ fieldCode: 'employee_name', alias: '姓名', order: 1 }],
      createdBy: 'admin',
      isShared: true,
      signPlatform: '速创',
      businessScope: 'beilun',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    const savedBuffers: Array<{ buffer: Buffer; mimeType: string; originalName: string }> = [];
    const upload = {
      buildSignedDownloadUrl: jest.fn((base: string, id: string) => base + '/api/files/' + id),
      resolveFile: jest.fn(async () => ({
        filePath: process.cwd() + '/src/assets/certificates/income-certificate.docx',
      })),
      saveBuffer: jest.fn(async (value: { buffer: Buffer; mimeType: string; originalName: string }) => {
        savedBuffers.push(value);
        const isZip = value.mimeType === 'application/zip';
        return { fileId: isZip ? 'zip-file' : 'excel-file', originalName: value.originalName };
      }),
    };
    const service = new ExportTemplatesService(
      { findOne: jest.fn(async () => template), create: jest.fn((value) => value) } as never,
      { createQueryBuilder: jest.fn(() => queryBuilder) } as never,
      { create: jest.fn((value) => value), save: jest.fn(async (value) => value) } as never,
      { find: jest.fn(async () => [{ fieldCode: 'employee_name', fieldName: '姓名', dropdownOptions: null }]) } as never,
      { find: jest.fn(async () => [{
        workOrderId: 'wo-1',
        originalName: '劳动合同.docx',
        fileId: 'attachment-1',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }]) } as never,
      upload as never,
    );
    jest.spyOn(service as any, 'tryBuildStandardTemplateWorkbook').mockResolvedValue(null);

    const result = await service.exportDispatchedOrdersAuto(
      ['do-1'],
      undefined,
      { sub: 'handler-1', businessScope: 'beilun' } as never,
    );

    expect(result.files).toEqual([
      expect.objectContaining({ fileId: 'excel-file', fileType: 'excel' }),
      expect.objectContaining({ fileId: 'zip-file', fileType: 'attachments_zip' }),
    ]);
    const excelBuffer = savedBuffers.find((item) => item.mimeType.includes('spreadsheet'))?.buffer;
    expect(excelBuffer).toBeDefined();
    const workbook = new Workbook();
    await workbook.xlsx.load(excelBuffer as never);
    expect(workbook.getWorksheet('附件索引')?.getCell(2, 1).value).toBe('张三');
    expect(workbook.getWorksheet('附件索引')?.getCell(2, 4).value).toEqual(
      expect.objectContaining({ hyperlink: expect.stringContaining('attachment-1') }),
    );

    const zipBuffer = savedBuffers.find((item) => item.mimeType === 'application/zip')?.buffer;
    const zip = await JSZip.loadAsync(zipBuffer!);
    expect(zip.file('张三-1234/劳动合同.docx')).toBeTruthy();
  });
});
