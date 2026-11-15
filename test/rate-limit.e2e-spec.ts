import type { NestNodeApplication } from '@nestjs/platform-node';
import request from 'supertest';
import { setTestEnv } from './setup-env.js';

setTestEnv({ RATE_LIMIT_WRITE_LIMIT: '2', RATE_LIMIT_BURST_LIMIT: '5', RATE_LIMIT_BURST_TTL_MS: '60000' });

const { createApp } = await import('../src/bootstrap.js');

describe('Rate limiting (e2e)', () => {
  let app: NestNodeApplication;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits writes separately and answers 429 with Retry-After', async () => {
    const http = request(app.getHttpServer());
    const body = { userId: 1, title: 'Hello', body: 'x', tags: [], status: 'draft', publishedAt: null };
    const first = await http.post('/v1/posts').send(body).expect(201);
    expect(first.headers['x-ratelimit-limit-writes']).toBe('2');
    await http.post('/v1/posts').send(body).expect(201);
    const limited = await http.post('/v1/posts').send(body).expect(429);
    expect(limited.headers['content-type']).toContain('application/problem+json');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('applies the burst limit across all routes for one client', async () => {
    const http = request(app.getHttpServer());
    // The three writes above already count toward the burst window (limit 5).
    await http.get('/v1/users/1').expect(200);
    await http.get('/v1/posts/1').expect(200);
    const res = await http.get('/v1/albums/1');
    expect(res.status).toBe(429);
  });

  it('never throttles health probes', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 10; i++) await http.get('/health/live').expect(200);
  });
});
