import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

const emptyToUndefined = ({ value }: { value: unknown }) => (value === '' ? undefined : value);

/** Every setting the app reads, with its default. Values come from the environment. */
export class Env {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt() @Min(1) @Max(65535)
  PORT: number = 3000;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string = 'info';

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  PUBLIC_BASE_URL?: string;

  @IsString()
  TRUST_PROXY: string = 'loopback,linklocal,uniquelocal';

  @IsString()
  CORS_ORIGINS: string = '*';

  @IsInt() @Min(1000)
  KEEP_ALIVE_TIMEOUT_MS: number = 65_000;

  /** On SIGTERM, readiness reports 503 for this long before the server stops. */
  @IsInt() @Min(0) @Max(120_000)
  SHUTDOWN_DELAY_MS: number = 5_000;

  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED: boolean = true;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsString()
  REDIS_KEY_PREFIX: string = 'fakerjson';

  @IsInt() @Min(0)
  CACHE_TTL_MS: number = 600_000;

  @IsInt() @Min(100)
  CACHE_MEMORY_MAX_ITEMS: number = 5_000;

  @IsInt() @Min(0)
  HTTP_CACHE_MAX_AGE_S: number = 300;

  @IsInt() @Min(1)
  RATE_LIMIT_TTL_MS: number = 60_000;

  @IsInt() @Min(1)
  RATE_LIMIT_LIMIT: number = 300;

  @IsInt() @Min(1)
  RATE_LIMIT_BURST_TTL_MS: number = 1_000;

  @IsInt() @Min(1)
  RATE_LIMIT_BURST_LIMIT: number = 25;

  @IsInt() @Min(1)
  RATE_LIMIT_WRITE_TTL_MS: number = 60_000;

  @IsInt() @Min(1)
  RATE_LIMIT_WRITE_LIMIT: number = 60;

  @IsInt() @Min(0) @Max(2_147_483_647)
  DEFAULT_SEED: number = 42;

  @IsInt() @Min(0) @Max(60_000)
  MAX_DELAY_MS: number = 10_000;

  @IsInt() @Min(1)
  DATASET_CACHE_SIZE: number = 64;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return env;
}
