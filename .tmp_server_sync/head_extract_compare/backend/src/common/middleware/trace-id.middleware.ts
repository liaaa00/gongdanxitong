import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

export interface RequestWithTraceId extends Request {
  traceId?: string;
}

const TRACE_HEADER = 'x-trace-id';

export function traceIdMiddleware(
  request: RequestWithTraceId,
  response: Response,
  next: () => void,
): void {
  const headerTraceId = request.header(TRACE_HEADER);
  const traceId = headerTraceId && headerTraceId.length > 0 ? headerTraceId : `req_${randomUUID()}`;

  request.traceId = traceId;
  response.setHeader(TRACE_HEADER, traceId);

  next();
}
