import { createHash } from 'node:crypto';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';

/**
 * Adds a strong `ETag` and `Cache-Control` to successful GET/HEAD responses and
 * answers `If-None-Match` with `304 Not Modified`.
 *
 * NodeAdapter (unlike Express) sends no ETag. It does reply through `res.send()`
 * when a middleware has wrapped it, which is where the body is fingerprinted here.
 */
export function conditionalGet(maxAgeSeconds: number) {
  const cacheControl =
    maxAgeSeconds > 0
      ? `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`
      : 'no-cache';

  return (req: NodeRequest, res: NodeResponse, next: () => void) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const originalSend = res.send.bind(res);
    res.send = ((body?: unknown) => {
      if (typeof body !== 'string' || res.statusCode !== 200 || res.hasHeader('ETag')) {
        return originalSend(body as never);
      }
      const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
      res.setHeader('ETag', etag);
      if (!res.hasHeader('Cache-Control')) res.setHeader('Cache-Control', cacheControl);

      const inm = req.headers['if-none-match'];
      if (inm && (inm === '*' || inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag))) {
        res.statusCode = 304;
        res.removeHeader('Content-Type');
        res.removeHeader('Content-Length');
        res.end();
        return res;
      }
      return originalSend(body as never);
    }) as NodeResponse['send'];

    next();
  };
}
