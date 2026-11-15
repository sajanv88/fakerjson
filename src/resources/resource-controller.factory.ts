import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  type Type,
  applyDecorators,
} from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Scope } from '../common/data-scope.decorator.js';
import { ApiValidationException, type FieldError } from '../common/errors.js';
import {
  ApiCommonProblems,
  ApiConditionalGet,
  ApiGlobalParams,
  ApiNotFoundProblem,
  ApiValidationProblem,
} from '../common/openapi.js';
import { PageOf, buildPage } from '../common/pagination.js';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { BodyPipe, readOnlyFields } from '../common/validation.js';
import { DatasetService } from '../data/dataset.service.js';
import { DEFAULT_LIMIT, MAX_LIMIT, type RawQuery, parseItemQuery, parseListQuery } from '../data/query.js';
import type { AnyResource, DataScope, Entity } from '../data/resource.types.js';

export const pascal = (s: string) =>
  s.replace(/(^|[-_ ])(\w)/g, (_, __, c: string) => c.toUpperCase());

/** Swagger tag: the family first, so related resources sit together in the UI. */
type HeadersObject = Record<string, { description?: string; schema: { type: 'integer' | 'string' } }>;

export const tagOf = (def: AnyResource) => `${def.group} · ${pascal(def.name)}`;

const RATE_LIMIT_HEADERS: HeadersObject = {
  'X-RateLimit-Limit': { description: 'Requests allowed per window.', schema: { type: 'integer' } },
  'X-RateLimit-Remaining': { description: 'Requests left in the window.', schema: { type: 'integer' } },
  'X-RateLimit-Reset': { description: 'Seconds until the window resets.', schema: { type: 'integer' } },
};

const READ_HEADERS: HeadersObject = {
  ETag: { description: 'Fingerprint of the body, for If-None-Match.', schema: { type: 'string' } },
  'Cache-Control': { schema: { type: 'string' } },
  'X-Cache': { description: 'HIT or MISS in the server-side cache.', schema: { type: 'string' } },
  ...RATE_LIMIT_HEADERS,
};

const LIST_HEADERS: HeadersObject = {
  'X-Total-Count': { description: 'Items matching the query, across all pages.', schema: { type: 'integer' } },
  Link: { description: 'RFC 8288 links: first, prev, next, last.', schema: { type: 'string' } },
  ...READ_HEADERS,
};

function listQueryDocs(def: AnyResource, exclude: readonly string[] = []) {
  const decorators: (MethodDecorator & ClassDecorator)[] = [
    ApiQuery({ name: 'page', required: false, schema: { type: 'integer', minimum: 1, default: 1 } }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      schema: { type: 'string' },
      description: `Comma-separated fields; prefix with \`-\` for descending. Sortable: ${['id', ...(def.sortable ?? [])].join(', ')}.`,
      example: def.sortable?.[0] ? `-${def.sortable[0]}` : '-id',
    }),
    ApiQuery({
      name: 'fields',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated top-level fields to return (`id` is always included).',
    }),
  ];
  if (def.searchable?.length) {
    decorators.push(
      ApiQuery({
        name: 'q',
        required: false,
        schema: { type: 'string' },
        description: `Case-insensitive search across: ${def.searchable.join(', ')}.`,
      }),
    );
  }
  if (def.relations?.length) {
    decorators.push(
      ApiQuery({
        name: 'expand',
        required: false,
        schema: { type: 'string' },
        description: `Comma-separated relations to embed: ${def.relations.map((r) => r.name).join(', ')}.`,
      }),
    );
  }
  for (const f of def.filters ?? []) {
    if (exclude.includes(f.field)) continue;
    const schema =
      f.type === 'enum'
        ? { type: 'string' as const, enum: [...(f.values ?? [])] }
        : f.type === 'number'
          ? { type: 'number' as const }
          : f.type === 'boolean'
            ? { type: 'boolean' as const }
            : f.type === 'date'
              ? { type: 'string' as const, format: 'date' }
              : { type: 'string' as const };
    decorators.push(
      ApiQuery({
        name: f.field,
        required: false,
        schema,
        description:
          (f.description ?? `Filter by ${f.field}.`) +
          (f.type === 'string' ? ' Repeat the parameter to match any of several values.' : ' Comma-separate to match any of several values.'),
      }),
    );
    if (f.range && (f.type === 'number' || f.type === 'date')) {
      const rangeSchema = f.type === 'date' ? { type: 'string' as const, format: 'date' } : { type: 'number' as const };
      decorators.push(
        ApiQuery({ name: `${f.field}_gte`, required: false, schema: rangeSchema, description: `${f.field} ≥ value.` }),
        ApiQuery({ name: `${f.field}_lte`, required: false, schema: rangeSchema, description: `${f.field} ≤ value.` }),
      );
    }
  }
  return applyDecorators(...decorators);
}

