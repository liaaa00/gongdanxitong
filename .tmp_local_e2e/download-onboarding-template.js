const fs = require('fs');
const ExcelJS = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/exceljs');

const base = 'http://127.0.0.1:3000/api';
const output = 'D:/ai/speceappdate/工单系统/.tmp_local_e2e/onboarding-system-template.xlsx';

async function readJson(response, label) {
  const body = await response.json();
  if (!response.ok || body.code !== 0) {
    throw new Error(label + ': ' + response.status + ' ' + JSON.stringify(body));
  }
  return body.data;
}

async function main() {
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'zhaotianqi', password: 'LocalBiz#2026' }),
  });
  const auth = await readJson(login, 'login');
  const response = await fetch(base + '/work-orders/import/template?orderType=onboarding', {
    headers: { authorization: 'Bearer ' + auth.accessToken },
  });
  if (!response.ok) throw new Error('download: ' + response.status + ' ' + await response.text());
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(output, buffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const fields = [];
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    fields.push({
      col,
      header: sheet.getCell(1, col).text,
      required: sheet.getCell(2, col).text,
      help: sheet.getCell(3, col).text,
      example: sheet.getCell(4, col).text,
    });
  }
  console.log(JSON.stringify({
    output,
    bytes: buffer.length,
    sheet: sheet.name,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    fields,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
