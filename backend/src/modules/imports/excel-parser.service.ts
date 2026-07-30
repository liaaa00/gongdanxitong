import { HttpStatus, Injectable } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { businessException } from 'src/common/exceptions/business-exception';
import { ParsedAttachmentLink, ParsedSheet } from './types';

interface ParseOptions {
  headerRows?: 1 | 2;
}

interface HeaderDetection {
  startRow: number;
  headerRows: 1 | 2;
}

const TEMPLATE_META_ROW_LABELS = new Set(['是否必填', '填写要求', '填写示例', '备注说明', '涉及工单']);

// Structural template headers are not business data fields.
// Keep only the template label column as a placeholder;
// attachment columns stay visible so their cell hyperlinks can be detected.
const TEMPLATE_STRUCTURAL_HEADERS = new Set(['\u5b57\u6bb5\u540d']);

const KNOWN_FIELD_LABELS = [
  '客户名称', '客户代码', '外包类型', '岗位', '姓名', '身份证号码', '身份证号', '性别', '出生日期', '年龄',
  '户籍性质', '民族', '移动电话', '手机号', '电子邮件', '现住地址', '户籍地址', '邮编', '合同期限形式',
  '合同期限', '合同开始日期', '合同终止日期', '试用期开始日期', '试用期', '试用期结束日期', '工作城市',
  '工时制', '工作制周期', '工资形式', '基本工资', '其他工资', '试用期工资', '发薪周期', '发薪日期',
  '参保地', '起始月', '社保基数', '公积金基数', '公积金比例', '开户银行信息', '银行借记卡帐号',
  '银行借记卡账号', '备注', '业务模式', '人员类型', '是否企服发起劳动合同', '劳动合同主体', '劳动合同模板',
  '劳动合同签署是否需要催办员工', '劳动合同新签反馈', '劳动合同签订反馈', '入职材料是否需要集约收集', '入职联系反馈',
  '是否企服发薪', '发薪地', '特殊备注', '增员报岗录入反馈', '数据录入反馈',
  '岗位类型', '证件类型', '学历', '婚姻状况', '试用期其他工资', '是否电子签', '电子签平台',
  '甲方住所', '项目名称', '安排或调整工作的情况', '参保起始月', '反馈截止日期', '需要反馈截止日期',
  '是否为通用模板', '模板名称',
  '缴纳地区', '社保公积金停保月', '离职日期', '离职材料是否需要共享收集', '附件',
];

