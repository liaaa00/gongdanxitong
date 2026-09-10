import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebServer } from '../web/server.mjs';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('web server serves signed-link URLs and injects the configured gateway', async () => {
  const server = createWebServer({ gatewayUrl: 'https://portal.example.test/gateway' });
  try {
    await listen(server);
    const baseUrl = 'http://127.0.0.1:' + server.address().port;
    const response = await fetch(baseUrl + '/?token=signed-link-value');
    const page = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(page, /meta name="portal-gateway-url" content="https:\/\/portal\.example\.test\/gateway"/);

    const logo = await fetch(baseUrl + '/assets/company-logo.png');
    const logoBytes = await logo.arrayBuffer();
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get('content-type'), 'image/png');
    assert.ok(logoBytes.byteLength > 1000);

    const missing = await fetch(baseUrl + '/missing');
    assert.equal(missing.status, 404);
  } finally {
    if (server.listening) await close(server);
  }
});