const ExcelJS = require('exceljs');

async function verify() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./test-template-new.xlsx');
  const sheet = workbook.getWorksheet('当前字段配置');
  
  console.log('===== 新模板字段验证 =====\n');
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
  
  console.log(`✓ 总字段数: ${headers.length}\n`);
  
  console.log('===== 前12个字段（客户必填，应全部标黄） =====');
  headers.slice(0, 12).forEach((h, idx) => {
    const status = h.isYellow ? '✓黄' : '✗未标黄';
    console.log(`${idx + 1}. ${h.colLetter}列: ${h.value} [${status}]`);
  });
  
  console.log('\n===== 第13-20个字段（业务/后道，应不标黄） =====');
  headers.slice(12, 20).forEach((h, idx) => {
    const status = h.isYellow ? '✗标黄了' : '✓未标黄';
    console.log(`${idx + 13}. ${h.colLetter}列: ${h.value} [${status}]`);
  });
  
  const yellowCount = headers.filter(h => h.isYellow).length;
  const first12Yellow = headers.slice(0, 12).every(h => h.isYellow);
  const rest51NotYellow = headers.slice(12).every(h => !h.isYellow);
  
  console.log(`\n===== 验证结果 =====`);
  console.log(`✓ 总字段数: ${headers.length}`);
  console.log(`✓ 标黄字段数: ${yellowCount}`);
  console.log(`${first12Yellow ? '✓' : '✗'} 前12个字段全部标黄: ${first12Yellow}`);
  console.log(`${rest51NotYellow ? '✓' : '✗'} 后51个字段全部不标黄: ${rest51NotYellow}`);
  console.log(`${headers.length === 63 && yellowCount === 12 && first12Yellow && rest51NotYellow ? '\n✓✓✓ 全部验证通过！' : '\n✗ 验证失败'}`);
}

verify().catch(console.error);
