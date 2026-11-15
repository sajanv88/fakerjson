import { HttpException, HttpStatus } from '@nestjs/common';

export interface FieldError {
  /** Query parameter, path parameter or body property (dotted for nested properties). */
  field: string;
  message: string;
}

/** A 400/422 carrying one entry per invalid field, rendered as RFC 9457 `errors`. */
export class ApiValidationException extends HttpException {
  constructor(
    readonly errors: FieldError[],
    status: HttpStatus.BAD_REQUEST | HttpStatus.UNPROCESSABLE_ENTITY = HttpStatus.BAD_REQUEST,
    detail = status === HttpStatus.BAD_REQUEST
      ? 'One or more query or path parameters are invalid.'
      : 'The request body failed validation.',
  ) {
    super(detail, status);
  }
}
