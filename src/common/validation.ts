import {
  type ArgumentMetadata,
  HttpStatus,
  Injectable,
  type PipeTransform,
  type Type,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { ApiValidationException, type FieldError } from './errors.js';

/** Where @nestjs/swagger records a class's documented properties (`:name`). */
const SWAGGER_PROPERTIES = 'swagger/apiModelPropertiesArray';

export function documentedProperties(type: Type<unknown>): string[] {
  const props: string[] = Reflect.getMetadata(SWAGGER_PROPERTIES, type.prototype) ?? [];
  return props.map((p) => p.replace(/^:/, ''));
}

/**
 * Top-level fields of the entity that clients cannot write (id, timestamps, computed
 * values): everything the entity documents that the create DTO does not.
 */
export function readOnlyFields(entity: Type<unknown>, createDto: Type<unknown>): string[] {
  const writable = new Set(documentedProperties(createDto));
  return documentedProperties(entity).filter((p) => !writable.has(p));
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/**
 * Body validation. Read-only fields are accepted and ignored (OpenAPI `readOnly`), so a
 * client can GET a row, edit it and PUT it back. Unknown fields and invalid values are
 * rejected with 422 and one entry per field.
 */
@Injectable()
export class BodyPipe implements PipeTransform {
  private readonly validation: ValidationPipe;

  constructor(
    expectedType: Type<unknown>,
    private readonly ignored: readonly string[] = [],
  ) {
    this.validation = new ValidationPipe({
      expectedType,
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: true, // One message per field.
      validationError: { target: false, value: false },
      exceptionFactory: (errors) => new ApiValidationException(flatten(errors), HttpStatus.UNPROCESSABLE_ENTITY),
    });
  }

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiValidationException(
        [{ field: 'body', message: 'must be a JSON object' }],
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const body = { ...(value as Record<string, unknown>) };
    for (const key of this.ignored) delete body[key];
    return this.validation.transform(body, metadata);
  }
}
