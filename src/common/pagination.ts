import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { ApiProperty } from '@nestjs/swagger';
import { type Observable, tap } from 'rxjs';

export class PaginationMeta {
  @ApiProperty({ example: 1, description: 'Current page (1-based).' })
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page.' })
  limit: number;

  @ApiProperty({ example: 100, description: 'Items matching the query, across all pages.' })
  totalItems: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}

export class PaginationLinks {
  @ApiProperty({ example: '/v1/posts?page=1&limit=20' })
  self: string;

  @ApiProperty({ example: '/v1/posts?page=1&limit=20' })
  first: string;

  @ApiProperty({ example: '/v1/posts?page=5&limit=20' })
  last: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  prev: string | null;

  @ApiProperty({ type: String, nullable: true, example: '/v1/posts?page=2&limit=20' })
  next: string | null;
}

export interface Page<T> {
  data: T[];
  meta: PaginationMeta;
  links: PaginationLinks;
}

const pageTypes = new Map<Type, Type>();

/** A named `{ data, meta, links }` schema per entity, e.g. `PostPage`. */
export function PageOf<T>(entity: Type<T>): Type<Page<T>> {
  const existing = pageTypes.get(entity);
  if (existing) return existing as Type<Page<T>>;

  class PageType implements Page<T> {
    @ApiProperty({ type: () => [entity] })
    data: T[];

    @ApiProperty({ type: () => PaginationMeta })
    meta: PaginationMeta;

    @ApiProperty({ type: () => PaginationLinks })
    links: PaginationLinks;
  }
  Object.defineProperty(PageType, 'name', { value: `${entity.name}Page` });
  pageTypes.set(entity, PageType);
  return PageType;
}

export function buildPage<T>(req: NodeRequest, data: T[], total: number, page: number, limit: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const url = req.url ?? '/';
  const qIndex = url.indexOf('?');
  const path = qIndex === -1 ? url : url.slice(0, qIndex);
  const base = new URLSearchParams(qIndex === -1 ? '' : url.slice(qIndex + 1));
  // Same parameters the cache key ignores, so a cached page never leaks them.
  for (const key of Array.from(base.keys())) if (key === 'delay' || key.startsWith('_')) base.delete(key);

  const link = (p: number) => {
    const params = new URLSearchParams(base);
    params.set('page', String(p));
    params.set('limit', String(limit));
    // Commas are legal in a query string; keep `fields=id,title` readable.
    return `${path}?${params.toString().replaceAll('%2C', ',')}`;
  };

  return {
    data,
    meta: {
      page,
      limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    links: {
      self: link(page),
      first: link(1),
      last: link(totalPages),
      prev: page > 1 ? link(Math.min(page - 1, totalPages)) : null,
      next: page < totalPages ? link(page + 1) : null,
    },
  };
}

function isPage(body: unknown): body is Page<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    'meta' in body &&
    'links' in body &&
    Array.isArray((body as Page<unknown>).data)
  );
}

/**
 * Mirrors the pagination envelope into `X-Total-Count` and an RFC 8288 `Link`
 * header. Registered outside the cache, so cached pages get the headers too.
 */
@Injectable()
export class PaginationHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const res = context.switchToHttp().getResponse<NodeResponse>();
    return next.handle().pipe(
      tap((body) => {
        if (!isPage(body) || res.headersSent) return;
        const { links, meta } = body;
        res.setHeader('X-Total-Count', String(meta.totalItems));
        const rels = (['first', 'prev', 'next', 'last'] as const)
          .filter((rel) => links[rel])
          .map((rel) => `<${links[rel]}>; rel="${rel}"`);
        res.setHeader('Link', rels.join(', '));
      }),
    );
  }
}
