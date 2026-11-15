import { Injectable } from '@nestjs/common';
import { type AppConfig, InjectConfig } from '../config/app-config.js';
import { telemetry, tracer } from '../telemetry/telemetry.js';
import { LOCALES, REFERENCE_DATE, hashSeed } from './locales.js';
import { Lru } from './lru.js';
import type { ItemQuery, ListQuery, ParsedFilter, SortKey } from './query.js';
import { ResourceRegistry } from './resource.registry.js';
import type {
  AnyResource,
  DataScope,
  Entity,
  GenerateContext,
  RelationSpec,
} from './resource.types.js';

export interface ListResult {
  data: Record<string, unknown>[];
  total: number;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function getPath(obj: Record<string, unknown>, path: string): unknown {
  if (!path.includes('.')) return obj[path];
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  // Sortable fields are scalars (strings, ISO dates).
  return collator.compare(String(a as string), String(b as string));
}

function matchesFilter(item: Entity, filter: ParsedFilter): boolean {
  const { spec, op, values } = filter;
  const actual = getPath(item, spec.field);

  if (spec.type === 'date') {
    if (typeof actual !== 'string') return op === 'ne';
    const t = Date.parse(actual);
    switch (op) {
      case 'gte':
        return t >= Date.parse(values[0] as string);
      case 'lte': {
        // A bare date (2025-05-01) includes that whole day.
        const v = values[0] as string;
        const bound = v.length === 10 ? Date.parse(v) + 86_399_999 : Date.parse(v);
        return t <= bound;
      }
      case 'eq':
        return values.some((v) => actual.startsWith(v as string));
      case 'ne':
        return !values.some((v) => actual.startsWith(v as string));
    }
  }

  const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : v);
  // Array fields (tags) match when any element matches.
  const candidates = Array.isArray(actual) ? actual.map(norm) : [norm(actual)];
  const hit = candidates.some((c) => values.includes(c as never));
  switch (op) {
    case 'eq':
      return hit;
    case 'ne':
      return !hit;
    case 'gte':
      return typeof actual === 'number' && actual >= (values[0] as number);
    case 'lte':
      return typeof actual === 'number' && actual <= (values[0] as number);
  }
}

/**
 * Generates rows on demand from (seed, locale, resource, id), so any row can be
 * produced in O(1) without materialising the table. Full tables are only built for
 * searching, filtering or sorting, and kept in an LRU.
 */
@Injectable()
export class DatasetService {
  private readonly collections: Lru<string, Entity[]>;
  private readonly fieldNameCache = new Map<string, string[]>();

  constructor(
    readonly registry: ResourceRegistry,
    @InjectConfig() private readonly config: AppConfig,
  ) {
    this.collections = new Lru(config.DATASET_CACHE_SIZE);
  }

  defaultScope(): DataScope {
    return { seed: this.config.DEFAULT_SEED, locale: 'en' };
  }

  exists(resource: string, id: number): boolean {
    return Number.isInteger(id) && id >= 1 && id <= this.registry.get(resource).count;
  }

  /** Top-level field names, used to validate `?fields=`. */
  fieldNames(def: AnyResource): string[] {
    let names = this.fieldNameCache.get(def.name);
    if (!names) {
      names = Object.keys(this.generate(def, 1, this.defaultScope()));
      this.fieldNameCache.set(def.name, names);
    }
    return names;
  }

  /** The stored row, or undefined when the id is out of range. Never mutate the result. */
  find(def: AnyResource, id: number, scope: DataScope): Entity | undefined {
    if (!this.exists(def.name, id)) return undefined;
    return this.collections.get(this.collectionKey(def, scope))?.[id - 1] ?? this.generate(def, id, scope);
  }

  findOne(def: AnyResource, id: number, scope: DataScope, query: ItemQuery): Record<string, unknown> | undefined {
    const row = this.find(def, id, scope);
    return row && this.shape(row, query, scope);
  }

