import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NestNodeApplication } from '@nestjs/platform-node';
import request from 'supertest';
import { setTestEnv } from './setup-env.js';

setTestEnv();

const { createApp, PUBLIC_DIR } = await import('../src/bootstrap.js');
const { RESOURCES } = await import('../src/resources/index.js');

/** Writable top-level properties of a DTO, from its OpenAPI metadata. */
function writableKeys(dto: object): string[] {
  const props: string[] = Reflect.getMetadata('swagger/apiModelPropertiesArray', (dto as { prototype: object }).prototype) ?? [];
  return props.map((p) => p.replace(/^:/, ''));
}

describe('FakerJson (e2e)', () => {
  let app: NestNodeApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createApp();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('reads', () => {
    it('returns the same row for the same id, seed and locale', async () => {
      const a = await http.get('/v1/users/7').expect(200);
      const b = await http.get('/v1/users/7').expect(200);
      expect(a.body).toEqual(b.body);
      expect(a.body.id).toBe(7);
    });

    it('returns a different, stable dataset per seed', async () => {
      const a = await http.get('/v1/users/7?seed=1').expect(200);
      const b = await http.get('/v1/users/7?seed=2').expect(200);
      const c = await http.get('/v1/users/7?seed=1').expect(200);
      expect(a.body.email).not.toBe(b.body.email);
      expect(a.body).toEqual(c.body);
    });

    it('localises data with ?locale', async () => {
      const res = await http.get('/v1/users/1?locale=de&fields=address').expect(200);
      expect(res.body.address.street).toBeTypeOf('string');
      await http.get('/v1/users/1?locale=xx').expect(400);
    });

    it('wraps lists in data/meta/links and mirrors them in headers', async () => {
      const res = await http.get('/v1/posts?page=2&limit=5').expect(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.data[0].id).toBe(6);
      expect(res.body.meta).toMatchObject({ page: 2, limit: 5, totalItems: 1000, totalPages: 200, hasNextPage: true, hasPreviousPage: true });
      expect(res.body.links.prev).toBe('/v1/posts?page=1&limit=5');
      expect(res.headers['x-total-count']).toBe('1000');
      expect(res.headers.link).toContain('rel="next"');
      expect(res.headers.link).toContain('rel="last"');
    });

    it('serves nested routes identically to the parent filter', async () => {
      const nested = await http.get('/v1/users/3/posts?limit=50').expect(200);
      const filtered = await http.get('/v1/posts?userId=3&limit=50').expect(200);
      expect(nested.body.data).toEqual(filtered.body.data);
      expect(nested.body.meta.totalItems).toBe(10);
      expect(nested.body.data.every((p: { userId: number }) => p.userId === 3)).toBe(true);
      await http.get('/v1/users/999/posts').expect(404);
    });

    it('filters, searches and sorts', async () => {
      const res = await http.get('/v1/posts?status=published&views_gte=10000&sort=-views&limit=100').expect(200);
      const views = res.body.data.map((p: { views: number }) => p.views);
      expect(views.length).toBeGreaterThan(0);
      expect(views).toEqual([...views].sort((a, b) => b - a));
      expect(res.body.data.every((p: { status: string; views: number }) => p.status === 'published' && p.views >= 10000)).toBe(true);

      const ne = await http.get('/v1/todos?completed_ne=true&limit=100').expect(200);
      expect(ne.body.data.every((t: { completed: boolean }) => !t.completed)).toBe(true);

      const users = await http.get('/v1/users?limit=100').expect(200);
      const name: string = users.body.data[0].lastName;
      const search = await http.get(`/v1/users?q=${encodeURIComponent(name.toLowerCase())}`).expect(200);
      expect(search.body.data.some((u: { lastName: string }) => u.lastName === name)).toBe(true);
    });

    it('supports sparse fields and expand', async () => {
      const res = await http.get('/v1/comments/1?fields=body,post&expand=post').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['body', 'id', 'post']);
      expect(res.body.post.id).toBe(1);
    });

    it('keeps relations consistent (product rating = average of its reviews)', async () => {
      const product = await http.get('/v1/products/9').expect(200);
      const reviews = await http.get('/v1/products/9/reviews').expect(200);
      const ratings = reviews.body.data.map((r: { rating: number }) => r.rating);
      const avg = Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 100) / 100;
      expect(product.body.rating).toBe(avg);
    });
  });

  describe('HTTP caching', () => {
    it('answers If-None-Match with 304 and reports cache hits', async () => {
      const first = await http.get('/v1/albums/4').expect(200);
      expect(first.headers.etag).toMatch(/^"[\w-]+"$/);
      expect(first.headers['cache-control']).toContain('max-age=');
      await http.get('/v1/albums/4').set('If-None-Match', first.headers.etag).expect(304);
      const again = await http.get('/v1/albums/4').expect(200);
      expect(again.headers['x-cache']).toBe('HIT');
    });
  });

  describe('errors (RFC 9457)', () => {
    it('404 for a missing row', async () => {
      const res = await http.get('/v1/users/101').expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ type: 'about:blank', title: 'Not Found', status: 404, instance: '/v1/users/101' });
    });

    it('400 with every invalid parameter listed', async () => {
      const res = await http.get('/v1/posts?limit=0&sort=nope&bogus=1').expect(400);
      expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['bogus', 'limit', 'sort']);
    });

    it('400 for a non-numeric id, 404 for an unknown route', async () => {
      await http.get('/v1/users/abc').expect(400);
      const res = await http.get('/v1/nope').expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });

    it('ignores _-prefixed cache busters', async () => {
      await http.get('/v1/users?_=123').expect(200);
    });
  });

  describe('writes (faked)', () => {
    const post = { userId: 1, title: 'Hello world', body: 'Body', tags: ['a'], status: 'draft', publishedAt: null };

    it('POST returns 201, Location and server-computed fields', async () => {
      const res = await http.post('/v1/posts').send(post).expect(201);
      expect(res.headers.location).toBe('/v1/posts/1001');
      expect(res.body).toMatchObject({ id: 1001, ...post, slug: 'hello-world', views: 0 });
      // Nothing was persisted.
      await http.get('/v1/posts/1001').expect(404);
    });

    it('POST ignores read-only fields but rejects unknown and invalid ones with 422', async () => {
      const ok = await http.post('/v1/posts').send({ ...post, id: 5, slug: 'x', views: 99 }).expect(201);
      expect(ok.body).toMatchObject({ id: 1001, slug: 'hello-world', views: 0 });
      const res = await http.post('/v1/posts').send({ ...post, extra: true, status: 'nope' }).expect(422);
      const fields = res.body.errors.map((e: { field: string }) => e.field).sort();
      expect(fields).toEqual(['extra', 'status']);
      await http.post('/v1/posts').send([post]).expect(422);
    });

    it('recomputes nested read-only values instead of trusting them', async () => {
      const res = await http
        .post('/v1/carts')
        .send({ userId: 1, items: [{ productId: 3, quantity: 1, unitPrice: 0.01, lineTotal: 0.01 }] })
        .expect(201);
      expect(res.body.items[0].unitPrice).not.toBe(0.01);
    });

    it('POST rejects references to rows that do not exist', async () => {
      const res = await http.post('/v1/posts').send({ ...post, userId: 9999 }).expect(422);
      expect(res.body.errors).toEqual([{ field: 'userId', message: 'User 9999 does not exist' }]);
    });

    it('prices cart lines from the catalogue', async () => {
      const product = await http.get('/v1/products/3').expect(200);
      const res = await http.post('/v1/carts').send({ userId: 1, items: [{ productId: 3, quantity: 2 }] }).expect(201);
      expect(res.body.items[0]).toMatchObject({ productId: 3, quantity: 2, unitPrice: product.body.finalPrice });
      expect(res.body.subtotal).toBe(Math.round(product.body.finalPrice * 2 * 100) / 100);
      const bad = await http.post('/v1/carts').send({ userId: 1, items: [{ productId: 9999, quantity: 1 }] }).expect(422);
      expect(bad.body.errors[0].field).toBe('items.0.productId');
    });

    it('PUT requires every field, PATCH merges, DELETE answers 204', async () => {
      await http.put('/v1/posts/1').send({ title: 'Only title' }).expect(422);
      const put = await http.put('/v1/posts/1').send(post).expect(200);
      expect(put.body).toMatchObject({ id: 1, title: 'Hello world' });
      const patch = await http.patch('/v1/posts/1').send({ title: 'Patched title' }).expect(200);
      expect(patch.body.title).toBe('Patched title');
      expect(patch.body.body).toBeTypeOf('string');
      await http.delete('/v1/posts/1').expect(204);
      await http.delete('/v1/posts/5000').expect(404);
    });

    it('400 for malformed JSON', async () => {
      await http.post('/v1/posts').set('Content-Type', 'application/json').send('{bad').expect(400);
    });
  });

  describe('every resource', () => {
    it.each(RESOURCES.map((d) => [d.name, d] as const))('%s: list, item, nested route and a valid round-trip', async (name, def) => {
      const list = await http.get(`/v1/${name}?limit=3`).expect(200);
      expect(list.body.meta.totalItems).toBe(def.count);
      expect(list.body.data).toHaveLength(Math.min(3, def.count));

      const item = await http.get(`/v1/${name}/${def.count}`).expect(200);
      expect(item.body.id).toBe(def.count);
      await http.get(`/v1/${name}/${def.count + 1}`).expect(404);

      if (def.parent) {
        const parent = RESOURCES.find((d) => d.name === def.parent!.resource)!;
        const nested = await http.get(`/v1/${parent.name}/1/${name}`).expect(200);
        expect(nested.body.meta.totalItems).toBe(def.parent.perParent);
      }

      // Generated rows must pass the resource's own validation: GET -> PUT round-trips,
      // and the writable subset is a valid POST body.
      const replaced = await http.put(`/v1/${name}/${def.count}`).send(item.body);
      expect(replaced.status, JSON.stringify(replaced.body)).toBe(200);
      const body = Object.fromEntries(writableKeys(def.createDto).map((k) => [k, item.body[k]]));
      const created = await http.post(`/v1/${name}`).send(body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
    });
  });

  describe('utilities and docs', () => {
    it('/v1/status/{code} returns that status', async () => {
      await http.get('/v1/status/503').expect(503);
      await http.post('/v1/status/201').expect(201);
      await http.get('/v1/status/204').expect(204);
      await http.get('/v1/status/700').expect(400);
    });

    it('?delay is validated', async () => {
      await http.get('/v1/users/1?delay=50').expect(200);
      await http.get('/v1/users/1?delay=-1').expect(400);
    });

    it('/v1/echo is never cacheable and redacts credentials', async () => {
      const res = await http
        .get('/v1/echo')
        .set('Authorization', 'Bearer secret-token')
        .set('Cookie', 'session=abc')
        .set('X-Auth-Token', 'tok-123')
        .set('X-Session-Id', 'sess-456')
        .set('X-Client-Name', 'storybook')
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.headers.authorization).toBe('[redacted]');
      expect(res.body.headers.cookie).toBe('[redacted]');
      expect(res.body.headers['x-auth-token']).toBe('[redacted]');
      expect(res.body.headers['x-session-id']).toBe('[redacted]');
      // Ordinary headers are still shown.
      expect(res.body.headers['x-client-name']).toBe('storybook');
      expect(JSON.stringify(res.body)).not.toMatch(/secret-token|tok-123|sess-456/);

      const head = await http.head('/v1/echo').expect(200);
      expect(head.headers['cache-control']).toBe('no-store');
    });

    it('/v1/echo reflects the request', async () => {
      const res = await http.post('/v1/echo?x=1').send({ hello: 'world' }).expect(201);
      expect(res.body).toMatchObject({ method: 'POST', path: '/v1/echo', query: { x: '1' }, body: { hello: 'world' } });
    });

    it('serves an OpenAPI document with a tag per resource, grouped by family', async () => {
      const res = await http.get('/openapi.json').expect(200);
      const doc = res.body;
      const tags: string[] = doc.tags.map((t: { name: string }) => t.name);
      expect(tags).toContain('Classic · Users');
      expect(tags).toContain('E-commerce · Products');
      expect(tags).toContain('Business · Invoices');
      expect(tags).toContain('Social · Messages');
      expect(doc['x-tagGroups'].map((g: { name: string }) => g.name)).toEqual(['Meta', 'Classic', 'E-commerce', 'Business', 'Social']);

      const ids: string[] = [];
      for (const path of Object.values<Record<string, { operationId: string }>>(doc.paths)) {
        for (const op of Object.values(path)) ids.push(op.operationId);
      }
      expect(new Set(ids).size).toBe(ids.length);
      await http.get('/docs').expect(200);
    });

    it('resolves every $ref in the OpenAPI document', async () => {
      const doc = (await http.get('/openapi.json').expect(200)).body;
      const broken: string[] = [];
      const walk = (node: unknown, at: string): void => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node)) {
          if (key === '$ref' && typeof value === 'string') {
            const name = value.replace('#/components/schemas/', '');
            if (!name || !doc.components.schemas[name]) broken.push(`${at} -> ${value}`);
          } else walk(value, `${at}.${key}`);
        }
      };
      walk(doc, '');
      expect(broken).toEqual([]);
      expect(doc.components.schemas.User.properties.address).toEqual({ $ref: '#/components/schemas/Address' });
    });

    it('health probes answer', async () => {
      await http.get('/health/live').expect(200);
      const ready = await http.get('/health/ready').expect(200);
      expect(ready.body.status).toBe('ok');
    });

    it('GET /v1 is the machine-readable index', async () => {
      const res = await http.get('/v1').expect(200);
      expect(res.body.resources).toHaveLength(RESOURCES.length);
      expect(res.body.resources[0]).toMatchObject({ name: 'users', href: '/v1/users', group: 'Classic' });
    });
  });

  // Only when the page has been built (`pnpm build:web`); the API never depends on it.
  describe.runIf(existsSync(join(PUBLIC_DIR, 'index.html')))('landing page', () => {
    it('serves the page at / and caches hashed assets for a year', async () => {
      const page = await http.get('/').expect(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.headers['cache-control']).toContain('must-revalidate');
      const asset = /assets\/[\w-]+\.js/.exec(page.text)?.[0];
      expect(asset).toBeDefined();
      const js = await http.get(`/${asset}`).expect(200);
      expect(js.headers['cache-control']).toContain('immutable');
    });

    it('leaves unknown paths to the API (problem+json 404)', async () => {
      const res = await http.get('/not-a-page').expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });
});
