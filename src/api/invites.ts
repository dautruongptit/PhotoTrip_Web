// src/api/invites.ts — Event Membership API (lời mời qua email), shipped 2026-08-16.
// Lưu ý (xem Integration notes bản changelog backend): lời mời KHÔNG gửi email thật —
// người được mời chỉ biết qua listMyInvites() (gọi lúc mở app / đăng nhập).
import { apiGet, apiPost } from "./client";
import type { EventMemberRole } from "./share";

export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface EventInviteResponse {
  id: number;
  eventId: number;
  eventName: string;
  role: EventMemberRole;
  status: InviteStatus;
  createdAt: string; // ISO datetime
}

export interface InviteMemberRequest {
  email: string;
  role: EventMemberRole;
}

/**
 * Chỉ chủ sự kiện (hoặc ADMIN) được mời. Lỗi thường gặp (đã map message sẵn ở
 * backend, hiện thẳng qua toast là đủ):
 *   404 "User not found"     — email chưa có tài khoản
 *   409 "ALREADY_MEMBER"     — đã là member
 *   409 "ALREADY_INVITED"    — đã có lời mời pending/trước đó
 *   409 "CANNOT_INVITE_SELF" — mời chính email của chủ sự kiện
 */
export const inviteMember = (eventId: number, data: InviteMemberRequest) =>
  apiPost<EventInviteResponse>(`/events/${eventId}/members/invite`, data);

/** Lời mời PENDING gửi tới email của user đang đăng nhập. */
export const listMyInvites = () => apiGet<EventInviteResponse[]>(`/invites/me`);

/** Chấp nhận lời mời -> trở thành member đúng role đã mời. Trả về id của event. */
export const acceptInvite = (id: number) => apiPost<number>(`/invites/${id}/accept`);

export const declineInvite = (id: number) => apiPost<void>(`/invites/${id}/decline`);
