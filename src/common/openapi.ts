import { applyDecorators } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { loadConfig } from '../config/app-config.js';
import { LOCALE_CODES } from '../data/locales.js';

export class FieldErrorDto {
  @ApiProperty({ example: 'title' })
  field: string;

  @ApiProperty({ example: 'title must be longer than or equal to 3 characters' })
  message: string;
}

export class ProblemDto {
  @ApiProperty({ example: 'about:blank', description: 'RFC 9457 problem type.' })
  type: string;

  @ApiProperty({ example: 'Not Found' })
  title: string;

  @ApiProperty({ example: 404 })
  status: number;

  @ApiPropertyOptional({ example: 'Post 9999 not found.' })
  detail?: string;

  @ApiPropertyOptional({ example: '/v1/posts/9999' })
  instance?: string;

  @ApiPropertyOptional({ example: '0c1e6f9a-3d7b-4b1c-9b9e-6f7f1f0b2c11' })
  requestId?: string;

  @ApiPropertyOptional({ type: () => [FieldErrorDto] })
  errors?: FieldErrorDto[];
}

const problem = (status: number, description: string) =>
  ApiResponse({
    status,
    description,
    content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDto) } } },
  });

/** Error responses shared by every endpoint (400 bad query, 429, 500). */
export const ApiCommonProblems = () =>
  applyDecorators(
    ApiExtraModels(ProblemDto, FieldErrorDto),
    problem(400, 'Invalid query or path parameter.'),
    problem(429, 'Rate limit exceeded. See Retry-After.'),
    problem(500, 'Unexpected server error.'),
  );

export const ApiNotFoundProblem = (what = 'Resource') => problem(404, `${what} not found.`);
export const ApiValidationProblem = () => problem(422, 'Body failed validation, or references a row that does not exist.');

/** `seed`, `locale` and `delay`: accepted by every endpoint. */
export const ApiGlobalParams = () => {
  const config = loadConfig();
  return applyDecorators(
    ApiQuery({
      name: 'seed',
      required: false,
      schema: { type: 'integer', minimum: 0, maximum: 2_147_483_647, default: config.DEFAULT_SEED },
      description:
        'Selects a different, equally stable dataset. The same seed always returns the same data.',
    }),
    ApiQuery({
      name: 'locale',
      required: false,
      schema: { type: 'string', enum: LOCALE_CODES, default: 'en' },
      description: 'Language and region of the generated names, addresses and text.',
    }),
    ApiQuery({
      name: 'delay',
      required: false,
      schema: { type: 'integer', minimum: 0, maximum: config.MAX_DELAY_MS },
      description: 'Waits this many milliseconds before responding, to test loading states.',
    }),
  );
};

export const ApiConditionalGet = () =>
  ApiHeader({
    name: 'If-None-Match',
    required: false,
    description: 'ETag from a previous response; the server answers 304 when unchanged.',
  });
