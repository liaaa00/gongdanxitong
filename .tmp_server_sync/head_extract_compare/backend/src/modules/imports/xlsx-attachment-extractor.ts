import * as JSZip from 'jszip';

interface EmbeddedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
};

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function mimeOf(name: string): string {
  return MIME_BY_EXT[extOf(name)] ?? 'application/octet-stream';
}

function parseXml(xml: string): string {
  return xml;
}

/**
 * 从 xl/worksheets/_rels/sheet1.xml.rels 提取 rId → ZIP 内路径映射。
 * 只保留 embeddings 和 media 目录下的引用。
 */
function parseRels(relsXml: string, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) !== null) {
    const rId = m[1];
    const target = m[2];
    if (target.includes('embeddings/') || target.includes('media/') || target.includes('drawings/')) {
      const resolved = target.startsWith('..') ? `xl/${target.replace(/^\.\.\//, '')}` : `${baseDir}/${target}`.replace(/\/\//g, '/');
      map.set(rId, resolved);
    }
  }
  return map;
}

/**
 * 从 drawing*.xml 提取 rId → rowIndex(0-indexed) 映射。
 * 同时支持 twoCellAnchor 和 oneCellAnchor。
 */
function parseDrawingRows(drawingXml: string): Map<string, number> {
  const map = new Map<string, number>();
  // 匹配 twoCellAnchor 或 oneCellAnchor 块
  const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
  let anchor: RegExpExecArray | null;
  while ((anchor = anchorRe.exec(drawingXml)) !== null) {
    const block = anchor[1];
    // 取 from.row
    const rowMatch = block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    if (!rowMatch) continue;
    const rowIndex = parseInt(rowMatch[1], 10);
    // 取 blipFill rEmbed 或 pic:blipFill a:blip rEmbed
    const rIdMatch = block.match(/r:embed="([^"]+)"/);
    if (!rIdMatch) continue;
    map.set(rIdMatch[1], rowIndex);
  }
  return map;
}

/**
 * 从 vmlDrawing*.vml 提取 rId → rowIndex(0-indexed) 映射（老版本 Excel OLE）。
 */
function parseVmlRows(vmlXml: string): Map<string, number> {
  const map = new Map<string, number>();
  const shapeRe = /<v:shape[^>]*>([\s\S]*?)<\/v:shape>/g;
  let shape: RegExpExecArray | null;
  while ((shape = shapeRe.exec(vmlXml)) !== null) {
    const block = shape[1];
    // 行号在 <x:Row>数字</x:Row>（0-indexed）
    const rowMatch = block.match(/<x:Row>(\d+)<\/x:Row>/);
    const rIdMatch = block.match(/r:id="([^"]+)"/);
    if (!rowMatch || !rIdMatch) continue;
    map.set(rIdMatch[1], parseInt(rowMatch[1], 10));
  }
  return map;
}

/**
 * 给定 xlsx Buffer，返回 rowIndex(0-indexed) → 嵌入文件列表的映射。
 * 解析失败时安静返回空 Map，不中断调用方逻辑。
 */
const EMU_PER_PIXEL = 9525;
const DEFAULT_ROW_HEIGHT_PT = 14;
const DEFAULT_COL_WIDTH = 9;
const POINTS_PER_PIXEL = 0.75;