  list(def: AnyResource, scope: DataScope, query: ListQuery): ListResult {
    let filters = query.filters;
    let ids: { from: number; to: number } = { from: 1, to: def.count };

    // Parent filter (`?userId=3` or `/users/3/posts`) maps to a contiguous id range.
    const parent = def.parent;
    if (parent) {
      const idx = filters.findIndex(
        (f) => f.spec.field === parent.key && f.op === 'eq' && f.values.length === 1,
      );
      if (idx !== -1) {
        const parentId = filters[idx]!.values[0] as number;
        if (!this.exists(parent.resource, parentId)) return { data: [], total: 0 };
        ids = {
          from: (parentId - 1) * parent.perParent + 1,
          to: parentId * parent.perParent,
        };
        filters = filters.filter((_, i) => i !== idx);
      }
    }

    const start = (query.page - 1) * query.limit;
    const sortById = query.sort.length === 0 || (query.sort.length === 1 && query.sort[0]!.field === 'id');

    // Fast path: no filtering or sorting beyond id, so the page is a slice of ids.
    if (filters.length === 0 && !query.q && sortById) {
      const total = ids.to - ids.from + 1;
      const desc = query.sort[0]?.desc ?? false;
      const data: Record<string, unknown>[] = [];
      for (let i = start; i < Math.min(start + query.limit, total); i++) {
        const id = desc ? ids.to - i : ids.from + i;
        data.push(this.shape(this.find(def, id, scope)!, query, scope));
      }
      return { data, total };
    }

    let rows =
      ids.from === 1 && ids.to === def.count
        ? this.collection(def, scope)
        : this.range(def, ids.from, ids.to, scope);

    if (filters.length > 0) rows = rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
    if (query.q) rows = rows.filter((row) => this.matchesSearch(def, row, query.q!));
    if (!sortById || query.sort[0]?.desc) rows = this.sorted(rows, query.sort);

    return {
      total: rows.length,
      data: rows.slice(start, start + query.limit).map((row) => this.shape(row, query, scope)),
    };
  }

  /** Builds one row deterministically. */
  generate(def: AnyResource, id: number, scope: DataScope): Entity {
    const faker = LOCALES[scope.locale];
    const baseSeed = hashSeed(scope.seed, def.name, id);
    faker.seed(baseSeed);
    let nested = 0;

    const ctx: GenerateContext = {
      faker,
      id,
      scope,
      parentId: def.parent ? Math.ceil(id / def.parent.perParent) : 0,
      count: (resource) => this.registry.get(resource).count,
      pickId: (resource) => faker.number.int({ min: 1, max: this.registry.get(resource).count }),
      get: <T,>(resource: string, relatedId: number) => {
        const related = this.find(this.registry.get(resource), relatedId, scope) as T;
        // Generating the related row reseeded the shared instance; continue deterministically.
        faker.seed(hashSeed(baseSeed, 'nested', ++nested));
        return related;
      },
      timestamps: () => {
        const created = faker.date.past({ years: 3 });
        const updated = faker.date.between({ from: created, to: REFERENCE_DATE });
        return { createdAt: created.toISOString(), updatedAt: updated.toISOString() };
      },
    };

    const row = def.generate(ctx);
    return { ...row, id };
  }

  private collectionKey(def: AnyResource, scope: DataScope): string {
    return `${scope.seed}:${scope.locale}:${def.name}`;
  }

  private collection(def: AnyResource, scope: DataScope): Entity[] {
    const key = this.collectionKey(def, scope);
    let rows = this.collections.get(key);
    if (!rows) {
      rows = tracer.startActiveSpan('dataset.materialize', (span) => {
        const started = performance.now();
        try {
          const built = this.range(def, 1, def.count, scope);
          span.setAttributes({ 'fakerjson.resource': def.name, 'fakerjson.rows': built.length });
          return built;
        } finally {
          telemetry.materializeDuration.record(performance.now() - started, { resource: def.name });
          span.end();
        }
      });
      this.collections.set(key, rows);
    }
    return rows;
  }

  private range(def: AnyResource, from: number, to: number, scope: DataScope): Entity[] {
    const rows: Entity[] = [];
    for (let id = from; id <= to; id++) rows.push(this.find(def, id, scope)!);
    return rows;
  }

  private matchesSearch(def: AnyResource, row: Entity, q: string): boolean {
    return (def.searchable ?? []).some((field) => {
      const value = getPath(row, field);
      if (typeof value === 'string') return value.toLowerCase().includes(q);
      if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
      return false;
    });
  }

  private sorted(rows: Entity[], sort: SortKey[]): Entity[] {
    const keys = [...sort, { field: 'id', desc: false }];
    return [...rows].sort((a, b) => {
      for (const { field, desc } of keys) {
        const c = compareValues(getPath(a, field), getPath(b, field));
        if (c !== 0) return desc ? -c : c;
      }
      return 0;
    });
  }

  /** Applies `expand` and `fields` to a copy of the row. */
  private shape(row: Entity, query: ItemQuery, scope: DataScope): Record<string, unknown> {
    if (query.expand.length === 0 && !query.fields) return row;
    const out: Record<string, unknown> = { ...row };
    for (const rel of query.expand) out[rel.name] = this.expandOne(rel, row, scope);
    if (!query.fields) return out;
    return Object.fromEntries(query.fields.filter((f) => f in out).map((f) => [f, out[f]]));
  }

  private expandOne(rel: RelationSpec, row: Entity, scope: DataScope): Entity | null {
    const id = row[rel.key];
    if (typeof id !== 'number') return null;
    return this.find(this.registry.get(rel.resource), id, scope) ?? null;
  }
}
