// src/api/admin.ts
import { apiGet } from "./client";
import type { UserResponse } from "./auth";

export interface DashboardResponse {
  totalUsers: number;
  totalEvents: number;
  totalPhotos: number;
  totalStorageUsedBytes: number;
  uploadsToday: number;
  diskUsableBytes: number;
  diskTotalBytes: number;
}

export interface StorageOverviewResponse {
  totalUsedBytes: number;
  totalQuotaBytes: number;
  usedPercentage: number;
  topUsers: { userId: number; fullName: string; storageUsedBytes: number }[];
}

export interface StatisticsResponse {
  uploadsToday: number;
  uploadsByMonth: { month: string; count: number }[];
  topUsers: { userId: number; fullName: string; uploadCount: number }[];
}

export interface AuditLogResponse {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  ip: string | null;
  userAgent: string | null;
  result: string;
  createdAt: string;
}

interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const getDashboard = () => apiGet<DashboardResponse>(`/admin/dashboard`);
export const getStorageOverview = () => apiGet<StorageOverviewResponse>(`/admin/storage`);
export const getStatistics = () => apiGet<StatisticsResponse>(`/admin/statistics`);
export const getAdminUsers = (page = 0, size = 20) =>
  apiGet<Page<UserResponse>>(`/admin/users?page=${page}&size=${size}`);
export const getAuditLogs = (page = 0, size = 20) =>
  apiGet<Page<AuditLogResponse>>(`/admin/logs?page=${page}&size=${size}`);