function attrNumber(attrs: string, name: string): number | null {
  const match = attrs.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function excelColumnWidthToPixels(width: number): number {
  return Math.floor(width * 7 + 5);
}

function rowHeightToPixels(heightPt: number): number {
  return Math.max(1, Math.round(heightPt / POINTS_PER_PIXEL));
}

function columnNameToNumber(name: string): number {
  let value = 0;
  for (const ch of name.toUpperCase()) {
    value = value * 26 + ch.charCodeAt(0) - 64;
  }
  return value;
}

function parseSheetMetrics(sheetXml: string): { rowPixels: number[] } {
  const dimensionMatch = sheetXml.match(/<dimension[^>]+ref="[A-Z]+\d+:([A-Z]+)(\d+)"/);
  const maxColumn = dimensionMatch ? columnNameToNumber(dimensionMatch[1]) : 64;
  const maxRow = dimensionMatch ? Number(dimensionMatch[2]) : 1000;
  const columnWidths = Array.from({ length: Math.max(maxColumn, 64) }, () => DEFAULT_COL_WIDTH);
  const colRe = /<col\s+([^>]*)\/>/g;
  let col: RegExpExecArray | null;
  while ((col = colRe.exec(sheetXml)) !== null) {
    const min = attrNumber(col[1], 'min');
    const max = attrNumber(col[1], 'max');
    const width = attrNumber(col[1], 'width');
    if (!min || !max || !width) continue;
    for (let index = min; index <= Math.min(max, columnWidths.length); index += 1) {
      columnWidths[index - 1] = width;
    }
  }

  const defaultRowHeightMatch = sheetXml.match(/<sheetFormatPr[^>]+defaultRowHeight="([^"]+)"/);
  const defaultRowHeight = defaultRowHeightMatch ? Number(defaultRowHeightMatch[1]) : DEFAULT_ROW_HEIGHT_PT;
  const rowHeights = Array.from({ length: Math.max(maxRow, 1000) }, () => defaultRowHeight);
  const rowRe = /<row\s+([^>]*)>/g;
  let row: RegExpExecArray | null;
  while ((row = rowRe.exec(sheetXml)) !== null) {
    const rowNo = attrNumber(row[1], 'r');
    const height = attrNumber(row[1], 'ht');
    if (!rowNo || !height || rowNo > rowHeights.length) continue;
    rowHeights[rowNo - 1] = height;
  }

  // Touch columnWidths so the conversion helper remains covered when future cellImages include x-axis mapping.
  columnWidths.map(excelColumnWidthToPixels);
  return { rowPixels: rowHeights.map(rowHeightToPixels) };
}

function offsetToIndex(offsetEmu: number, sizesPx: number[]): number {
  let remaining = Math.max(0, offsetEmu / EMU_PER_PIXEL);
  for (let index = 0; index < sizesPx.length; index += 1) {
    if (remaining < sizesPx[index]) return index;
    remaining -= sizesPx[index];
  }
  return Math.max(0, sizesPx.length - 1);
}

function parseWpsCellImageRows(cellImagesXml: string, sheetXml: string): Map<string, number> {
  const map = new Map<string, number>();
  const { rowPixels } = parseSheetMetrics(sheetXml);
  const imageRe = /<etc:cellImage[\s\S]*?<\/etc:cellImage>/g;
  let image: RegExpExecArray | null;
  while ((image = imageRe.exec(cellImagesXml)) !== null) {
    const block = image[0];
    const rIdMatch = block.match(/r:embed="([^"]+)"/);
    const offMatch = block.match(/<a:off\s+([^>]*)\/>/);
    if (!rIdMatch || !offMatch) continue;
    const y = attrNumber(offMatch[1], 'y');
    if (y === null) continue;
    map.set(rIdMatch[1], offsetToIndex(y, rowPixels));
  }
  return map;
}

