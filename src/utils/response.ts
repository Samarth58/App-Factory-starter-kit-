export type SuccessResponse<T> = {
  status: 'success';
  data: T;
  timestamp: string;
};

export type ErrorResponse = {
  status: 'error';
  message: string;
  code: string;
  timestamp: string;
};

export function success<T>(
  data: T,
  statusCode: number = 200,
): SuccessResponse<T> {
  void statusCode;
  return {
    status: 'success',
    data,
    timestamp: new Date().toISOString(),
  };
}

export function error(
  message: string,
  code: string,
  statusCode: number = 400,
): ErrorResponse {
  void statusCode;
  return {
    status: 'error',
    message,
    code,
    timestamp: new Date().toISOString(),
  };
}
