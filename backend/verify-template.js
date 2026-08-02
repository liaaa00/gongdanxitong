const ExcelJS = require('exceljs');

async function verifyTemplate() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./test-template.xlsx');

  const sheet = workbook.getWorksheet('当前字段配置');
  if (!sheet) {
    console.error('❌ 未找到主工作表');
    return;
  }

  console.log('✓ 主工作表:', sheet.name);
  console.log('✓ 总列数:', sheet.columnCount);

  const headerRow = sheet.getRow(1);
  const headers = [];
  for (let col = 2; col <= sheet.columnCount; col++) {
    const cell = headerRow.getCell(col);
    if (cell.value) {
      headers.push({
        col: col,
        colLetter: String.fromCharCode(64 + col),
        value: cell.value,
        isYellow: cell.fill?.fgColor?.argb === 'FFFFFF00'
      });
    }
  }

  console.log('\n===== 前20个字段 =====');
  headers.slice(0, 20).forEach((h, idx) => {
    const mark = h.isYellow ? ' [黄]' : '';
    console.log(`${idx + 1}. ${h.colLetter}列: ${h.value}${mark}`);
  });

  console.log(`\n✓ 总字段数: ${headers.length}`);
  console.log(`✓ 黄色字段数: ${headers.filter(h => h.isYellow).length}`);
  
  // 检查隐藏sheet
  const optionsSheet = workbook.getWorksheet('__options');
  console.log(`✓ 下拉选项sheet: ${optionsSheet ? optionsSheet.state : '未找到'}`);
}

verifyTemplate().catch(console.error);
