import { HttpException, HttpStatus } from '@nestjs/common';

export interface BusinessErrorDetails {
  [key: string]: unknown;
}

export interface BusinessErrorBody {
  code: number;
  message: string;
  details?: BusinessErrorDetails;
}

export function businessException(
  code: number,
  status: HttpStatus,
  message: string,
  details?: BusinessErrorDetails,
): HttpException {
  const body: BusinessErrorBody = details
    ? { code, message, details }
    : { code, message };
  return new HttpException(body, status);
}
