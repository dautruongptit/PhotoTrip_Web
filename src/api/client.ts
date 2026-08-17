// src/api/client.ts
import { getToken, setToken, clearToken, isGatewayErrorStatus, friendlyStatusMessage } from "../lib/apiClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL; // "/api" ở cả dev (nhờ Vite proxy) và prod (nhờ nginx)

// Dùng chung 1 kho token với src/lib/apiClient.ts (localStorage) — trước đây
// module này giữ 1 biến accessToken riêng, không bao giờ được set nên mọi
// request qua events.ts/photos.ts/... đều thiếu Authorization header.
export const setAccessToken = (t: string | null) => {
  if (t) setToken(t);
  else clearToken();
};
export const getAccessToken = () => getToken();

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include", // bắt buộc để gửi/nhận cookie refresh_token
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options); // retry 1 lần sau khi refresh thành công
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    // Không phải JSON (vd public/error.html được trả về khi backend không tới được) ->
    // chắc chắn là lỗi tầng hạ tầng, không phải response thật của backend.
    throw new Error(friendlyStatusMessage(res.status));
  }

  if (!body.success) {
    // 502/503/504: ưu tiên thông báo dễ hiểu, bỏ qua message kỹ thuật (nếu có) từ
    // tầng hạ tầng (nginx/proxy) — message đó không phải do backend soạn cho người dùng.
    throw new Error(isGatewayErrorStatus(res.status) ? friendlyStatusMessage(res.status) : (body.message ?? "Request failed"));
  }
  return body.data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    const body = await res.json();
    if (body.success) {
      setToken(body.data.accessToken);
      return true;
    }
  } catch {
    // ignore, xử lý bên dưới
  }
  clearToken();
  return false;
}

export const apiGet = <T,>(path: string) => request<T>(path);

export const apiPost = <T,>(path: string, data?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

export const apiPut = <T,>(path: string, data?: unknown) =>
  request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

export const apiDelete = <T,>(path: string) => request<T>(path, { method: "DELETE" });

// Dùng riêng cho multipart/form-data (create/update Event, upload Photo)
export const apiPostForm = <T,>(path: string, form: FormData) =>
  request<T>(path, { method: "POST", body: form }); // KHÔNG set Content-Type, browser tự thêm boundary

export const apiPutForm = <T,>(path: string, form: FormData) =>
  request<T>(path, { method: "PUT", body: form });
