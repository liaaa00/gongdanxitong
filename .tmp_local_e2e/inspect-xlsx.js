const ExcelJS = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/exceljs');

async function main() {
  const file = process.argv[2];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const result = workbook.worksheets.map((sheet) => {
    const rows = [];
    const maxRow = Math.min(sheet.rowCount, 15);
    const maxCol = Math.min(sheet.columnCount, 70);
    for (let r = 1; r <= maxRow; r += 1) {
      const values = [];
      for (let c = 51; c <= maxCol; c += 1) {
        const value = sheet.getCell(r, c).value;
        if (value && typeof value === 'object' && 'text' in value) values.push(value.text);
        else if (value && typeof value === 'object' && 'result' in value) values.push(value.result);
        else values.push(value ?? null);
      }
      rows.push({ row: r, values });
    }
    return {
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      actualRowCount: sheet.actualRowCount,
      actualColumnCount: sheet.actualColumnCount,
      rows,
    };
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
