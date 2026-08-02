const ExcelJS = require('exceljs');

async function checkFields() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./test-template.xlsx');
  const sheet = workbook.getWorksheet('当前字段配置');
  const headerRow = sheet.getRow(1);
  
  console.log('===== 所有63个字段 =====\n');
  for (let col = 2; col <= 64; col++) {
    const cell = headerRow.getCell(col);
    if (cell.value) {
      const isYellow = cell.fill?.fgColor?.argb === 'FFFFFF00';
      const colLetter = String.fromCharCode(64 + col);
      console.log(`${col - 1}. ${colLetter}列: ${cell.value} ${isYellow ? '[黄]' : ''}`);
    }
  }
}

checkFields().catch(console.error);
