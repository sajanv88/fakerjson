import { ApiValidationException } from '../common/errors.js';
import { hashSeed } from './locales.js';
import { Lru } from './lru.js';
import { DEFAULT_LIMIT, parseItemQuery, parseListQuery } from './query.js';
import type { AnyResource } from './resource.types.js';

const def = {
  name: 'posts',
  singular: 'post',
  filters: [
    { field: 'userId', type: 'number' },
    { field: 'status', type: 'enum', values: ['draft', 'published'] },
    { field: 'title', type: 'string' },
    { field: 'views', type: 'number', range: true },
    { field: 'publishedAt', type: 'date', range: true },
  ],
  sortable: ['title', 'views'],
  searchable: ['title'],
  relations: [{ name: 'user', key: 'userId', resource: 'users' }],
} as unknown as AnyResource;

const fields = ['id', 'userId', 'title', 'status', 'views', 'publishedAt'];

function errorsOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof ApiValidationException) return e.errors.map((x) => x.field).sort();
    throw e;
  }
  return [];
}

describe('parseListQuery', () => {
  it('applies defaults', () => {
    const q = parseListQuery(def, fields, {});
    expect(q).toMatchObject({ page: 1, limit: DEFAULT_LIMIT, sort: [], filters: [], expand: [] });
    expect(q.fields).toBeUndefined();
  });

  it('parses sort, fields, expand, search and typed filters', () => {
    const q = parseListQuery(def, fields, {
      sort: '-views,title',
      fields: 'title,user',
      expand: 'user',
      q: '  Hello ',
      status: 'draft,published',
      views_gte: '10',
      title: ['A, b', 'C'],
    });
    expect(q.sort).toEqual([{ field: 'views', desc: true }, { field: 'title', desc: false }]);
    expect(q.fields).toEqual(['id', 'title', 'user']);
    expect(q.expand.map((r) => r.name)).toEqual(['user']);
    expect(q.q).toBe('hello');
    const byParam = Object.fromEntries(q.filters.map((f) => [`${f.spec.field}:${f.op}`, f.values]));
    expect(byParam).toEqual({
      'status:eq': ['draft', 'published'],
      'views:gte': [10],
      // String filters keep commas; repeat the parameter for several values.
      'title:eq': ['a, b', 'c'],
    });
  });

  it('reports every invalid parameter at once', () => {
    expect(
      errorsOf(() =>
        parseListQuery(def, fields, {
          page: '0',
          limit: '101',
          sort: 'body',
          status: 'nope',
          views: 'abc',
          publishedAt_gte: 'yesterday',
          fields: 'secret',
          expand: 'comments',
          unknown: '1',
        }),
      ),
    ).toEqual(['expand', 'fields', 'limit', 'page', 'publishedAt_gte', 'sort', 'status', 'unknown', 'views']);
  });

  it('accepts global and cache-buster parameters', () => {
    expect(() => parseListQuery(def, fields, { seed: '1', locale: 'de', delay: '10', _: '123' })).not.toThrow();
  });

  it('drops the route-bound parent filter from the accepted parameters', () => {
    expect(errorsOf(() => parseListQuery(def, fields, { userId: '2' }, ['userId']))).toEqual(['userId']);
  });
});

describe('parseItemQuery', () => {
  it('only accepts fields and expand', () => {
    expect(errorsOf(() => parseItemQuery(def, fields, { page: '2' }))).toEqual(['page']);
    expect(parseItemQuery(def, fields, { expand: 'user' }).expand).toHaveLength(1);
  });
});

describe('hashSeed / Lru', () => {
  it('hashSeed is stable and spreads inputs', () => {
    expect(hashSeed(42, 'users', 1)).toBe(hashSeed(42, 'users', 1));
    expect(hashSeed(42, 'users', 1)).not.toBe(hashSeed(42, 'users', 2));
  });

  it('Lru evicts the least recently used entry', () => {
    const lru = new Lru<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.get('a');
    lru.set('c', 3);
    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(1);
    expect(lru.size).toBe(2);
  });
});
