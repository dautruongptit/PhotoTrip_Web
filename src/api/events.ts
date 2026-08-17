// src/api/events.ts
import { apiGet, apiDelete, apiPostForm, apiPutForm } from "./client";

export interface EventResponse {
  id: number;
  name: string;
  description: string;
  ownerName: string;
  ownerId: number;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  location: string;
  coverImageUrl: string;
  photoCount: number;
  totalSize: number; // bytes
  createdAt: string; // ISO datetime
}

export interface EventFormData {
  name: string;
  description?: string;
  startDate: string; // yyyy-MM-dd
  endDate?: string; // yyyy-MM-dd
  location: string;
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const listEvents = (page = 0, size = 10) =>
  apiGet<Page<EventResponse>>(`/events?page=${page}&size=${size}`);

export const getEvent = (id: number) => apiGet<EventResponse>(`/events/${id}`);

export const searchEvents = (keyword: string, page = 0, size = 10) =>
  apiGet<Page<EventResponse>>(
    `/events/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`
  );

export const deleteEvent = (id: number) => apiDelete<void>(`/events/${id}`);

function buildEventForm(data: Partial<EventFormData>, coverImage?: File): FormData {
  const form = new FormData();
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      form.append(key, value as string);
    }
  });
  // coverImage là @RequestParam riêng ở backend, không phải field của CreateEventRequest
  if (coverImage) form.append("coverImage", coverImage);
  return form;
}

export const createEvent = (data: EventFormData, coverImage?: File) =>
  apiPostForm<EventResponse>(`/events`, buildEventForm(data, coverImage));

export const updateEvent = (id: number, data: Partial<EventFormData>, coverImage?: File) =>
  apiPutForm<EventResponse>(`/events/${id}`, buildEventForm(data, coverImage));

/** Dùng thẳng làm src="" của <img>, KHÔNG gọi qua apiGet */
export const eventCoverUrl = (id: number) =>
  `${import.meta.env.VITE_API_BASE_URL}/events/${id}/cover`;
