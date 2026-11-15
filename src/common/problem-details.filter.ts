import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { ThrottlerException } from '@nestjs/throttler';
import { STATUS_CODES } from 'node:http';
import { telemetry } from '../telemetry/telemetry.js';
import { ApiValidationException, type FieldError } from './errors.js';

/** RFC 9457 problem document. */
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: FieldError[];
}

function detailOf(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : exception.message;
}

/** Renders every error as `application/problem+json`. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<NodeRequest & { id?: string | number }>();
    const res = http.getResponse<NodeResponse>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const problem: ProblemDocument = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      instance: (req.url ?? '').split('?')[0],
      ...(req.id !== undefined && { requestId: String(req.id) }),
    };

    if (exception instanceof ApiValidationException) {
      problem.detail = exception.message;
      problem.errors = exception.errors;
    } else if (exception instanceof ThrottlerException) {
      problem.detail = 'Rate limit exceeded. Retry after the number of seconds in the Retry-After header.';
      this.setRetryAfter(res);
      telemetry.rateLimited.add(1);
    } else if (exception instanceof HttpException) {
      problem.detail = detailOf(exception);
    } else {
      problem.detail = 'An unexpected error occurred.';
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    if (res.headersSent) {
      res.end();
      return;
    }
    res.removeHeader('ETag');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    res.end(JSON.stringify(problem));
  }

  /** The guard names Retry-After per throttler (`Retry-After-burst`); expose the standard header too. */
  private setRetryAfter(res: NodeResponse): void {
    let seconds = 0;
    for (const [name, value] of Object.entries(res.getHeaders())) {
      if (name.toLowerCase().startsWith('retry-after')) seconds = Math.max(seconds, Number(value) || 0);
    }
    res.setHeader('Retry-After', String(Math.max(1, seconds)));
  }
}