@Injectable()
export class ExcelParserService {
  async parseBuffer(buffer: Buffer, options: ParseOptions = {}): Promise<ParsedSheet> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as never);
    return this.parseWorksheet(workbook.worksheets[0], options);
  }

  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParsedSheet> {
    const workbook = new Workbook();
    await workbook.xlsx.readFile(filePath);
    return this.parseWorksheet(workbook.worksheets[0], options);
  }

  private parseWorksheet(worksheet: Worksheet | undefined, options: ParseOptions): ParsedSheet {
    if (!worksheet) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'Excel worksheet is empty');
    }

    const detected = options.headerRows
      ? { startRow: 1, headerRows: options.headerRows }
      : this.detectHeaders(worksheet);
    const headerRows = detected.headerRows;
    const headers = this.buildHeaders(worksheet, detected);
    if (headers.length === 0 || headers.every((header) => header.startsWith('__col_'))) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'Excel headers are empty');
    }
    if (headers.length > 100) {
      throw businessException(4400, HttpStatus.BAD_REQUEST, 'Excel has too many columns', { count: headers.length });
    }

    const rows: Array<Record<string, unknown>> = [];
    const rowNumbers: number[] = [];
    const attachmentLinks: ParsedAttachmentLink[] = [];
    const attachmentColumnIndexes = headers
      .map((header, index) => (this.isAttachmentHeader(header) ? index + 1 : null))
      .filter((index): index is number => index !== null);

    for (let rowNo = detected.startRow + headerRows; rowNo <= worksheet.rowCount; rowNo += 1) {
      const row = worksheet.getRow(rowNo);
      if (this.isTemplateMetaRow(row, headers.length)) {
        continue;
      }
      const record: Record<string, unknown> = {};
      let hasValue = false;
      for (let col = 1; col <= headers.length; col += 1) {
        const value = this.normalizeCellValue(row.getCell(col).value);
        if (value !== null && value !== '') {
          hasValue = true;
        }
        record[headers[col - 1]] = value;
      }
      if (hasValue) {
        rows.push(record);
        const physicalRowIndex = rowNo - 1;
        rowNumbers.push(physicalRowIndex);
        for (const col of attachmentColumnIndexes) {
          const link = this.readCellHyperlink(row.getCell(col).value);
          if (link) {
            attachmentLinks.push({
              rowIndex: physicalRowIndex,
              columnIndex: col - 1,
              header: headers[col - 1],
              text: link.text,
              hyperlink: link.hyperlink,
            });
          }
        }
      }
    }

    return {
      headers,
      rows,
      meta: {
        sheetName: worksheet.name,
        totalRows: rows.length,
        headerRows: detected.startRow + headerRows - 1,
        rowNumbers,
        attachmentLinks,
      },
    };
  }

  private detectHeaders(worksheet: Worksheet): HeaderDetection {
    const startRow = this.detectHeaderStartRow(worksheet);
    const headerRows = this.detectHeaderRows(worksheet, startRow);
    return { startRow, headerRows };
  }

  private detectHeaderStartRow(worksheet: Worksheet): number {
    const columnCount = Math.max(worksheet.columnCount, 1);
    let bestRow = 1;
    let bestScore = -1;
    const maxScanRows = Math.min(worksheet.rowCount, 10);

    for (let rowNo = 1; rowNo <= maxScanRows; rowNo += 1) {
      const row = worksheet.getRow(rowNo);
      const texts = this.rowTexts(worksheet, rowNo, columnCount);
      if (this.isTemplateMetaRow(row, columnCount)) {
        continue;
      }
      const score = this.headerRowScore(texts);
      if (score > bestScore) {
        bestScore = score;
        bestRow = rowNo;
      }
    }

    return bestRow;
  }

  private detectHeaderRows(worksheet: Worksheet, startRow = 1): 1 | 2 {
    if (worksheet.rowCount < startRow + 1) {
      return 1;
    }
    const columnCount = Math.max(worksheet.columnCount, 1);
    const first = this.rowTexts(worksheet, startRow, columnCount);
    const second = this.rowTexts(worksheet, startRow + 1, columnCount);
    const firstNonEmpty = first.filter((item) => item.length > 0);
    const secondNonEmpty = second.filter((item) => item.length > 0);

    if (firstNonEmpty.length === 0) {
      return 1;
    }
    if (secondNonEmpty.length === 0) {
      return 1;
    }

    if (this.isTemplateMetaRow(worksheet.getRow(startRow + 1), columnCount)) {
      return 1;
    }
    const secondDataLikeCount = secondNonEmpty.reduce(
      (count, value) => count + (this.looksLikeDataValue(value) ? 1 : 0),
      0,
    );
    const secondDataLikeRatio = secondNonEmpty.length > 0 ? secondDataLikeCount / secondNonEmpty.length : 0;
    if (secondDataLikeRatio >= 0.2) {
      return 1;
    }
    if (this.hasMergedCellsOnRow(worksheet, startRow) && this.headerRowScore(second) >= Math.max(4, this.headerRowScore(first))) {
      return 2;
    }
    if (this.hasRepeatedLabels(firstNonEmpty)) {
      return 2;
    }
    if (this.looksLikeSparseGroupHeader(firstNonEmpty, secondNonEmpty)) {
      return 2;
    }

    return 1;
  }

  private buildHeaders(worksheet: Worksheet, detection: HeaderDetection): string[] {
    const columnCount = Math.max(worksheet.columnCount, 1);
    const first = this.rowTexts(worksheet, detection.startRow, columnCount);
    const second = detection.headerRows === 2 ? this.rowTexts(worksheet, detection.startRow + 1, columnCount) : [];
    const headers: string[] = [];

    for (let index = 0; index < columnCount; index += 1) {
      const a = first[index] ?? '';
      const b = second[index] ?? '';
      let header = '';
      if (detection.headerRows === 2) {
        if (a && b && a !== b) header = `${a}/${b}`;
        else header = a || b;
      } else {
        header = a;
      }
      const normalized = this.normalizeHeader(header);
      const finalHeader = normalized && !TEMPLATE_STRUCTURAL_HEADERS.has(normalized)
        ? normalized
        : `__col_${index + 1}__`;
      headers.push(finalHeader);
    }
    return this.ensureUniqueHeaders(headers);
  }

  private rowTexts(worksheet: Worksheet, rowNo: number, columnCount = worksheet.columnCount): string[] {
    const row = worksheet.getRow(rowNo);
    const texts: string[] = [];
    for (let col = 1; col <= columnCount; col += 1) {
      const value = this.normalizeCellValue(row.getCell(col).value);
      texts.push(typeof value === 'string' ? value : value === null ? '' : String(value));
    }
    return texts;
  }

  private ensureUniqueHeaders(headers: string[]): string[] {
    const seen = new Map<string, number>();
    return headers.map((header, index) => {
      const base = header || `__col_${index + 1}__`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}__${count + 1}`;
    });
  }

  private headerRowScore(values: string[]): number {
    const nonEmpty = values.filter((item) => item.length > 0);
    const knownHits = nonEmpty.reduce((count, value) => count + (this.matchesKnownFieldLabel(value) ? 1 : 0), 0);
    const dataLikeCount = nonEmpty.reduce((count, value) => count + (this.looksLikeDataValue(value) ? 1 : 0), 0);
    const metaPenalty = TEMPLATE_META_ROW_LABELS.has(nonEmpty[0] ?? '') ? 100 : 0;
    const densityScore = Math.min(nonEmpty.length, 80) * 0.1;
    return knownHits * 10 + densityScore - dataLikeCount * 3 - metaPenalty;
  }

  private matchesKnownFieldLabel(value: string): boolean {
    const normalized = this.normalizeForMatch(value);
    if (!normalized) {
      return false;
    }
    return KNOWN_FIELD_LABELS.some((label) => {
      const field = this.normalizeForMatch(label);
      return normalized === field || normalized.includes(field) || field.includes(normalized);
    });
  }

  private isTemplateMetaRow(row: { getCell: (col: number) => { value: unknown } }, columnCount: number): boolean {
    const firstValue = this.normalizeCellValue(row.getCell(1).value);
    const firstText = typeof firstValue === 'string' ? firstValue.trim() : firstValue === null ? '' : String(firstValue).trim();
    if (TEMPLATE_META_ROW_LABELS.has(firstText)) {
      return true;
    }

    let nonEmpty = 0;
    let requiredLike = 0;
    for (let col = 1; col <= columnCount; col += 1) {
      const value = this.normalizeCellValue(row.getCell(col).value);
      const text = typeof value === 'string' ? value.trim() : value === null ? '' : String(value).trim();
      if (!text) {
        continue;
      }
      nonEmpty += 1;
      if (/^(必填|非必填|必填？|必填\/非必填)$/.test(text)) {
        requiredLike += 1;
      }
    }
    return nonEmpty > 0 && requiredLike / nonEmpty >= 0.6;
  }

  private hasRepeatedLabels(values: string[]): boolean {
    return new Set(values).size < values.length;
  }

  private looksLikeSparseGroupHeader(first: string[], second: string[]): boolean {
    if (first.length === 0 || second.length === 0) {
      return false;
    }
    if (first.length < second.length) {
      return true;
    }
    const distinctRatio = new Set(first).size / Math.max(first.length, 1);
    const secondLooksLikeData = second.some((value) => this.looksLikeDataValue(value));
    return distinctRatio <= 0.6 && !secondLooksLikeData;
  }

  private looksLikeDataValue(value: string): boolean {
    const text = String(value ?? '').trim();
    if (!text) return false;
    if (/@/.test(text)) return true;
    if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(text)) return true;
    if (/\d{6,}/.test(text)) return true;
    if (/^(是|否|有|无|男|女|已通过|未通过|审批中|已完成|已拒绝|已撤销|进行中|待处理|草稿|提交|通过|拒绝)$/.test(text)) return true;
    if (/^企?服?\d{6,}$/.test(text)) return true;
    if (/^[A-Z]{2,}\d{4,}$/.test(text)) return true;
    return false;
  }

  private hasMergedCellsOnRow(worksheet: Worksheet, rowNo: number): boolean {
    const merges = (worksheet as unknown as { _merges?: Record<string, unknown> })._merges ?? {};
    return Object.keys(merges).some((range) => this.rangeTouchesRow(range, rowNo));
  }

  private rangeTouchesRow(range: string, rowNo: number): boolean {
    const match = range.match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/);
    if (!match) {
      return false;
    }
    const start = Number(match[1]);
    const end = Number(match[2]);
    return rowNo >= start && rowNo <= end;
  }

  private normalizeHeader(value: string): string {
    return value.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private normalizeForMatch(value: string): string {
    return this.normalizeHeader(value)
      .toLowerCase()
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/\([^)]*\)/g, '')
      .replace(/[\s\-_()/【】\[\]{}:：，,。\.；;、*"'“”‘’]/g, '')
      .replace(/的|之|是否/g, '')
      .trim();
  }

  private isAttachmentHeader(header: string): boolean {
    return /attachment|\u9644\u4ef6/i.test(this.normalizeHeader(header));
  }

  private readCellHyperlink(value: unknown): { text: string; hyperlink: string } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const hyperlink = typeof record.hyperlink === 'string' ? record.hyperlink.trim() : '';
    if (!hyperlink) {
      return null;
    }
    const textValue = this.normalizeCellValue(record.text) ?? hyperlink;
    const text = String(textValue).trim();
    return { text: text || hyperlink, hyperlink };
  }

  private normalizeCellValue(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.replace(/　/g, ' ').trim();
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (record.result !== undefined) return this.normalizeCellValue(record.result);
      if (record.text !== undefined) return this.normalizeCellValue(record.text);
      if (record.richText && Array.isArray(record.richText)) {
        return record.richText
          .map((part) => (typeof part === 'object' && part !== null && 'text' in part ? String((part as { text: unknown }).text) : ''))
          .join('')
          .trim();
      }
    }
    return String(value).trim();
  }
}
