// src/api/share.ts
import { apiGet, apiPost, apiDelete } from "./client";
import type { EventResponse } from "./events";
import type { PhotoResponse } from "./photos";

export interface ShareLinkResponse {
  token: string;
  shareUrl: string;
  active: boolean;
  role: string;
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const createShareLink = (eventId: number, role?: string) =>
  apiPost<ShareLinkResponse>(`/events/${eventId}/share${role ? `?role=${role}` : ""}`);

/** Public — không cần đăng nhập */
export const getSharedEvent = (token: string) =>
  apiGet<EventResponse>(`/share/${token}`);

export const getSharedPhotos = (token: string, page = 0, size = 20) =>
  apiGet<Page<PhotoResponse>>(`/share/${token}/photos?page=${page}&size=${size}`);

export const revokeShareLink = (token: string) => apiDelete<void>(`/share/${token}`);
