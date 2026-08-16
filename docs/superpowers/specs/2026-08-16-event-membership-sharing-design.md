# Event Membership & Sharing UI — Design

Status: approved by user, pre-implementation
Date: 2026-08-16
Backend reference: "Event Membership API" changelog, shipped 2026-08-16, `main @ 862df8c` (PhotoTrip-API)

## 1. Context

The backend added real event membership (VIEWER/EDITOR roles via share link or email
invite, in place of "owner + anonymous read-only link"). The frontend API client layer
was already updated in this session (`src/api/share.ts`, `src/api/invites.ts`) to match
the new contract. **No UI consumes any of it yet** — this spec covers building that UI.

Backend contract summary (see the artifact changelog for full detail):

- `POST /api/share/{token}/join` — logged-in user joins via link. Idempotent.
- `POST /api/events/{id}/members/invite` — owner/admin invites by email + role. No email
  is actually sent; the invitee only finds out via `GET /api/invites/me`.
- `GET /api/invites/me`, `POST /api/invites/{id}/accept`, `POST /api/invites/{id}/decline`.
- `POST /api/events/{id}/share` — now takes optional `role` query param (default VIEWER).
- `GET /api/events/{id}` / `.../photos` — now readable by any member, not just the owner.
- `POST .../photos` (upload) — EDITOR members can now upload too.
- `DELETE /api/photos/{id}` — a member can delete a photo they uploaded themselves.
- **Known backend gap:** `GET /api/events` doesn't return events a user has joined as a
  member, only ones they own. No "my joined events" listing exists yet.

## 2. Known gap this design works around

`EventResponse` has no field telling the client the current user's role/relationship to
the event (no `role`/`isOwner`/`canEdit`). Decision (user-approved): derive it client-side
as a temporary heuristic —

```
role = (event.ownerName === user.name) ? 'OWNER' : 'EDITOR'
```

This is a known-imperfect stand-in (name collisions are possible) purely for **hiding/showing
UI affordances** (upload button, share/invite button). The backend still enforces real
permissions server-side (403s), so a wrong client-side guess degrades to "button shown but
action 403s with a toast", never a security issue — just a rough edge worth revisiting once
the backend adds a real field.

## 3. Scope

**In scope:**
1. `TravelEvent.role` derived field + mapping.
2. `ShareModal` (owner-only): create/copy/revoke share link with role picker; invite by email.
3. Invites inbox: bell icon in `Header`, dropdown list, accept/decline.
4. Public share-link route (`/share/:token`): read-only gallery for anyone, "join" CTA for
   logged-in users, login-then-auto-join for logged-out users.
5. Role-gated Upload button and delete-permission hint in `AlbumPage`.
6. Remove the dead "Xem không cần đăng nhập" button on `LoginPage` (no `onClick`, and no
   longer a coherent affordance now that viewing requires an actual token in the URL).

**Out of scope (explicitly not building now):**
- A "my joined events" list on Dashboard — blocked on the backend gap noted in §1; Dashboard
  keeps showing only owned events.
- Any UI depending on a real `role` field from the backend — using the heuristic in §2 instead.
- Changing backend code.

## 4. Data model

`src/types.ts`:

```ts
import type { EventMemberRole } from '../api/share'; // 'VIEWER' | 'EDITOR' — the backend enum

// Client-side-only role, one step wider than the backend's EventMemberRole: adds 'OWNER'
// for the case the backend has no explicit field for (see design doc §2). Deliberately a
// distinct name from EventMemberRole so the two don't get confused at call sites.
export type ClientEventRole = EventMemberRole | 'OWNER';

export interface TravelEvent {
  // ...existing fields...
  role: ClientEventRole; // derived client-side, see design doc §2
}
```

`App.tsx`'s `mapEventResponse`: add `role: dto.ownerName === currentUserName ? 'OWNER' : 'EDITOR'`.
Needs the current user's name in scope at map time — `mapEventResponse` becomes a closure
over `user?.name` (created inside the component, or passed as a parameter) since it's
presently a module-level pure function.

## 5. New components

### 5.1 `ShareModal` (`src/components/ShareModal.tsx`)

Opened from a new "Chia sẻ" button in `AlbumPage`'s header row (next to "Tải ảnh lên"),
visible only when `event.role === 'OWNER'`. Two tabs:

**Tab "Link chia sẻ":**
- Role selector (Xem / Có thể sửa → VIEWER/EDITOR), "Tạo link" button → `createShareLink(eventId, role)`.
- On success: show `shareUrl` in a read-only input + copy button, `expiredAt` formatted,
  active/revoke toggle → `revokeShareLink(token)`.
