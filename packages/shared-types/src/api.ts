export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages?: number;
}

export enum ApiErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN_ROLE = 'FORBIDDEN_ROLE',
  FORBIDDEN_RESOURCE = 'FORBIDDEN_RESOURCE',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SHOP_NOT_APPROVED = 'SHOP_NOT_APPROVED',
  SHOP_OUT_OF_RANGE = 'SHOP_OUT_OF_RANGE',
  PRODUCT_OUT_OF_STOCK = 'PRODUCT_OUT_OF_STOCK',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  NOT_ASSIGNED_PARTNER = 'NOT_ASSIGNED_PARTNER',
  ORDER_ALREADY_CANCELLED = 'ORDER_ALREADY_CANCELLED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}
