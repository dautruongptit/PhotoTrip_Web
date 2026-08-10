// src/api/auth.ts
import { apiGet, apiPost, setAccessToken } from "./client";

export interface UserResponse {
  id: number;
  fullName: string;
  email: string;
  role: string; // "ADMIN" | "USER" ...
}

/**
 * Rời SPA, chuyển cả trang sang Google — không dùng fetch cho bước này.
 * Path này nằm ở ROOT (SecurityConfig: "/oauth2/**"), KHÔNG cộng thêm
 * VITE_API_BASE_URL ("/api") — cộng vào sẽ ra "/api/oauth2/..." và bị 404.
 */
export const loginWithGoogle = () => {
  window.location.href = "/oauth2/authorization/google";
};

export const fetchMe = () => apiGet<UserResponse>("/auth/me");

export const logout = async () => {
  await apiPost("/auth/logout");
  setAccessToken(null);
};