function itemQueryDocs(def: AnyResource) {
  const decorators: (MethodDecorator & ClassDecorator)[] = [
    ApiQuery({
      name: 'fields',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated top-level fields to return (`id` is always included).',
    }),
  ];
  if (def.relations?.length) {
    decorators.push(
      ApiQuery({
        name: 'expand',
        required: false,
        schema: { type: 'string' },
        description: `Comma-separated relations to embed: ${def.relations.map((r) => r.name).join(', ')}.`,
      }),
    );
  }
  return applyDecorators(...decorators);
}

const filterHelp = (def: AnyResource) =>
  def.filters?.length
    ? ' Every filter also has a negated form, `<field>_ne`. Filters, search and sort combine with pagination.'
    : '';

/** Copies own enumerable properties of the validated DTO into a plain object. */
const plain = (body: object) => JSON.parse(JSON.stringify(body)) as Record<string, unknown>;

/**
 * Builds the CRUD controller for one resource, plus `/{parent}/{id}/{resource}`
 * when the resource has a parent. Writes are validated and answered realistically
 * but never persisted, like JSONPlaceholder.
 */
export function createResourceControllers(def: AnyResource, all: readonly AnyResource[]): Type[] {
  const EntityType = def.entity;
  const PageType = PageOf(EntityType);
  const Singular = pascal(def.singular);
  const Plural = pascal(def.name);
  const ignored = readOnlyFields(EntityType, def.createDto);
  const idParam = ApiParam({
    name: 'id',
    schema: { type: 'integer', minimum: 1, maximum: def.count, example: 1 },
    description: `${Singular} id (1–${def.count}).`,
  });

  @ApiTags(tagOf(def))
  @ApiCommonProblems()
  @Controller({ path: def.name, version: '1' })
  class ResourceController {
    constructor(@Inject(DatasetService) readonly data: DatasetService) {}

    @Get()
    @ApiOperation({
      operationId: `list${Plural}`,
      summary: `List ${def.name}`,
      description: `${def.description} ${def.count} rows, paginated.${filterHelp(def)}`,
    })
    @listQueryDocs(def)
    @ApiGlobalParams()
    @ApiConditionalGet()
    @ApiOkResponse({ type: PageType, headers: LIST_HEADERS })
    list(@Req() req: NodeRequest, @Scope() scope: DataScope) {
      const query = parseListQuery(def, this.data.fieldNames(def), req.query as RawQuery);
      const { data, total } = this.data.list(def, scope, query);
      return buildPage(req, data, total, query.page, query.limit);
    }

    @Get(':id')
    @ApiOperation({ operationId: `get${Singular}`, summary: `Get a ${def.singular}` })
    @idParam
    @itemQueryDocs(def)
    @ApiGlobalParams()
    @ApiConditionalGet()
    @ApiOkResponse({ type: EntityType, headers: READ_HEADERS })
    @ApiNotFoundProblem(Singular)
    get(@Param('id', new ParseIdPipe()) id: number, @Req() req: NodeRequest, @Scope() scope: DataScope) {
      const query = parseItemQuery(def, this.data.fieldNames(def), req.query as RawQuery);
      const row = this.data.findOne(def, id, scope, query);
      if (!row) throw new NotFoundException(`${Singular} ${id} not found.`);
      return row;
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
      operationId: `create${Singular}`,
      summary: `Create a ${def.singular}`,
      description: `Validates the body and returns the ${def.singular} as it would be stored, with id ${def.count + 1}. Nothing is persisted.`,
    })
    @ApiBody({ type: def.createDto })
    @ApiGlobalParams()
    @ApiCreatedResponse({
      type: EntityType,
      headers: { Location: { description: 'URL of the new resource.', schema: { type: 'string' } }, ...RATE_LIMIT_HEADERS },
    })
    @ApiValidationProblem()
    create(
      @Body(new BodyPipe(def.createDto, ignored)) body: object,
      @Res({ passthrough: true }) res: NodeResponse,
      @Scope() scope: DataScope,
    ) {
      const input = plain(body);
      this.assertRelations(input);
      const id = def.count + 1;
      const now = new Date().toISOString();
      res.setHeader('Location', `/v1/${def.name}/${id}`);
      const created = { id, ...input, createdAt: now, updatedAt: now } as Entity;
      return this.derive(created, scope);
    }

    @Put(':id')
    @ApiOperation({
      operationId: `replace${Singular}`,
      summary: `Replace a ${def.singular}`,
      description: 'Full replacement: every writable field is required. Nothing is persisted.',
    })
    @idParam
    @ApiBody({ type: def.replaceDto })
    @ApiGlobalParams()
    @ApiOkResponse({ type: EntityType, headers: RATE_LIMIT_HEADERS })
    @ApiNotFoundProblem(Singular)
    @ApiValidationProblem()
    replace(
      @Param('id', new ParseIdPipe()) id: number,
      @Body(new BodyPipe(def.replaceDto, ignored)) body: object,
      @Scope() scope: DataScope,
    ) {
      const existing = this.require(id, scope);
      const input = plain(body);
      this.assertRelations(input);
      const replaced = {
        id,
        ...input,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      } as Entity;
      return this.derive(replaced, scope);
    }

    @Patch(':id')
    @ApiOperation({
      operationId: `update${Singular}`,
      summary: `Update a ${def.singular}`,
      description: 'Partial update: only the fields sent change. Nothing is persisted.',
    })
    @idParam
    @ApiBody({ type: def.patchDto })
    @ApiGlobalParams()
    @ApiOkResponse({ type: EntityType, headers: RATE_LIMIT_HEADERS })
    @ApiNotFoundProblem(Singular)
    @ApiValidationProblem()
    update(
      @Param('id', new ParseIdPipe()) id: number,
      @Body(new BodyPipe(def.patchDto, ignored)) body: object,
      @Scope() scope: DataScope,
    ) {
      const existing = this.require(id, scope);
      const input = plain(body);
      this.assertRelations(input);
      const updated = { ...existing, ...input, id, updatedAt: new Date().toISOString() } as Entity;
      return this.derive(updated, scope);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
      operationId: `delete${Singular}`,
      summary: `Delete a ${def.singular}`,
      description: 'Returns 204 when the row exists. Nothing is deleted.',
    })
    @idParam
    @ApiGlobalParams()
    @ApiNoContentResponse({ description: 'Deleted.', headers: RATE_LIMIT_HEADERS })
    @ApiNotFoundProblem(Singular)
    remove(@Param('id', new ParseIdPipe()) id: number, @Scope() scope: DataScope): void {
      this.require(id, scope);
    }

    private require(id: number, scope: DataScope): Entity {
      const row = this.data.find(def, id, scope);
      if (!row) throw new NotFoundException(`${Singular} ${id} not found.`);
      return row;
    }

    /** Foreign keys in a body must point at rows that exist (422 otherwise). */
    private assertRelations(input: Record<string, unknown>): void {
      const errors: FieldError[] = [];
      for (const rel of def.relations ?? []) {
        const value = input[rel.key];
        if (value === undefined || (value === null && rel.nullable)) continue;
        if (typeof value !== 'number' || !this.data.exists(rel.resource, value)) {
          errors.push({ field: rel.key, message: `${pascal(all.find((d) => d.name === rel.resource)?.singular ?? rel.resource)} ${JSON.stringify(value)} does not exist` });
        }
      }
      if (errors.length) throw new ApiValidationException(errors, HttpStatus.UNPROCESSABLE_ENTITY, 'The request body references rows that do not exist.');
    }

    private derive(row: Entity, scope: DataScope): Entity {
      return def.derive ? { ...row, ...def.derive(row, (r, i) => this.data.find(this.data.registry.get(r), i, scope)) } : row;
    }
  }
  Object.defineProperty(ResourceController, 'name', { value: `${Plural}Controller` });

  const controllers: Type[] = [ResourceController];

  if (def.parent) {
    const parentKey = def.parent.key;
    const found = all.find((d) => d.name === def.parent!.resource);
    if (!found) throw new Error(`${def.name}: unknown parent ${def.parent.resource}`);
    const parentDef: AnyResource = found;
    const ParentSingular = pascal(parentDef.singular);
    const paramName = `${parentDef.singular}Id`;

    @ApiTags(tagOf(parentDef))
    @ApiCommonProblems()
    @Controller({ path: `${parentDef.name}/:${paramName}/${def.name}`, version: '1' })
    class NestedController {
      constructor(@Inject(DatasetService) readonly data: DatasetService) {}

      @Get()
      @ApiOperation({
        operationId: `list${ParentSingular}${Plural}`,
        summary: `List the ${def.name} of a ${parentDef.singular}`,
        description: `Same as \`GET /v1/${def.name}?${parentKey}={${paramName}}\`, with a 404 when the ${parentDef.singular} does not exist.${filterHelp(def)}`,
      })
      @ApiParam({
        name: paramName,
        schema: { type: 'integer', minimum: 1, maximum: parentDef.count, example: 1 },
      })
      @listQueryDocs(def, [parentKey])
      @ApiGlobalParams()
      @ApiConditionalGet()
      @ApiOkResponse({ type: PageType, headers: LIST_HEADERS })
      @ApiNotFoundProblem(ParentSingular)
      list(@Param(paramName, new ParseIdPipe(paramName)) parentId: number, @Req() req: NodeRequest, @Scope() scope: DataScope) {
        if (!this.data.exists(parentDef.name, parentId)) {
          throw new NotFoundException(`${ParentSingular} ${parentId} not found.`);
        }
        const query = parseListQuery(def, this.data.fieldNames(def), req.query as RawQuery, [parentKey]);
        query.filters.push({ spec: { field: parentKey, type: 'number' }, op: 'eq', values: [parentId] });
        const { data, total } = this.data.list(def, scope, query);
        return buildPage(req, data, total, query.page, query.limit);
      }
    }
    Object.defineProperty(NestedController, 'name', { value: `${ParentSingular}${Plural}Controller` });
    controllers.push(NestedController);
  }

  return controllers;
}
