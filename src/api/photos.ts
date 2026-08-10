// src/api/photos.ts
import { apiGet, apiDelete, apiPostForm } from "./client";

export interface PhotoResponse {
  id: number;
  originalName: string;
  url: string;
  thumbnailUrl: string;
  size: number; // bytes
  width: number;
  height: number;
  uploadedBy: string;
  uploadedTime: string; // ISO datetime
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const listPhotosByEvent = (eventId: number, page = 0, size = 20) =>
  apiGet<Page<PhotoResponse>>(`/events/${eventId}/photos?page=${page}&size=${size}`);

export const searchPhotos = (keyword: string, page = 0, size = 20) =>
  apiGet<Page<PhotoResponse>>(
    `/photos/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`
  );

export const deletePhoto = (id: number) => apiDelete<void>(`/photos/${id}`);

export const uploadPhotos = (eventId: number, files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f)); // đối chiếu lại tên field "files" với backend nếu upload lỗi 400
  return apiPostForm<{ uploaded: number; failed: unknown[] }>(
    `/events/${eventId}/photos`,
    form
  );
};

/** Dùng thẳng làm href="" download, KHÔNG gọi qua apiGet (response là file raw, không phải JSON) */
export const photoDownloadUrl = (id: number) =>
  `${import.meta.env.VITE_API_BASE_URL}/photos/download/${id}`;

export const photosDownloadZipUrl = (ids: number[]) =>
  `${import.meta.env.VITE_API_BASE_URL}/photos/download-zip?${ids
    .map((i) => `ids=${i}`)
    .join("&")}`;
