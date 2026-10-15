import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SurfaceHandler } from '../server/core/handler.js';

export function nodeRequest(req: IncomingMessage, res: ServerResponse, origin?: string) {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableFinished) controller.abort(new Error('Client disconnected'));
  };
  req.on('aborted', abort);
  res.on('close', abort);
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2)
    headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const host =
    origin ??
    `${(req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`;
  const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/';
  // Build an origin-form URL without allowing //host to redirect the authority.
  const url = new URL(host);
  const original = path.startsWith('/') ? path : '/';
  const query = original.indexOf('?');
  url.pathname = query < 0 ? original : original.slice(0, query);
  url.search = query < 0 ? '' : original.slice(query);
  let detach = () => {};
  let body: ReadableStream<Uint8Array> | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = new ReadableStream({
      start(target) {
        req.on('data', onData);
        req.once('end', onEnd);
        req.once('error', onError);
        req.pause();
        function onData(chunk: Buffer) {
          target.enqueue(new Uint8Array(chunk));
          if ((target.desiredSize ?? 0) <= 0) req.pause();
        }
        function onEnd() {
          remove();
          target.close();
        }
        function onError(error: Error) {
          remove();
          target.error(error);
        }
        function remove() {
          req.off('data', onData);
          req.off('end', onEnd);
          req.off('error', onError);
        }
        detach = remove;
      },
      pull() {
        req.resume();
      },
      cancel() {
        detach();
        req.resume();
      },
    });
  }
  const request = new Request(url, {
    method: req.method,
    headers,
    body,
    signal: controller.signal,
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit);
  return {
    request,
    dispose() {
      req.off('aborted', abort);
      res.off('close', abort);
      detach();
    },
  };
}

export async function writeResponse(response: Response, req: IncomingMessage, res: ServerResponse) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (req.method === 'HEAD' || !response.body) {
    await response.body?.cancel();
    res.end();
    return;
  }
  const reader = response.body.getReader();
  try {
    while (!res.destroyed) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise<void>((resolve, reject) => {
          const clean = () => {
            res.off('drain', done);
            res.off('close', done);
            res.off('error', fail);
          };
          const done = () => {
            clean();
            resolve();
          };
          const fail = (error: Error) => {
            clean();
            reject(error);
          };
          res.once('drain', done);
          res.once('close', done);
          res.once('error', fail);
        });
      }
    }
    if (res.destroyed) await reader.cancel();
    else res.end();
  } finally {
    reader.releaseLock();
  }
}

export function nodeListener(
  handler: SurfaceHandler,
  options: {
    origin?: string;
    env?: Record<string, unknown>;
    static?: (request: Request) => Promise<Response | null>;
  } = {}
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    let connection: ReturnType<typeof nodeRequest> | undefined;
    try {
      connection = nodeRequest(req, res, options.origin);
      const response =
        (await options.static?.(connection.request)) ??
        (await handler.fetch(connection.request, {
          env: options.env ?? process.env,
          request: req,
          response: res,
        }));
      await writeResponse(response, req, res);
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else res.destroy(error instanceof Error ? error : undefined);
    } finally {
      connection?.dispose();
    }
  };
}
