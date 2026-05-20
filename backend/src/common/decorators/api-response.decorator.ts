import { SetMetadata } from '@nestjs/common';

export interface ApiResponseOptions {
  status: number;
  description?: string;
}

export const API_RESPONSE_METADATA = 'api:response';

/**
 * Lightweight local API response metadata decorator.
 * The project does not depend on @nestjs/swagger; this keeps route-level
 * response documentation available without changing runtime behavior.
 */
export function ApiResponse(options: ApiResponseOptions): MethodDecorator {
  return SetMetadata(API_RESPONSE_METADATA, options);
}
