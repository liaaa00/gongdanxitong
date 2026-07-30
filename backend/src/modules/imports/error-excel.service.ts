import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { UploadsService } from 'src/modules/uploads/uploads.service';

export interface ImportErrorRow {
  rowNo: number;
  raw: Record<string, unknown>;
  fieldCode?: string;
  message: string;
}

@Injectable()
export class ImportErrorExcelService {
  constructor(private readonly uploadsService: UploadsService) {}

  async generate(input: { jobId: string; headers: string[]; errors: ImportErrorRow[]; ownerId?: string }): Promise<string | null> {
    if (input.errors.length === 0) {
      return null;
    }

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('errors');
    sheet.columns = [
      ...input.headers.map((header) => ({ header, key: header, width: Math.max(12, header.length + 4) })),
      { header: '__error_row', key: '__error_row', width: 12 },
      { header: '__error_field', key: '__error_field', width: 24 },
      { header: '__error_message', key: '__error_message', width: 60 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const error of input.errors) {
      const row = sheet.addRow({
        ...error.raw,
        __error_row: error.rowNo,
        __error_field: error.fieldCode ?? '',
        __error_message: error.message,
      });
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5E5' } };
      });
    }

    const summary = workbook.addWorksheet('summary');
    summary.addRow(['jobId', input.jobId]);
    summary.addRow(['failRows', input.errors.length]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const meta = await this.uploadsService.save({
      ownerId: input.ownerId ?? 'system',
      kind: 'import-error',
      buffer,
      originalName: `import-errors-${input.jobId}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return `/api/files/${meta.fileId}`;
  }
}
