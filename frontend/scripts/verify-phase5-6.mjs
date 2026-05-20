const API = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
const BASE = API + '/api';
let token = '';
let exitCode = 0;

async function req(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { headers, ...options });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function log(label, { status, body }, { expectedCodes } = {}) {
  const ok = status >= 200 && status < 300;
  const tolerated = !ok && Array.isArray(expectedCodes) && expectedCodes.includes(body?.code);
  const mark = ok ? '✅' : tolerated ? '🟡' : '❌';
  console.log(mark + ' [' + status + '] ' + label + ' — ' + JSON.stringify(body).slice(0, 180));
  if (!ok && !tolerated) exitCode = 1;
  return ok;
}

function pickList(body) {
  const d = body?.data ?? body ?? {};
  return d.list || d.items || (Array.isArray(d) ? d : []);
}

async function main() {
  console.log('=== Phase 5/6 Smoke Test ===');
  console.log('Target: ' + API + '\n');

  // 1. Login
  console.log('1️⃣ Login');
  const r1 = await req('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  if (!log('POST /auth/login', r1)) return;
  token = r1.body?.data?.accessToken || r1.body?.data?.token || r1.body?.token || r1.body?.accessToken || '';

  // 动态取一个真实 workOrder id 和 dispatchedOrder id
  const rWO = await req('/work-orders?pageSize=1');
  const firstWO = pickList(rWO.body)[0];
  const workOrderId = firstWO?.id;
  if (!workOrderId) console.log('⚠️ 没有可用的 workOrder，跳过 2/4 步');

  const rDO = await req('/dispatched-orders?pageSize=1');
  const firstDO = pickList(rDO.body)[0];
  const dispatchedOrderId = firstDO?.id;

  // 2. Create withdraw request
  console.log('\n2️⃣ Create withdraw request');
  let withdrawId;
  if (workOrderId) {
    const r2 = await req('/withdraw-requests', {
      method: 'POST',
      body: JSON.stringify({
        workOrderId,
        requestType: 'withdraw',
        reason: '自检脚本生成的撤回测试，满足最少长度要求，至少十几个字以上。',
      }),
    });
    log('POST /withdraw-requests', r2, { expectedCodes: [4302] });
    withdrawId = r2.body?.data?.requestId || r2.body?.data?.id || r2.body?.id;
  } else {
    console.log('⏭️  skipped');
  }

  // 3. List my withdraws
  console.log('\n3️⃣ List my withdraws');
  const r3 = await req('/withdraw-requests/my');
  log('GET /withdraw-requests/my', r3);

  // 4. Approve withdraw
  if (withdrawId) {
    console.log('\n4️⃣ Approve withdraw');
    const r4 = await req('/withdraw-requests/' + withdrawId + '/approve', {
      method: 'POST',
      body: JSON.stringify({ approvalStatus: 'agree' }),
    });
    log('POST /withdraw-requests/:id/approve', r4);
  } else {
    console.log('\n4️⃣ skipped (no withdrawId)');
  }

  // 5. Get export templates
  console.log('\n5️⃣ Get export templates');
  const r5 = await req('/export-templates');
  log('GET /export-templates', r5);
  const tmplId = pickList(r5.body)[0]?.id;

  // 6. Apply preview
  if (tmplId && dispatchedOrderId) {
    console.log('\n6️⃣ Template preview');
    const r6 = await req('/export-templates/' + tmplId + '/apply-preview', {
      method: 'POST',
      body: JSON.stringify({ dispatchedOrderIds: [dispatchedOrderId] }),
    });
    // 404 "no dispatched orders matched template module" 属业务允许（模板与派单 module 不匹配）
    if (r6.status === 404 && /no dispatched orders matched/i.test(r6.body?.message || '')) {
      console.log('🟡 [' + r6.status + '] POST /export-templates/:id/apply-preview — ' + r6.body?.message + '（tolerated）');
    } else {
      log('POST /export-templates/:id/apply-preview', r6);
    }
  } else {
    console.log('⚠️ No template or dispatched order, skipping preview');
  }

  // 7. Dashboard salesperson
  console.log('\n7️⃣ Dashboard salesperson');
  const r7 = await req('/dashboard/salesperson');
  log('GET /dashboard/salesperson', r7);

  // 8. Dashboard processor
  console.log('\n8️⃣ Dashboard processor');
  const r8 = await req('/dashboard/team/data_entry');
  log('GET /dashboard/team/data_entry', r8);

  // 9. Notifications grouped
  console.log('\n9️⃣ Notifications grouped');
  const r9 = await req('/notifications?group_by=biz_type');
  log('GET /notifications?group_by=biz_type', r9);

  // 10. SSE events（用 fetch 流读 text/event-stream，兼容无 EventSource 的 Node）
  console.log('\n🔟 SSE /api/events/notifications (≤10s)');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(BASE + '/events/notifications', {
      headers: {
        Accept: 'text/event-stream',
        Authorization: 'Bearer ' + token,
      },
      signal: controller.signal,
    });
    if (res.ok && /event-stream/.test(res.headers.get('content-type') || '')) {
      console.log('✅ SSE connected, Content-Type: ' + res.headers.get('content-type'));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let events = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (chunk.trim()) {
              events++;
              console.log('   📩 ' + chunk.split('\n')[0].slice(0, 100));
            }
          }
        }
      } catch {}
      clearTimeout(timeout);
      console.log('✅ SSE events in ≤10s: ' + events + ' (idle 不产生事件属正常)');
    } else {
      console.log('❌ SSE status=' + res.status + ' content-type=' + res.headers.get('content-type'));
      exitCode = 1;
    }
  } catch (err) {
    console.log('⚠️ SSE failed: ' + err.message);
  }

  console.log('\n=== Smoke test complete ===');
  process.exit(exitCode);
}

main().catch((err) => { console.error('❌ Fatal:', err.message); process.exit(1); });
