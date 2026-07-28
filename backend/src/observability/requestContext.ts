import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  method: string;
  path: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const suppliedId = req.get('x-request-id');
  const requestId =
    suppliedId && /^[a-zA-Z0-9._:-]{8,128}$/.test(suppliedId) ? suppliedId : randomUUID();
  const context = { requestId, method: req.method, path: req.path, startedAt: Date.now() };

  res.setHeader('x-request-id', requestId);
  storage.run(context, next);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
