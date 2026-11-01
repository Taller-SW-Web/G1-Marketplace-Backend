import { HttpException } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details: { redirectUrl?: string; retryAfterSeconds?: number } = {}) {
    super({ code, message, ...details }, status);
  }
}
