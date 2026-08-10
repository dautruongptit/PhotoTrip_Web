// src/api/users.ts
import { apiGet, apiPut, apiDelete } from "./client";
import type { UserResponse } from "./auth";

export const getMyProfile = () => apiGet<UserResponse>(`/users/profile`);

export const updateMyProfile = (fullName: string) =>
  apiPut<UserResponse>(`/users/profile`, { fullName });

/** Backend yêu cầu role ADMIN theo thiết kế ban đầu — cần kiểm tra lại SecurityConfig, xem mục 12.2 trong guide */
export const deleteUser = (id: number) => apiDelete<void>(`/users/${id}`);
