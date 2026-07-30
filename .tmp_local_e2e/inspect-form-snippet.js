const fs = require('fs');
const file = 'D:/ai/speceappdate/工单系统/.tmp_server_sync/primary-worktree/frontend/src/pages/InServiceOrders/components/InServiceOrderForm.tsx';
const text = fs.readFileSync(file, 'utf8');
const needle = 'options={PROVINCES_27.map((value) => ({ value, label: value }))}';
let offset = 0;
let index = 0;
while ((index = text.indexOf(needle, offset)) >= 0) {
  console.log(JSON.stringify(text.slice(Math.max(0, index - 220), Math.min(text.length, index + needle.length + 120))));
  offset = index + needle.length;
}