export async function extractXlsxEmbeddedAttachments(
  xlsxBuffer: Buffer,
): Promise<Map<number, EmbeddedFile[]>> {
  const result = new Map<number, EmbeddedFile[]>();
  try {
    const zip = await JSZip.loadAsync(xlsxBuffer);
    console.log('[附件提取] ZIP文件加载成功，总文件数:', Object.keys(zip.files).length);

    // 1. 找 sheet1 的 rels 文件
    const relsKey = 'xl/worksheets/_rels/sheet1.xml.rels';
    const relsFile = zip.file(relsKey);
    if (!relsFile) {
      console.log('[attachment extract] sheet1.xml.rels not found; trying WPS cellImages');
    }
    const relsXml = relsFile ? await relsFile.async('string') : '';
    const rIdToPath = relsFile ? parseRels(parseXml(relsXml), 'xl/worksheets') : new Map<string, string>();
    console.log('[附件提取] sheet1.xml.rels 解析出的 rId → Path 映射:', rIdToPath.size, '个');

    // 2. 尝试读 drawing*.xml 映射 rId → row
    const rIdToRow = new Map<string, number>();

    const drawingFiles = Object.keys(zip.files).filter((k) => /xl\/drawings\/drawing\d+\.xml$/.test(k));
    console.log('[附件提取] 找到 drawing 文件:', drawingFiles.length, '个', drawingFiles);
    for (const dk of drawingFiles) {
      const drawFile = zip.file(dk);
      if (!drawFile) continue;
      const drawXml = await drawFile.async('string');

      // drawing 本身的 rels
      const drawRelsKey = dk.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels';
      const drawRelsFile = zip.file(drawRelsKey);
      const drawRIdToPath = drawRelsFile
        ? parseRels(await drawRelsFile.async('string'), 'xl/drawings')
        : new Map<string, string>();

      const drawRowMap = parseDrawingRows(drawXml);
      console.log('[附件提取] drawing 文件', dk, '解析出的行映射:', drawRowMap.size, '个');
      for (const [rId, rowIdx] of drawRowMap) {
        const resolvedPath = drawRIdToPath.get(rId);
        if (resolvedPath) {
          rIdToPath.set(rId, resolvedPath);
        }
        rIdToRow.set(rId, rowIdx);
        console.log('[附件提取] rId:', rId, '→ 行:', rowIdx, '路径:', resolvedPath);
      }
    }

    // 3. 尝试读 vmlDrawing*.vml 映射（兼容老版本 OLE）
    const vmlFiles = Object.keys(zip.files).filter((k) => /xl\/drawings\/vmlDrawing\d+\.vml$/.test(k));
    for (const vk of vmlFiles) {
      const vmlFile = zip.file(vk);
      if (!vmlFile) continue;
      const vmlXml = await vmlFile.async('string');

      const vmlRelsKey = vk.replace('xl/drawings/', 'xl/drawings/_rels/') + '.rels';
      const vmlRelsFile = zip.file(vmlRelsKey);
      const vmlRIdToPath = vmlRelsFile
        ? parseRels(await vmlRelsFile.async('string'), 'xl/drawings')
        : new Map<string, string>();

      const vmlRowMap = parseVmlRows(vmlXml);
      for (const [rId, rowIdx] of vmlRowMap) {
        const resolvedPath = vmlRIdToPath.get(rId);
        if (resolvedPath) {
          rIdToPath.set(rId, resolvedPath);
        }
        rIdToRow.set(rId, rowIdx);
      }
    }

    // 4. 逐 rId 提取文件 Buffer
    // WPS/Kingsoft cellImages.xml stores cell images outside worksheet drawing rels.
    const cellImagesFile = zip.file('xl/cellimages.xml');
    const cellImagesRelsFile = zip.file('xl/_rels/cellimages.xml.rels');
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (cellImagesFile && cellImagesRelsFile && sheetFile) {
      const cellImageRows = parseWpsCellImageRows(await cellImagesFile.async('string'), await sheetFile.async('string'));
      const cellImageRels = parseRels(await cellImagesRelsFile.async('string'), 'xl');
      console.log('[attachment extract] WPS cellImages row mappings:', cellImageRows.size);
      for (const [rId, rowIdx] of cellImageRows) {
        const resolvedPath = cellImageRels.get(rId);
        if (resolvedPath) {
          rIdToPath.set(rId, resolvedPath);
        }
        rIdToRow.set(rId, rowIdx);
      }
    }

    for (const [rId, rowIdx] of rIdToRow) {
      const filePath = rIdToPath.get(rId);
      if (!filePath) continue;
      const zipEntry = zip.file(filePath);
      if (!zipEntry) continue;
      const buf = Buffer.from(await zipEntry.async('arraybuffer'));
      const originalName = filePath.split('/').pop() ?? rId;
      const mimeType = mimeOf(originalName);
      const files = result.get(rowIdx) ?? [];
      files.push({ buffer: buf, originalName, mimeType });
      result.set(rowIdx, files);
    }
  } catch (err) {
    console.error('[附件提取] 解析失败:', err);
    console.error('[附件提取] 错误堆栈:', err instanceof Error ? err.stack : String(err));
  }
  return result;
}
