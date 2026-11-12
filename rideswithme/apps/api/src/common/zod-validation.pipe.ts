import { type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, output } from 'zod';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from './app-exception';

/** Validates and transforms a request body, query or param with a shared zod schema. */
export class ZodValidationPipe<S extends ZodTypeAny> implements PipeTransform<unknown, output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Request validation failed', {
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zod = <S extends ZodTypeAny>(schema: S) => new ZodValidationPipe(schema);
