const ExcelJS = require('exceljs');

async function verify(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('当前字段配置');
  const headerRow = sheet.getRow(1);

  console.log('前20列原始数据:');
  for (let col = 2; col <= 21; col++) {
    const cell = headerRow.getCell(col);
    const value = cell.value;
    const fill = cell.fill;
    const hasYellow = fill && fill.fgColor && (
      fill.fgColor.argb === 'FFFFFF00' ||
      fill.fgColor.argb === 'FFFF00'
    );
    console.log(`${col}. ${value} ${hasYellow ? '[黄]' : ''} (fill=${JSON.stringify(fill)})`);
  }
}

verify(process.argv[2]).catch(console.error);
