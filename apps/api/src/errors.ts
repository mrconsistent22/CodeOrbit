import type { ServerResponse } from 'node:http';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

}

export function internalError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export function sendError(response: ServerResponse, error: ApiError): void {
  response.writeHead(error.statusCode, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    }),
  );
}
