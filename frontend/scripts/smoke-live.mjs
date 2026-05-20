const API = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
const BASE = API + '/api';

let token = '';

async function req(path, options = {}) {
  const url = BASE + path;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { headers, ...options });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function log(label, { status, body }) {
  const ok = status >= 200 && status < 300;
  const icon = ok ? '✅' : '❌';
  const summary = body ? JSON.stringify(body).slice(0, 120) : (body === null ? 'null' : 'empty');
  console.log(icon + ' [' + status + '] ' + label + ' — ' + summary);
  return ok;
}

async function main() {
  console.log('🔍 Smoke Test — Target: ' + API);
  console.log('');

  // 1. Login
  console.log('1️⃣  POST /api/auth/login');
  const login = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!log('Login', login)) { console.log('❌ Login failed, aborting.'); return; }
  if (login.body?.data?.accessToken) {
    token = login.body.data.accessToken;
    console.log('   Token obtained.');
  } else if (login.body?.data?.token) {
    token = login.body.data.token;
    console.log('   Token obtained.');
  } else if (login.body?.token) {
    token = login.body.token;
    console.log('   Token obtained.');
  } else if (login.body?.accessToken) {
    token = login.body.accessToken;
    console.log('   Token obtained.');
  }

  // 2. GET /api/auth/me
  console.log('\n2️⃣  GET /api/auth/me');
  const me = await req('/auth/me');
  log('Auth Me', me);

  // 3. GET /api/work-orders
  console.log('\n3️⃣  GET /api/work-orders');
  const orders = await req('/work-orders?page=1&pageSize=5');
  log('Work Orders List', orders);

  // 4. GET /api/admin/users
  console.log('\n4️⃣  GET /api/admin/users');
  const users = await req('/admin/users?page=1&pageSize=5');
  log('Admin Users', users);

  // 5. GET /api/dashboard/salesperson
  console.log('\n5️⃣  GET /api/dashboard/salesperson');
  const dash = await req('/dashboard/salesperson');
  log('Dashboard', dash);

  console.log('\n🏁 Smoke test complete.');
}

main().catch((err) => {
  console.error('❌ Smoke test error:', err.message);
  process.exit(1);
});
