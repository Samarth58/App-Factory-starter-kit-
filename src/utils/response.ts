export type SuccessResponse<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
};

export function ok<T>(data: T, meta?: Record<string, unknown>): SuccessResponse<T> {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  if (meta !== undefined) {
    response.meta = meta;
  }

  return response;
}

export function fail(
  code: string,
  message: string,
  details: unknown[] = [],
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}
