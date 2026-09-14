import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS 白名单解析（治理计划 2-6 / G7）。
 *
 * 设计要点：
 * 1. 允许的 Origin 来源为「环境变量 ALLOWED_ORIGINS + 本机/局域网派生默认」，
 *    与 config/env.ps1 端口口径（前端 5173 / 后端 3000）同源，改 IP 只需改一处。
 * 2. 白名单为纯函数，可单测；main.ts 只负责把解析结果交给 app.enableCors()。
 * 3. 允许携带凭证（credentials: true），保留 ws（/events、/socket.io）通道所需的能力；
 *    因需支持动态 Origin 判定，origin 传回调函数而非静态字符串。
 *
 * 默认允许来源（未显式配置 ALLOWED_ORIGINS 时）：
 * - http://localhost:5173 / http://127.0.0.1:5173（本机前端 Vite dev server）
 * - http://localhost:3000 / http://127.0.0.1:3000（本机后端直连，含 /events、/socket.io）
 * - http://<LAN_IP>:5173 / http://<LAN_IP>:3000（局域网同事访问，LAN_IP 来自 TICKET_LAN_IP）
 */

const DEFAULT_FRONTEND_PORT = 5173;
const DEFAULT_BACKEND_PORT = 3000;

/**
 * 从环境变量解析出允许的 Origin 集合。
 *
 * @param env 注入的环境变量对象（默认 process.env，便于单测传参）
 * @returns 去重后的允许 Origin 数组（不含通配符）
 */
export function resolveAllowedOrigins(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const origins = new Set<string>();

  const frontendPort = normalizePort(env.VITE_PORT, DEFAULT_FRONTEND_PORT);
  const backendPort = normalizePort(env.PORT, DEFAULT_BACKEND_PORT);

  // 本机来源：localhost 与 127.0.0.1 均允许，覆盖 Vite 代理与直连两种链路。
  for (const host of ['localhost', '127.0.0.1']) {
    origins.add(`http://${host}:${frontendPort}`);
    origins.add(`http://${host}:${backendPort}`);
  }

  // 局域网来源：LAN IP 由 config/env.ps1 通过 TICKET_LAN_IP 注入（不硬编码单一 IP）。
  const lanIp = (env.TICKET_LAN_IP ?? '').trim();
  if (isIpv4(lanIp)) {
    origins.add(`http://${lanIp}:${frontendPort}`);
    origins.add(`http://${lanIp}:${backendPort}`);
  }

  // 显式 ALLOWED_ORIGINS 追加（逗号/空格分隔），供特殊部署（反向代理域名等）覆盖。
  for (const raw of splitList(env.ALLOWED_ORIGINS)) {
    const normalized = stripTrailingSlash(raw);
    if (normalized) origins.add(normalized);
  }

  return Array.from(origins);
}

/**
 * 判定给定 Origin 是否命中白名单。
 *
 * 无 Origin 的请求（同源、服务端到服务端、curl 无头）一律放行，返回 true；
 * 有 Origin 时须精确匹配白名单条目（忽略大小写与末尾斜杠）。
 *
 * @param origin 请求头 Origin，可能为 undefined
 * @param allowed 允许的 Origin 集合
 */
export function isAllowedOrigin(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (!origin || origin === 'null') return true; // 同源 / 本地文件 / 无头请求
  const normalized = stripTrailingSlash(origin).toLowerCase();
  return allowed.some(
    (item) => stripTrailingSlash(item).toLowerCase() === normalized,
  );
}

/**
 * 构造 app.enableCors 所需配置对象。
 *
 * @param env 注入的环境变量对象（默认 process.env）
 */
export function buildCorsOptions(
  env: NodeJS.ProcessEnv = process.env,
): CorsOptions {
  const allowed = resolveAllowedOrigins(env);
  return {
    // 用回调实现动态 Origin 判定：命中白名单才回显具体 Origin（配 credentials 必须回显精确值）。
    // 注意：不匹配时必须 callback(null, false) 而非传 Error —— 传 Error 会让 cors 中间件
    // next(err) 直接 500；返回 false 则不下发 Access-Control-Allow-Origin，由浏览器拦截，
    // 且非浏览器调用方（服务端到服务端）不受影响。
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => {
      callback(null, isAllowedOrigin(requestOrigin, allowed));
    },
    credentials: true,
    // 保留 ws / 前端常用方法与头部，避免误伤既有功能。
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'traceId',
      'x-trace-id',
    ],
    exposedHeaders: ['traceId', 'x-trace-id'],
    maxAge: 600,
  };
}

function normalizePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isIpv4(value: string): boolean {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}
