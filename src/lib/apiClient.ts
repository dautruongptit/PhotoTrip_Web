// Backend thật (travelPhoto-API) mặc định chạy port 8085.
// Lưu ý: application.yml của backend đang có "server.servlet.context-path: /api/v1"
// TRÙNG với "/api/..." đã có sẵn trong từng @RequestMapping, khiến URL thật trở thành
// "/api/v1/api/auth/me" và làm cookie refresh_token (path="/api/auth") không được gửi
// kèm đúng. Khuyến nghị: xóa dòng context-path đó ở backend. Cấu hình dưới đây giả định
// bạn đã xóa (nên VITE_API_BASE_URL kết thúc bằng "/api" là đủ, không có "/v1").
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8085/api';
const TOKEN_KEY = 'travel-photo-token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean; // gắn Authorization header, mặc định true
}

/** Format chuẩn mà backend thật (ApiResponse<T>) trả về cho mọi endpoint. */
interface BackendEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  errorCode?: string;
}

function isEnvelope<T>(value: unknown): value is BackendEnvelope<T> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

/**
 * Gọi API backend. Mọi request mặc định gửi kèm Bearer token (nếu có) và cookie
 * (credentials: 'include' — cần cho refresh_token httpOnly cookie), tự parse JSON,
 * và tự "bóc" field "data" nếu response theo đúng format ApiResponse<T> của backend.
 * Ném ApiError khi response không ok hoặc "success: false".
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include', // bắt buộc để trình duyệt gửi/nhận cookie refresh_token
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    throw new ApiError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', 401);
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = undefined;
  try {
    payload = await res.json();
  } catch {
    // response không có JSON body
  }

  if (!res.ok) {
    const message =
      (isEnvelope(payload) && payload.message) ||
      (payload as { message?: string } | undefined)?.message ||
      `Yêu cầu thất bại (HTTP ${res.status})`;
    throw new ApiError(message, res.status);
  }

  if (isEnvelope<T>(payload)) {
    if (!payload.success) {
      throw new ApiError(payload.message || 'Yêu cầu thất bại', res.status);
    }
    return payload.data;
  }

  return payload as T;
}