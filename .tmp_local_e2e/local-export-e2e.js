const fs = require('fs');
const path = require('path');
const ExcelJS = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/exceljs');
const JSZip = require('D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/backend/node_modules/jszip');

const origin = 'http://127.0.0.1:3000';
const base = origin + '/api';
const tempDir = 'D:/ai/speceappdate/工单系统/.tmp_local_e2e';
const children = [
  ['data_entry', 'efa3e9bc-d421-4244-9b2c-6af1f948adf3'],
  ['onboarding_contact', 'ed3a420f-1b4c-4bbd-82e5-d8a8d8ad953f'],
  ['contract', '792177e0-8910-43b8-977f-5a813e454ec7'],
  ['social_insurance', '3f3088e4-fec0-4e60-8d4c-ec5bb20928ea'],
];

async function readJson(response, label) {
  const body = await response.json();
  if (!response.ok || body.code !== 0) throw new Error(label + ': ' + response.status + ' ' + JSON.stringify(body));
  return body.data;
}

async function extractText(buffer, fileName, contentType) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || /spreadsheet/.test(contentType)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const values = [];
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => values.push(cell.text));
      });
    }
    return values.join('|');
  }
  if (lower.endsWith('.docx') || /wordprocessingml/.test(contentType)) {
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')?.async('string');
    return String(xml || '').replace(/<[^>]+>/g, '');
  }
  return buffer.toString('utf8');
}

async function main() {
  const login = await readJson(await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'lizhanbo', password: 'LocalAdmin#2026' }),
  }), 'login');
  const token = login.accessToken;
  const results = [];

  for (const [moduleCode, id] of children) {
    try {
      const exported = await readJson(await fetch(base + '/dispatched-orders/' + id + '/export', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
        },
        body: '{}',
      }), 'export ' + moduleCode);
      const relative = exported.downloadUrl || (exported.fileId ? '/api/files/' + exported.fileId : '');
      if (!relative) throw new Error('missing download URL: ' + JSON.stringify(exported));
      const url = /^https?:/i.test(relative) ? relative : origin + (relative.startsWith('/') ? relative : '/' + relative);
      const response = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
      if (!response.ok) throw new Error('download ' + moduleCode + ': ' + response.status + ' ' + await response.text());
      const buffer = Buffer.from(await response.arrayBuffer());
      const fileName = exported.fileName || moduleCode + '.bin';
      const safeName = moduleCode + '-' + path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const output = path.join(tempDir, safeName);
      fs.writeFileSync(output, buffer);
      const text = await extractText(buffer, fileName, response.headers.get('content-type') || '');
      results.push({
        moduleCode,
        id,
        fileName,
        output,
        bytes: buffer.length,
        hasGender: text.includes('男'),
        hasBirthDate: text.includes('1990-01-01') || text.includes('1990/01/01'),
        hasAge: /(^|\D)36(\D|$)/.test(text),
      });
    } catch (error) {
      results.push({ moduleCode, id, error: error.message });
    }
  }

  const complete = results.some((item) => item.hasGender && item.hasBirthDate && item.hasAge);
  console.log(JSON.stringify({ complete, results }, null, 2));
  if (!complete) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
