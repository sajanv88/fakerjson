import { applyDecorators } from '@nestjs/common';
import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Field decorators that declare the OpenAPI schema and the validation rule together,
 * so the docs never drift from what the API accepts.
 */

type Doc = Pick<ApiPropertyOptions, 'description' | 'example'>;

const optional = (nullable?: boolean) => (nullable ? [IsOptional()] : []);

export const Id = () => ApiProperty({ type: 'integer', example: 1, readOnly: true, description: 'Unique id.' });

export const CreatedAt = () =>
  ApiProperty({ type: String, format: 'date-time', readOnly: true, example: '2024-05-01T09:30:00.000Z' });

export const UpdatedAt = () =>
  ApiProperty({ type: String, format: 'date-time', readOnly: true, example: '2025-02-14T16:05:00.000Z' });

/**
 * Read-only field computed by the server. Clients may send it back (e.g. GET then PUT);
 * it is accepted and recomputed, never trusted.
 */
export const Computed = (opts: ApiPropertyOptions) =>
  applyDecorators(ApiProperty({ ...opts, readOnly: true } as ApiPropertyOptions), Allow());

export const Text = (min: number, max: number, doc: Doc = {}, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: String, minLength: min, maxLength: max, nullable, ...doc }),
    ...optional(nullable),
    IsString(),
    Length(min, max),
  );

export const Email = (doc: Doc = {}) =>
  applyDecorators(ApiProperty({ type: String, format: 'email', ...doc }), IsEmail());

export const Url = (doc: Doc = {}, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: String, format: 'uri', nullable, ...doc }),
    ...optional(nullable),
    IsUrl({ require_tld: false }),
  );

export const Int = (min: number, max: number, doc: Doc = {}, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: 'integer', minimum: min, maximum: max, nullable, ...doc }),
    ...optional(nullable),
    IsInt(),
    Min(min),
    Max(max),
  );

export const Decimal = (min: number, max: number, doc: Doc = {}, places = 2) =>
  applyDecorators(
    ApiProperty({ type: Number, minimum: min, maximum: max, ...doc }),
    IsNumber({ maxDecimalPlaces: places, allowNaN: false, allowInfinity: false }),
    Min(min),
    Max(max),
  );

export const Bool = (doc: Doc = {}) => applyDecorators(ApiProperty({ type: Boolean, ...doc }), IsBoolean());

export const OneOf = <T extends string>(values: readonly T[], doc: Doc = {}) =>
  applyDecorators(ApiProperty({ type: String, enum: [...values], ...doc }), IsIn([...values]));

export const DateTime = (doc: Doc = {}, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: String, format: 'date-time', nullable, ...doc }),
    ...optional(nullable),
    IsISO8601({ strict: true }),
  );

export const DateOnly = (doc: Doc = {}, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: String, format: 'date', nullable, ...doc }),
    ...optional(nullable),
    IsISO8601({ strict: true }),
  );

/** Foreign key to another resource. */
export const Ref = (resource: string, nullable = false) =>
  applyDecorators(
    ApiProperty({ type: 'integer', minimum: 1, example: 1, nullable, description: `Id of the related ${resource}.` }),
    ...optional(nullable),
    IsInt(),
    Min(1),
  );

export const Strings = (maxItems: number, doc: Doc = {}) =>
  applyDecorators(
    ApiProperty({ type: [String], maxItems, ...doc }),
    IsArray(),
    ArrayMaxSize(maxItems),
    IsString({ each: true }),
    Length(1, 60, { each: true }),
  );

export const Urls = (maxItems: number, doc: Doc = {}) =>
  applyDecorators(
    ApiProperty({ type: [String], format: 'uri', maxItems, ...doc }),
    IsArray(),
    ArrayMaxSize(maxItems),
    IsUrl({ require_tld: false }, { each: true }),
  );

/** Nested object (validated recursively). */
export const Nested = (type: () => new () => object, doc: Doc = {}) =>
  applyDecorators(
    // Written inline on purpose: @nestjs/swagger treats a function as a lazy type only when
    // its name is `type`. Passing the caller's arrow through gives `#/components/schemas/`.
    ApiProperty({ type: () => type(), ...doc }),
    ValidateNested(),
    TransformType(type),
  );

/** Array of nested objects (validated recursively). */
export const NestedList = (type: () => new () => object, maxItems: number, doc: Doc = {}) =>
  applyDecorators(
    ApiProperty({ type: () => [type()], maxItems, ...doc }),
    IsArray(),
    ArrayMaxSize(maxItems),
    ValidateNested({ each: true }),
    TransformType(type),
  );
