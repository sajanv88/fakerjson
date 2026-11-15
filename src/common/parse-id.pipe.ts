import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiValidationException } from './errors.js';

/** Path ids are positive integers; anything else is a 400 (not a 404). */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, number> {
  constructor(private readonly field = 'id') {}

  transform(value: string): number {
    const id = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
      throw new ApiValidationException([{ field: this.field, message: 'must be a positive integer' }]);
    }
    return id;
  }
}
