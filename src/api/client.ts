// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL; // "/api" ở cả dev (nhờ Vite proxy) và prod (nhờ nginx)

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include", // bắt buộc để gửi/nhận cookie refresh_token
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
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
    throw new Error(`Request failed with status ${res.status}`);
  }

  if (!body.success) {
    throw new Error(body.message ?? "Request failed");
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
      setAccessToken(body.data.accessToken);
      return true;
    }
  } catch {
    // ignore, xử lý bên dưới
  }
  setAccessToken(null);
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
