import { ApiValidationException, type FieldError } from '../common/errors.js';
import type { AnyResource, FilterSpec, RelationSpec } from './resource.types.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Query parameters every endpoint accepts (handled outside the resource query). */
export const GLOBAL_PARAMS = ['seed', 'locale', 'delay'] as const;
const LIST_PARAMS = ['page', 'limit', 'sort', 'fields', 'q', 'expand'] as const;
const ITEM_PARAMS = ['fields', 'expand'] as const;

export type RawQuery = Record<string, string | string[] | undefined>;
export type FilterOp = 'eq' | 'ne' | 'gte' | 'lte';
export type FilterValue = string | number | boolean;

export interface ParsedFilter {
  spec: FilterSpec;
  op: FilterOp;
  values: FilterValue[];
}

export interface SortKey {
  field: string;
  desc: boolean;
}

export interface ItemQuery {
  fields?: string[];
  expand: RelationSpec[];
}

export interface ListQuery extends ItemQuery {
  page: number;
  limit: number;
  sort: SortKey[];
  q?: string;
  filters: ParsedFilter[];
}

const OP_SUFFIXES: Record<Exclude<FilterOp, 'eq'>, string> = { ne: '_ne', gte: '_gte', lte: '_lte' };

const asList = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const single = (v: string | string[] | undefined): string | undefined => asList(v).at(-1);

const splitCsv = (values: string[]) =>
  values.flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v.length > 0);

/** Every query parameter name a list endpoint accepts for this resource. */
export function filterParamNames(def: AnyResource): Map<string, { spec: FilterSpec; op: FilterOp }> {
  const map = new Map<string, { spec: FilterSpec; op: FilterOp }>();
  for (const spec of def.filters ?? []) {
    map.set(spec.field, { spec, op: 'eq' });
    map.set(spec.field + OP_SUFFIXES.ne, { spec, op: 'ne' });
    if (spec.range && (spec.type === 'number' || spec.type === 'date')) {
      map.set(spec.field + OP_SUFFIXES.gte, { spec, op: 'gte' });
      map.set(spec.field + OP_SUFFIXES.lte, { spec, op: 'lte' });
    }
  }
  return map;
}

function parseFilterValues(
  param: string,
  spec: FilterSpec,
  op: FilterOp,
  raw: string[],
  errors: FieldError[],
): FilterValue[] {
  // Strings may contain commas, so only repeated parameters give several string values.
  const values = spec.type === 'string' ? raw : splitCsv(raw);
  if (values.length === 0) {
    errors.push({ field: param, message: 'must not be empty' });
    return [];
  }
  if ((op === 'gte' || op === 'lte') && values.length > 1) {
    errors.push({ field: param, message: 'accepts a single value' });
    return [];
  }
  const out: FilterValue[] = [];
  for (const value of values) {
    switch (spec.type) {
      case 'number': {
        const n = Number(value);
        if (!Number.isFinite(n)) errors.push({ field: param, message: `"${value}" is not a number` });
        else out.push(n);
        break;
      }
      case 'boolean': {
        const v = value.toLowerCase();
        if (v === 'true' || v === '1') out.push(true);
        else if (v === 'false' || v === '0') out.push(false);
        else errors.push({ field: param, message: `"${value}" is not a boolean (true or false)` });
        break;
      }
      case 'enum': {
        if (spec.values?.includes(value)) out.push(value);
        else errors.push({ field: param, message: `"${value}" must be one of: ${spec.values?.join(', ')}` });
        break;
      }
      case 'date': {
        if (Number.isNaN(Date.parse(value))) {
          errors.push({ field: param, message: `"${value}" is not an ISO 8601 date` });
        } else {
          out.push(value);
        }
        break;
      }
      default:
        out.push(value.toLowerCase());
    }
  }
  return out;
}

function parseInteger(
  param: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  errors: FieldError[],
): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push({ field: param, message: `must be an integer between ${min} and ${max}` });
    return fallback;
  }
  return n;
}

