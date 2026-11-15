import type { Type } from '@nestjs/common';
import type { Faker } from '@faker-js/faker';
import type { LocaleCode } from './locales.js';

export type Entity = { id: number } & Record<string, unknown>;

export const RESOURCE_GROUPS = ['Classic', 'E-commerce', 'Business', 'Social'] as const;
export type ResourceGroup = (typeof RESOURCE_GROUPS)[number];

export type FilterType = 'number' | 'string' | 'boolean' | 'enum' | 'date';

export interface FilterSpec {
  /** Entity field, dotted paths allowed (e.g. `address.city`). Also the query parameter name. */
  field: string;
  type: FilterType;
  /** Allowed values for `enum` filters. */
  values?: readonly string[];
  /** Adds `<field>_gte` and `<field>_lte` (number and date filters). */
  range?: boolean;
  description?: string;
}

/** A many-to-one link: `key` on this entity holds the id of a `resource` row. */
export interface RelationSpec {
  /** Name used by `?expand=` and as the property the related object is attached to. */
  name: string;
  key: string;
  resource: string;
  nullable?: boolean;
}

/**
 * Children are laid out contiguously: rows `(p-1)*perParent+1 .. p*perParent`
 * belong to parent `p`. That makes `/users/3/posts` an O(page) lookup.
 */
export interface ParentSpec {
  resource: string;
  key: string;
  perParent: number;
}

export interface DataScope {
  seed: number;
  locale: LocaleCode;
}

export interface GenerateContext {
  readonly faker: Faker;
  readonly id: number;
  readonly scope: DataScope;
  /** Parent id derived from `ParentSpec` (undefined for top-level resources). */
  readonly parentId: number;
  readonly count: (resource: string) => number;
  /** A random, valid id of another resource. */
  readonly pickId: (resource: string) => number;
  /** The deterministic row of another resource (e.g. the product inside an order line). */
  readonly get: <T = Entity>(resource: string, id: number) => T;
  /** `createdAt` in the three years before the reference date, `updatedAt` after it. */
  readonly timestamps: () => { createdAt: string; updatedAt: string };
}

export interface ResourceDefinition<T extends { id: number } = Entity> {
  /** Plural, kebab-case path segment: `posts`. */
  name: string;
  /** Singular label used in summaries and operation ids: `post`. */
  singular: string;
  group: ResourceGroup;
  description: string;
  count: number;
  entity: Type<T>;
  createDto: Type<unknown>;
  replaceDto: Type<unknown>;
  patchDto: Type<unknown>;
  parent?: ParentSpec;
  /** Expandable many-to-one relations. Their keys are also checked on writes. */
  relations?: RelationSpec[];
  filters?: FilterSpec[];
  sortable?: string[];
  searchable?: string[];
  generate(ctx: GenerateContext): T;
  /**
   * Recomputes server-owned fields (slugs, totals, numbers) after a create/replace/update,
   * so a faked write answers with a consistent entity.
   */
  derive?(row: T, lookup: (resource: string, id: number) => Entity | undefined): Partial<T>;
}

export type AnyResource = ResourceDefinition<any>;

/** Identity helper that infers `T` from `entity`, so `generate` and `derive` are type-checked. */
export const defineResource = <T extends { id: number }>(def: ResourceDefinition<T>): ResourceDefinition<T> => def;