- If a link already exists for this event... **the backend has no "get current share link"
  endpoint** — only create/revoke. So each open of this tab either creates a fresh link or,
  if the owner already made one earlier in the same modal session, shows the one held in
  local component state. No persistence across modal close/reopen beyond that — acceptable
  given the backend doesn't expose a lookup endpoint; note this as a follow-up gap.

**Tab "Mời qua email":**
- Email input + role selector, "Gửi lời mời" → `inviteMember(eventId, {email, role})`.
- Error mapping (via `ApiError.message` from backend, already Vietnamese-friendly per
  `apiClient.ts`'s handling — pass backend message straight to toast for the 404/409 cases
  listed in §1, they're already clear).

### 5.2 Invites bell (`src/components/InvitesMenu.tsx`)

Rendered in `Header`, next to the theme toggle. Badge = pending count. Click opens a
dropdown (same visual pattern as the existing sort-menu dropdown in `AlbumPage`) listing
`EventInviteResponse[]` — event name, role, "Chấp nhận"/"Từ chối" buttons.

- Accept → `acceptInvite(id)` → returns eventId → close dropdown, `handleOpenEvent(eventId)`.
- Decline → `declineInvite(id)` → remove from local list.
- Data loaded once in `App.tsx` right after session restore succeeds (parallel to
  `loadEvents()`), stored as `invites` state, passed down through `Header`.

### 5.3 `SharedAlbumPage` (`src/components/SharedAlbumPage.tsx`)

Read-only gallery, reuses `PhotoItem`-style grid (no select/delete/upload chrome) fed by
`getSharedEvent(token)` + `getSharedPhotos(token)`. Header shows event name/cover/location,
and one CTA depending on auth state:

- Logged in, not yet a member → "Tham gia sự kiện" button → `joinShareLink(token)` →
  `handleOpenEvent(String(eventId))` (drops into the normal authenticated Album view).
- Logged in, already a member/owner → button reads "Mở sự kiện" and does the same navigation
  without re-calling join (join is idempotent anyway, but skip the network call for a snappier
  button).
- Not logged in → CTA "Đăng nhập để tham gia" → save the token first (see §6), then
  `window.location.href = getGoogleLoginUrl()`.

## 6. Routing changes (`App.tsx`)

No router library in this app — navigation is hand-rolled view state + `history.pushState`
with an unchanged URL (see `useHistoryNavigation`), except `/oauth2/callback` which is
matched as a real `pathname`. `/share/:token` follows that same real-pathname pattern:

```
useEffect(() => {
  if (window.location.pathname.startsWith('/share/')) {
    const token = window.location.pathname.slice('/share/'.length);
    // fetch getSharedEvent(token) here, setView('shared') (new AppView member),
    // DO NOT replaceState to '/' the way /oauth2/callback does — the share URL
    // should stay shareable/bookmarkable/reloadable.
  }
  // ...existing token-restore / oauth2/callback logic...
}, []);
```

`AppView` gains `'shared'`. Rendering: `view === 'shared'` gets its own top-level branch in
the JSX (own layout, not wrapped in the authenticated `Header`+content shell), mirroring how
`view === 'login'` is special-cased today.

**Pending-join-across-login-redirect**, mirroring `paymentApi.ts`'s `readPendingOrder`/
`clearPendingOrder` pattern (localStorage key, e.g. `travel-photo-pending-share-token`):
1. On `/share/:token` with no logged-in user, before redirecting to Google, store the token.
2. In the existing `/oauth2/callback` handler (after `fetchCurrentUser()` succeeds), check
   for a pending token; if present, call `joinShareLink(token)`, clear it, then
   `handleOpenEvent` into that event instead of the normal dashboard redirect.

## 7. Role-gated UI in `AlbumPage`

- Upload button (both header + empty-state variants): change guard from `user &&` to
  `user && event.role !== 'VIEWER'`.
- Delete: keep the existing multi-select delete UI as-is for `OWNER`; for non-owner members,
  filter the selectable set to `photo.uploadedBy === user.name` (same name-matching caveat as
  §2 — soft client-side hint, backend 403 is the real guard). Simplest implementation: compute
  `canDeletePhoto(photo)` and only render the select-checkbox affordance when true, rather
  than adding a separate permission-denied path.

## 8. Cleanup

`LoginPage.tsx`: remove the "Bạn có album được chia sẻ? Xem không cần đăng nhập" block —
dead button, and no longer a coherent entry point now that viewing requires a real token in
the URL (there's nothing generic to browse to without one).

## 9. Testing

No test runner in this project (confirmed earlier this session). Verification will be
manual via `run`/browser-automation against the real backend, covering: create link → open
in a fresh session (logged out) → join after login → role-gated upload/delete → invite by
email → accept/decline from the invites bell. Each error case in §5.1's tab 2 gets a
deliberate trigger (re-invite same email, invite non-existent email, invite self).