function parseExpand(def: AnyResource, raw: RawQuery, errors: FieldError[]): RelationSpec[] {
  const names = splitCsv(asList(raw.expand));
  const relations = def.relations ?? [];
  const out: RelationSpec[] = [];
  for (const name of new Set(names)) {
    const rel = relations.find((r) => r.name === name);
    if (rel) out.push(rel);
    else {
      errors.push({
        field: 'expand',
        message: relations.length
          ? `"${name}" is not expandable; use one of: ${relations.map((r) => r.name).join(', ')}`
          : `${def.name} has no expandable relations`,
      });
    }
  }
  return out;
}

function parseFields(
  def: AnyResource,
  fieldNames: readonly string[],
  expand: RelationSpec[],
  raw: RawQuery,
  errors: FieldError[],
): string[] | undefined {
  if (raw.fields === undefined) return undefined;
  const requested = splitCsv(asList(raw.fields));
  const allowed = new Set([...fieldNames, ...expand.map((r) => r.name)]);
  for (const f of requested) {
    if (!allowed.has(f)) {
      errors.push({ field: 'fields', message: `"${f}" is not a field of ${def.name}` });
    }
  }
  return ['id', ...requested.filter((f) => f !== 'id')];
}

function rejectUnknown(raw: RawQuery, known: Set<string>, errors: FieldError[]): void {
  for (const key of Object.keys(raw)) {
    // `_`-prefixed parameters are cache busters (`_=1699999`) and are ignored.
    if (!known.has(key) && !key.startsWith('_')) {
      errors.push({ field: key, message: 'is not a supported query parameter' });
    }
  }
}

function fail(errors: FieldError[]): void {
  if (errors.length > 0) throw new ApiValidationException(errors);
}

export function parseItemQuery(def: AnyResource, fieldNames: readonly string[], raw: RawQuery): ItemQuery {
  const errors: FieldError[] = [];
  rejectUnknown(raw, new Set<string>([...ITEM_PARAMS, ...GLOBAL_PARAMS]), errors);
  const expand = parseExpand(def, raw, errors);
  const fields = parseFields(def, fieldNames, expand, raw, errors);
  fail(errors);
  return { expand, ...(fields && { fields }) };
}

export function parseListQuery(
  def: AnyResource,
  fieldNames: readonly string[],
  raw: RawQuery,
  /** Filter fields fixed by the route (e.g. `userId` under `/users/{id}/posts`). */
  excludeFilters: readonly string[] = [],
): ListQuery {
  const errors: FieldError[] = [];
  const filterParams = filterParamNames(def);
  for (const [param, { spec }] of filterParams) {
    if (excludeFilters.includes(spec.field)) filterParams.delete(param);
  }
  rejectUnknown(raw, new Set<string>([...LIST_PARAMS, ...GLOBAL_PARAMS, ...filterParams.keys()]), errors);

  const page = parseInteger('page', single(raw.page), 1, 1, 1_000_000, errors);
  const limit = parseInteger('limit', single(raw.limit), DEFAULT_LIMIT, 1, MAX_LIMIT, errors);

  const sortable = new Set(['id', ...(def.sortable ?? [])]);
  const sort: SortKey[] = [];
  for (const token of splitCsv(asList(raw.sort))) {
    const desc = token.startsWith('-');
    const field = desc || token.startsWith('+') ? token.slice(1) : token;
    if (sortable.has(field)) sort.push({ field, desc });
    else errors.push({ field: 'sort', message: `"${field}" is not sortable; use one of: ${[...sortable].join(', ')}` });
  }

  const qRaw = single(raw.q)?.trim();
  if (qRaw && !(def.searchable?.length)) {
    errors.push({ field: 'q', message: `${def.name} does not support full-text search` });
  }

  const filters: ParsedFilter[] = [];
  for (const [param, { spec, op }] of filterParams) {
    if (raw[param] === undefined) continue;
    const values = parseFilterValues(param, spec, op, asList(raw[param]), errors);
    if (values.length > 0) filters.push({ spec, op, values });
  }

  const expand = parseExpand(def, raw, errors);
  const fields = parseFields(def, fieldNames, expand, raw, errors);
  fail(errors);

  return {
    page,
    limit,
    sort,
    filters,
    expand,
    ...(qRaw ? { q: qRaw.toLowerCase() } : {}),
    ...(fields && { fields }),
  };
}
