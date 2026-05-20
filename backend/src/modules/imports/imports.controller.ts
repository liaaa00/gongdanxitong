import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { WORK_ORDER_CREATOR_ROLES } from 'src/common/auth/role-permissions';
import { Roles } from 'src/common/decorators/roles.decorator';
import { businessException } from 'src/common/exceptions/business-exception';
import { JwtUserPayload } from 'src/modules/auth/auth.types';
import { UploadsService } from 'src/modules/uploads/uploads.service';
import { FieldsService } from 'src/modules/admin/fields/fields.service';
import { ConfirmImportDto, ConfirmNewFieldDto } from './dto/confirm-import.dto';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ImportJobService } from './import-job.service';

const excelFilter = (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void): void => {
  const ok = file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls');
  callback(ok ? null : new Error('invalid_excel'), ok);
};

@Controller('work-orders')
export class ImportsController {
  constructor(
    private readonly importJobService: ImportJobService,
    private readonly uploadsService: UploadsService,
    private readonly fieldsService: FieldsService,
  ) {}

  @Post('import/preview')
  @Roles(...WORK_ORDER_CREATOR_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: excelFilter }))
  async preview(
    @Body() payload: PreviewImportDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtUserPayload,
  ) {
    let fileId = payload.fileId?.trim();
    if (!fileId && file) {
      const meta = await this.uploadsService.save({
        ownerId: user.sub,
        kind: 'excel',
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
      });
      fileId = meta.fileId;
    }
    if (!fileId) {
      throw businessException(4400, 400, 'Excel fileId is required');
    }
    return this.importJobService.preview({
      user,
      fileId,
      orderType: payload.orderType,
      sampleRows: payload.sampleRows,
    });
  }

  @Post('import/confirm')
  @Roles(...WORK_ORDER_CREATOR_ROLES)
  async confirm(@Body() payload: ConfirmImportDto, @CurrentUser() user: JwtUserPayload) {
    if (payload.newFields && payload.newFields.length > 0) {
      const headerToFieldCode = await this.materializeNewFields(payload.newFields, payload.orderType);
      this.applyNewFieldsToPayload(payload, headerToFieldCode);
    }
    const normalizedMapping = this.normalizeMapping(payload);
    return this.importJobService.createJob({
      user,
      fileId: payload.fileId,
      orderType: payload.orderType,
      mapping: normalizedMapping.mapping,
      autoSubmit: payload.autoSubmit,
      defaults: normalizedMapping.defaults,
      jobName: payload.jobName,
    });
  }

  private async materializeNewFields(
    newFields: ConfirmNewFieldDto[],
    orderType: ConfirmImportDto['orderType'],
  ): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const field of newFields) {
      const fieldCode = `f_${this.slugify(field.fieldName)}_${randomBytes(3).toString('hex')}`;
      await this.fieldsService.create({
        fieldCode,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        isRequired: field.required ?? false,
        defaultRequired: false,
        orderType,
        businessContext: [orderType],
        isActive: true,
        displayOrder: 999,
      });
      result[field.header] = fieldCode;
    }
    return result;
  }

  private applyNewFieldsToPayload(
    payload: ConfirmImportDto,
    headerToFieldCode: Record<string, string>,
  ): void {
    if (payload.finalMapping && payload.finalMapping.length > 0) {
      for (const [header, fieldCode] of Object.entries(headerToFieldCode)) {
        const existing = payload.finalMapping.find((m) => m.header === header);
        if (existing) {
          existing.fieldCode = fieldCode;
        } else {
          payload.finalMapping.push({ header, fieldCode });
        }
      }
      return;
    }
    payload.mapping = { ...(payload.mapping ?? {}), ...headerToFieldCode };
  }

  private slugify(name: string): string {
    const cleaned = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
    return cleaned || 'field';
  }

  @Get('import/:jobId')
  async getJob(@Param('jobId') jobId: string, @CurrentUser() user: JwtUserPayload) {
    return this.importJobService.getJob(jobId, user);
  }

  @Post('import/:jobId/cancel')
  async cancel(@Param('jobId') jobId: string, @CurrentUser() user: JwtUserPayload) {
    return this.importJobService.cancel(jobId, user);
  }

  @Get('import/:jobId/error-report')
  async errorReport(@Param('jobId') jobId: string, @CurrentUser() user: JwtUserPayload, @Res({ passthrough: true }) res: Response) {
    const report = await this.importJobService.getErrorReport(jobId, user);
    res.setHeader('Content-Type', report.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(report.fileName)}"`);
    return res.download(report.filePath, report.fileName);
  }

  // Frontend compat alias: services/workOrders.ts and components/ExcelUploader/index.tsx
  // build URLs as /work-orders/import/jobs/:jobId/error-report
  @Get('import/jobs/:jobId/error-report')
  async errorReportAlias(
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.errorReport(jobId, user, res);
  }

  private normalizeMapping(payload: ConfirmImportDto): { mapping: Record<string, string>; defaults: Record<string, unknown> } {
    if (payload.finalMapping && payload.finalMapping.length > 0) {
      const mapping: Record<string, string> = {};
      const defaults: Record<string, unknown> = { ...(payload.defaults ?? {}) };
      for (const item of payload.finalMapping) {
        mapping[item.header] = item.fieldCode;
        if (item.defaultValue !== undefined && item.defaultValue !== null && String(item.defaultValue).trim().length > 0) {
          defaults[item.fieldCode] = item.defaultValue;
        }
      }
      return { mapping, defaults };
    }

    return { mapping: payload.mapping ?? {}, defaults: payload.defaults ?? {} };
  }
}
