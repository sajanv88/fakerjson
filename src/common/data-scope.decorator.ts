import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { NodeRequest } from '@nestjs/platform-node';
import { loadConfig } from '../config/app-config.js';
import { DEFAULT_LOCALE, LOCALE_CODES, isLocale } from '../data/locales.js';
import type { RawQuery } from '../data/query.js';
import type { DataScope } from '../data/resource.types.js';
import { ApiValidationException, type FieldError } from './errors.js';

export const MAX_SEED = 2_147_483_647;

const last = (v: string | string[] | undefined) => (Array.isArray(v) ? v.at(-1) : v);

/** Reads `?seed=` and `?locale=`, the two inputs that pick a dataset. */
export function parseScope(query: RawQuery): DataScope {
  const errors: FieldError[] = [];
  const config = loadConfig();

  let seed = config.DEFAULT_SEED;
  const rawSeed = last(query.seed);
  if (rawSeed !== undefined && rawSeed !== '') {
    const n = Number(rawSeed);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_SEED) seed = n;
    else errors.push({ field: 'seed', message: `must be an integer between 0 and ${MAX_SEED}` });
  }

  let locale = DEFAULT_LOCALE;
  const rawLocale = last(query.locale);
  if (rawLocale !== undefined && rawLocale !== '') {
    if (isLocale(rawLocale)) locale = rawLocale;
    else errors.push({ field: 'locale', message: `must be one of: ${LOCALE_CODES.join(', ')}` });
  }

  if (errors.length > 0) throw new ApiValidationException(errors);
  return { seed, locale };
}

/** Injects the request's `DataScope` (seed + locale). */
export const Scope = createParamDecorator((_: unknown, ctx: ExecutionContext): DataScope => {
  const req = ctx.switchToHttp().getRequest<NodeRequest>();
  return parseScope((req.query ?? {}) as RawQuery);
});
