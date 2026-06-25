const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'daemon-3000.log');
const out = fs.openSync(logPath, 'a');
const err = fs.openSync(logPath, 'a');

fs.appendFileSync(logPath, `\n=== spawn at ${new Date().toISOString()} ===\n`);

const child = spawn(process.execPath, [path.join(__dirname, 'dist', 'main.js')], {
  detached: true,
  stdio: ['ignore', out, err],
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'production', PORT: '3000' },
  windowsHide: true,
});

fs.writeFileSync(path.join(__dirname, 'daemon-3000.pid'), String(child.pid));
console.log('spawned pid=' + child.pid);
child.unref();
process.exit(0);
