import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const filePath = fileURLToPath(new URL('./index.html', import.meta.url));
const logoPath = fileURLToPath(new URL('./assets/company-logo.png', import.meta.url));
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:18080';

function safeAttribute(value) {
  return String(value).replace(/[&"<>]/g, '');
}

export function createWebServer(options = {}) {
  const gatewayUrl = options.gatewayUrl || process.env.PORTAL_GATEWAY_URL || DEFAULT_GATEWAY_URL;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (request.method !== 'GET') {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    if (url.pathname === '/portal-business.js') {
      const content = await readFile(new URL('./portal-business.js', import.meta.url));
      response.writeHead(200, { 'Content-Type':'application/javascript; charset=utf-8', 'Cache-Control':'no-store' });
      response.end(content); return;
    }
    if (url.pathname === '/assets/company-logo.png') {
      try {
        const content = await readFile(logoPath);
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
        });
        response.end(content);
      } catch (error) {
        response.writeHead(500);
        response.end(error.message);
      }
      return;
    }

    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      response.writeHead(404);
      response.end('Not Found');
      return;
    }

    try {
      const content = (await readFile(filePath, 'utf8')).replace(
        '<meta name="portal-gateway-url" content="' + DEFAULT_GATEWAY_URL + '">',
        '<meta name="portal-gateway-url" content="' + safeAttribute(gatewayUrl) + '">',
      );
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(content);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
}

export async function startWebServer(options = {}) {
  const port = Number(options.port || process.env.PORTAL_WEB_PORT || 5173);
  const host = options.host || process.env.PORTAL_WEB_HOST || '127.0.0.1';
  const server = createWebServer(options);
  await new Promise((resolve) => server.listen(port, host, resolve));
  console.log('customer portal web listening on http://' + host + ':' + server.address().port);
  return server;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startWebServer();
}
