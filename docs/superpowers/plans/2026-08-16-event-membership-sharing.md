# Event Membership & Sharing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI that consumes the already-shipped Event Membership backend API (share link with role, email invites, join flow, role-gated upload/delete) — currently the API client exists (`src/api/share.ts`, `src/api/invites.ts`) but nothing in the app calls it.

**Architecture:** Six sequential tasks, each producing an independently clickable/verifiable piece: (1) a client-side-derived `role` field on `TravelEvent` that everything else keys off, (2) the owner-side share/invite modal, (3) role-gated upload/delete in the album view, (4) the invites inbox in the header, (5) the public `/share/:token` route + join flow (including the login-redirect round trip), (6) a small dead-UI cleanup. No new dependencies — plain React state, the existing hand-rolled history/view-state system (`useHistoryNavigation`), and the existing Tailwind v4 utility-class visual language.

**Tech Stack:** React 19 + Vite + TypeScript (strict, `noUnusedLocals`/`noUnusedParameters` on) + Tailwind v4 utility classes. No router library, no test runner.

**Spec:** `docs/superpowers/specs/2026-08-16-event-membership-sharing-design.md`

## Global Constraints

- All UI copy is Vietnamese, matching the app's existing tone (see any existing component for register — plain, direct, no exclamation-heavy marketing voice).
- `noUnusedLocals`/`noUnusedParameters` are on — every import must be used, remove anything you added but didn't end up using.
- No test runner exists in this project (confirmed: no `*.test.*` files, no test script in `package.json`). "Verify" steps in this plan are (a) `npx tsc --noEmit -p .` from the repo root (must produce no output / exit 0), and (b) a concrete manual browser-driven check — exact URL/clicks/expected result — run via the `run` skill or `claude-in-chrome`/Playwright browser automation against the real dev stack (`pnpm run dev` on the frontend, the Spring Boot backend running on port 8085). Do not skip the manual check even though it's not an automated test — it is this task's actual test.
- Match existing patterns exactly rather than introducing new ones: modal chrome (fixed inset-0 + backdrop + `slide-up` card, see `AlbumPage.tsx`'s delete-confirm dialog or any `*Modal.tsx`), dropdown chrome (`Header.tsx`'s profile dropdown: `absolute right-0 top-full mt-2 ... rounded-2xl shadow-xl border ...`), toast usage (`addToast(type, message)`, message text pulled from `err instanceof Error ? err.message : '<fallback>'`).
- The client-side role heuristic (`event.ownerName === user.name ? 'OWNER' : 'EDITOR'`) is a known, spec-approved imperfection (see spec §2) — do not try to "fix" it into something more clever inside this plan; the real fix is a backend field, out of scope.

---

### Task 1: `role` field on `TravelEvent` + role derivation

**Files:**
- Modify: `src/api/share.ts` (already has `EventMemberRole` exported — no change needed here, just confirming the import source for the next file)
- Modify: `src/types.ts`
- Modify: `src/App.tsx:15-30` (`mapEventResponse`), `src/App.tsx:88-95` (`loadEvents`), `src/App.tsx:255-261` (`handleCreateEvent`)
- Modify: `src/mockData.ts` (4 occurrences of `createdBy: 'user-1',`)

**Interfaces:**
- Produces: `ClientEventRole` type (`'OWNER' | 'EDITOR' | 'VIEWER'`) exported from `src/types.ts`; `TravelEvent.role: ClientEventRole`. Every later task reads `event.role`.

- [ ] **Step 1: Add `ClientEventRole` and extend `TravelEvent`**

In `src/types.ts`, add the import at the top and the new type, then add `role` to the interface:

```ts
import type { EventMemberRole } from './api/share'; // 'VIEWER' | 'EDITOR' — the backend enum

// Client-side-only role, one step wider than the backend's EventMemberRole: adds 'OWNER'
// for the case the backend has no explicit field for (no API tells the client "your role
// in this event" — see docs/superpowers/specs/2026-08-16-event-membership-sharing-design.md
// §2). Deliberately a distinct name from EventMemberRole so the two aren't confused at
// call sites.
export type ClientEventRole = EventMemberRole | 'OWNER';
```

Then in `export interface TravelEvent { ... }`, add one field right after `createdBy: string;`:

```ts
  role: ClientEventRole;
```

- [ ] **Step 2: Verify the type-only change compiles (expected to fail — nothing produces `role` yet)**

Run: `cd "D:/My Project/tripPhoto new/PhotoTrip_Web" && npx tsc --noEmit -p .`
Expected: errors in `src/App.tsx` and `src/mockData.ts` — "Property 'role' is missing in type ... but required in type 'TravelEvent'". This confirms the type is wired correctly; the following steps fix each error.

- [ ] **Step 3: Derive `role` in `mapEventResponse` (`src/App.tsx`)**

Change the function signature and add the `role` field to its return value:

```tsx
function mapEventResponse(dto: EventResponse, currentUserName: string | undefined, photos: Photo[] = []): TravelEvent {
  return {
    id: String(dto.id),
    name: dto.name,
    description: dto.description ?? '',
    startDate: dto.startDate,
    endDate: dto.endDate || dto.startDate,
    location: dto.location,
    coverImage: dto.coverImageUrl || FALLBACK_COVER_IMAGE,
    photos,
    photoCount: dto.photoCount,
    totalSizeBytes: dto.totalSize,
    createdBy: dto.ownerName,
    createdAt: dto.createdAt,
    // Suy role phía client vì EventResponse chưa có field "role của tôi trong event này"
    // (xem spec §2). Không hoàn hảo (trùng tên vẫn có thể sai) — chỉ dùng để ẩn/hiện nút,
    // backend vẫn là nơi thực thi quyền thật (403 nếu đoán sai).
    role: dto.ownerName === currentUserName ? 'OWNER' : 'EDITOR',
  };
}
```

- [ ] **Step 4: Update both call sites of `mapEventResponse`**

**Watch out for a stale-closure trap here.** The session-restore `useEffect` in `App.tsx` has `[]` deps and calls `loadEvents()` from inside a `.then((loggedInUser) => {...})`/`.then((restoredUser) => {...})` callback — that effect closure is captured once at mount, so if `loadEvents` reads `user` from component state, it will see the value `user` had at mount (`null`), never the freshly-logged-in value, even though `setUser(...)` was just called earlier in the same callback (state updates don't apply synchronously within the same closure). The fix: don't have `loadEvents` depend on `user` state at all — pass the current user's name in as a parameter instead, from call sites that already have the real value as a local variable.

Change `loadEvents` (currently `const loadEvents = useCallback(async () => { ... setEvents(page.content.map((dto) => mapEventResponse(dto))); ... }, [addToast]);`) to accept a parameter and keep `addToast` as its only dependency:

```tsx
  const loadEvents = useCallback(async (currentUserName?: string) => {
    try {
      const page = await listEvents(0, 100);
      setEvents(page.content.map((dto) => mapEventResponse(dto, currentUserName)));
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không thể tải danh sách sự kiện.');
    }
  }, [addToast]);
```

Then update its two call sites inside the session-restore `useEffect` (both are currently a bare `loadEvents();`):

- In the `/oauth2/callback` success branch (`.then((loggedInUser) => { ... loadEvents(); ... })`), change to `loadEvents(loggedInUser.name);`.
- In the plain token-restore success branch (`.then((restoredUser) => { ... loadEvents(); ... })`), change to `loadEvents(restoredUser.name);`.

(These are the only two call sites of `loadEvents` in the app today — confirm with a search before moving on; if a third call site exists, apply the same fix: pass the current, locally-known user's name rather than reaching for `user` state.)

In `handleCreateEvent` (currently `const newEvent = mapEventResponse(dto);`), change to:

```tsx
    const newEvent = mapEventResponse(dto, user?.name);
```

`handleCreateEvent` is a plain function recreated every render (not wrapped in a `[]`-deps effect), so reading `user` directly from component state here is safe — no stale-closure risk, unlike the mount effect above.

- [ ] **Step 5: Fix `src/mockData.ts` (dead export, but must still type-check)**

`mockEvents`/`mockUser` in `src/mockData.ts` are unused anywhere in the app (confirmed by grep — only self-referenced in that file) but the file must still compile. Add `role: 'OWNER',` right after every `createdBy: 'user-1',` line — there are 4 occurrences, all identical, so a single find-all-and-replace covers them:

Find: `    createdBy: 'user-1',`
Replace with:
```
    createdBy: 'user-1',
    role: 'OWNER',
```
(apply to all 4 occurrences in the file)

- [ ] **Step 6: Verify compiles clean**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 7: Manual check — no visual regression**

Using the `run` skill (or `claude-in-chrome`): start `pnpm run dev` if not already running, open `http://localhost:8443/`, log in with Google (or reuse an already-logged-in session), confirm the Dashboard still lists events exactly as before and opening an event still shows its Album page with photos, Upload button, and delete-selection working — this task changes no rendered behavior yet, so the check is purely "nothing broke."

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/App.tsx src/mockData.ts
git commit -m "Add client-derived role field to TravelEvent (event membership UI, part 1)"
```

---

### Task 2: `ShareModal` — owner creates a link / sends an email invite

**Files:**
- Create: `src/components/ShareModal.tsx`
- Modify: `src/components/AlbumPage.tsx:6-13` (Props), `:122-135` (header button row)
- Modify: `src/App.tsx` (state, import, render)

**Interfaces:**
- Consumes: `TravelEvent.role` (Task 1), `createShareLink(eventId: number, role?: EventMemberRole): Promise<ShareLinkResponse>` and `EventMemberRole` from `src/api/share.ts`, `inviteMember(eventId: number, data: InviteMemberRequest): Promise<EventInviteResponse>` from `src/api/invites.ts`, `addToast(type, message)` from `App.tsx`.
- Produces: `ShareModal` component (`{ event: TravelEvent; onClose: () => void; onToast: (type: ToastItem['type'], message: string) => void }`); `AlbumPage`'s new `onOpenShare: () => void` prop, consumed by Task 3+ unchanged.

- [ ] **Step 1: Create `src/components/ShareModal.tsx`**

```tsx
import { useState } from 'react';
import type { TravelEvent, ToastItem } from '../types';
import { createShareLink, type ShareLinkResponse, type EventMemberRole } from '../api/share';
import { inviteMember } from '../api/invites';

interface Props {
  event: TravelEvent;
  onClose: () => void;
  onToast: (type: ToastItem['type'], message: string) => void;
}

const ROLE_LABELS: Record<EventMemberRole, string> = {
  VIEWER: 'Chỉ xem',
  EDITOR: 'Có thể sửa (tải ảnh lên)',
};

export default function ShareModal({ event, onClose, onToast }: Props) {
  const [tab, setTab] = useState<'link' | 'invite'>('link');

  // Tab "Link chia sẻ"
  const [linkRole, setLinkRole] = useState<EventMemberRole>('VIEWER');
  const [creatingLink, setCreatingLink] = useState(false);
  const [link, setLink] = useState<ShareLinkResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateLink = async () => {
    setCreatingLink(true);
    try {
      const result = await createShareLink(Number(event.id), linkRole);
      setLink(result);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Không thể tạo link chia sẻ.');
    } finally {
      setCreatingLink(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Tab "Mời qua email"
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<EventMemberRole>('VIEWER');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await inviteMember(Number(event.id), { email: email.trim(), role: inviteRole });
      onToast('success', `Đã gửi lời mời tới ${email.trim()}.`);
      setEmail('');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'Không thể gửi lời mời.');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="slide-up relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Chia sẻ "{event.name}"</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">×</button>
        </div>

        <div className="flex gap-1 mb-5 bg-gray-50 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setTab('link')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'link' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Link chia sẻ
          </button>
          <button
            onClick={() => setTab('invite')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'invite' ? 'bg-white dark:bg-gray-900 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Mời qua email
          </button>
        </div>

        {tab === 'link' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Quyền của người dùng link</label>
              <div className="flex gap-2">
                {(['VIEWER', 'EDITOR'] as EventMemberRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setLinkRole(r)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${linkRole === r ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {!link ? (
              <button
                onClick={handleCreateLink}
                disabled={creatingLink}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {creatingLink ? 'Đang tạo…' : 'Tạo link chia sẻ'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input readOnly value={link.shareUrl} className="flex-1 h-10 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-600 dark:text-gray-300" />
                  <button onClick={handleCopy} className="px-4 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors flex-shrink-0">
                    {copied ? 'Đã chép' : 'Sao chép'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Quyền: {ROLE_LABELS[link.role]} · Hết hạn {new Date(link.expiredAt).toLocaleDateString('vi-VN')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Email người được mời</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban-be@gmail.com"
                className="w-full h-10 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Quyền</label>
              <div className="flex gap-2">
                {(['VIEWER', 'EDITOR'] as EventMemberRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setInviteRole(r)}
                    className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${inviteRole === r ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !email.trim()}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {inviting ? 'Đang gửi…' : 'Gửi lời mời'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `onOpenShare` prop and the "Chia sẻ" button to `AlbumPage.tsx`**

In the `Props` interface (`src/components/AlbumPage.tsx:6-13`), add one line after `onUpload: () => void;`:

```tsx
  onOpenShare: () => void;
```

Add `onOpenShare` to the destructured props in the function signature (same line as `onUpload`).

In the JSX, right before the existing `{user && (<button onClick={onUpload} ...>` block (around line 122), insert:

```tsx
            {user && event.role === 'OWNER' && (
              <button
                onClick={onOpenShare}
                className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-300 text-gray-700 dark:text-gray-300 font-semibold px-4 py-2.5 rounded-xl transition-all text-sm flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M8.6 10.6l6.8-3.9M8.6 13.4l6.8 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span className="hidden sm:inline">Chia sẻ</span>
              </button>
            )}
```

- [ ] **Step 3: Wire `ShareModal` into `App.tsx`**

Add the import near the other component imports:

```tsx
import ShareModal from './components/ShareModal';
```

Add state near the other modal-visibility state (next to `showUploadModal`):

```tsx
  const [showShareModal, setShowShareModal] = useState(false);
```

In the `<AlbumPage ...>` JSX call, add the new prop:

```tsx
                onOpenShare={() => setShowShareModal(true)}
```

Add the modal render block near the other modals (after the `UploadModal` block):

```tsx
      {showShareModal && selectedEvent && (
        <ShareModal
          event={selectedEvent}
          onClose={() => setShowShareModal(false)}
          onToast={addToast}
        />
      )}
```

- [ ] **Step 4: Verify compiles**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 5: Manual check — create a share link and send an invite**

Via browser automation: log in as the owner of an existing event, open its Album page, confirm the new "Chia sẻ" button appears (only for events you own — open one you don't own, or temporarily check by comparing to `event.role`, to confirm it's hidden there). Click "Chia sẻ" → "Link chia sẻ" tab → pick a role → "Tạo link chia sẻ" → confirm a `shareUrl` appears and "Sao chép" works (no console errors). Switch to "Mời qua email" tab → enter an email known NOT to have an account → "Gửi lời mời" → confirm the toast shows the backend's `404 "User not found"` message (proves error passthrough works). If a second real test account's email is available, send it a real invite and note its email for Task 4's manual check (the invite will show up there).

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareModal.tsx src/components/AlbumPage.tsx src/App.tsx
git commit -m "Add ShareModal: owner creates share links and sends email invites"
```

---

### Task 3: Role-gated Upload button and delete permissions in `AlbumPage`

**Files:**
- Modify: `src/components/AlbumPage.tsx`

**Interfaces:**
- Consumes: `event.role` (Task 1).
- Produces: `canDeletePhoto(photo: Photo): boolean` (local to `AlbumPage`, not exported — no other task needs it).

- [ ] **Step 1: Add `canDeletePhoto` and `deletablePhotos`**

Right after the `const q = filterQuery || searchQuery;` line, add:

```tsx
  const canDeletePhoto = (photo: Photo) => event.role === 'OWNER' || photo.uploadedBy === user?.name;
  const deletablePhotos = photos.filter(canDeletePhoto);
```

(`photos` here refers to the already-`useMemo`'d sorted/filtered list further down — move these two lines to right after the `photos` useMemo block instead, so `photos` is in scope. Confirm placement by checking `photos` is defined above wherever you add this.)

- [ ] **Step 2: Gate the Upload button (both instances) on role**

**Careful:** `{user && (` appears twice in this file — once guarding the header Upload button (Step 2 below) and once guarding the floating toolbar's "Xóa" button (leave that one alone; delete eligibility is already handled by gating *which photos can be selected*, in Steps 3–4, not by hiding the Xóa button itself). Match on the surrounding `onClick` to be sure you're editing the right one.

Header Upload button — this is the block whose button has `onClick={onUpload}`. Change its guard line `{user && (` to:

```tsx
            {user && event.role !== 'VIEWER' && (
```

Empty-state Upload button — this is the block whose button has `onClick={onUpload}` inside the "Chưa có ảnh nào" empty state, currently guarded by `{user && !q && (`. Change it to:

```tsx
            {user && event.role !== 'VIEWER' && !q && (
```

- [ ] **Step 3: Restrict "select all" to deletable photos**

Change `selectAll`:

```tsx
  const selectAll = () => setSelected(new Set(deletablePhotos.map((p) => p.id)));
```

Change the toolbar "Chọn tất cả" button's guard from `{photos.length > 0 && (` to `{deletablePhotos.length > 0 && (` and its label logic from comparing against `photos.length` to `deletablePhotos.length`:

```tsx
          {deletablePhotos.length > 0 && (
            <button
              onClick={selected.size === deletablePhotos.length ? clearSelect : selectAll}
              className="h-9 px-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:border-blue-300 transition-colors"
            >
              {selected.size === deletablePhotos.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          )}
```

Do the same in the floating selection toolbar (the one inside `{selected.size > 0 && (...)}`) — its "Chọn tất cả (n)" button currently reads:

```tsx
          <button
            onClick={selected.size === photos.length ? clearSelect : selectAll}
            className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            {selected.size === photos.length ? 'Bỏ chọn' : `Chọn tất cả (${photos.length})`}
          </button>
```

Change both `photos.length` references (leave `onClick`'s `clearSelect`/`selectAll` calls as-is) to `deletablePhotos.length`:

```tsx
          <button
            onClick={selected.size === deletablePhotos.length ? clearSelect : selectAll}
            className="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            {selected.size === deletablePhotos.length ? 'Bỏ chọn' : `Chọn tất cả (${deletablePhotos.length})`}
          </button>
```

Leave the empty-state check further up (`{photos.length === 0 ? (...) : (...)}`) untouched — that one means "are there any photos at all," unrelated to delete eligibility.

- [ ] **Step 4: Gate the per-photo select checkbox in `PhotoItem`**

Add `canSelect: boolean` to `PhotoItemProps` and the destructured params:

```tsx
interface PhotoItemProps {
  photo: Photo;
  selected: boolean;
  canSelect: boolean;
  onSelect: () => void;
  onClick: () => void;
}

function PhotoItem({ photo, selected, canSelect, onSelect, onClick }: PhotoItemProps) {
```

Wrap the existing select-checkbox `<button>` (the one with `title={selected ? 'Bỏ chọn' : 'Chọn ảnh'}` — NOT the eye-icon button below it, which has `title="Xem ảnh"` and stays as-is since viewing a photo isn't gated by role) in `{canSelect && ( ... )}`:

```tsx
        {canSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            title={selected ? 'Bỏ chọn' : 'Chọn ảnh'}
            className={`absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 shadow-sm ${
              selected
                ? 'bg-blue-600 opacity-100 scale-100'
                : 'bg-white/85 backdrop-blur-sm opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100'
            }`}
          >
            {selected ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <div className="w-3.5 h-3.5 rounded-[3px] border-2 border-gray-400" />
            )}
          </button>
        )}
```

Update the `.map()` call site to pass it:

```tsx
            {photos.map((photo, i) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                selected={selected.has(photo.id)}
                canSelect={canDeletePhoto(photo)}
                onSelect={() => toggleSelect(photo.id)}
                onClick={() => setLightboxIndex(i)}
              />
            ))}
```

- [ ] **Step 5: Verify compiles**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 6: Manual check — owner behavior unchanged**

Log in as an event's owner, open its Album: confirm the Upload button still shows, every photo's checkbox still appears on hover, "Chọn tất cả" still selects everything, delete still works exactly as before this task (owner role is unaffected by every change in this task — this is the regression check).

Full verification of the VIEWER/EDITOR-restricted paths needs a second account that has actually joined the event as a member (via Task 2's invite or Task 5's share link, once those exist) — note in the PR/handoff that this remains to be checked end-to-end once a second test account is available, and describe the expected result precisely: as VIEWER, no Upload button and no photo checkboxes anywhere; as EDITOR, Upload button shows, but only photos where `uploadedBy` matches that account's name get a checkbox.

- [ ] **Step 7: Commit**

```bash
git add src/components/AlbumPage.tsx
git commit -m "Gate Upload button and photo delete-selection by event role"
```

---

### Task 4: Invites inbox (bell icon in `Header`)

**Files:**
- Create: `src/components/InvitesMenu.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `listMyInvites(): Promise<EventInviteResponse[]>`, `acceptInvite(id: number): Promise<number>`, `declineInvite(id: number): Promise<void>`, `EventInviteResponse` from `src/api/invites.ts`; `handleOpenEvent(id: string)` (already in `App.tsx`).
- Produces: `InvitesMenu` component (`{ invites, onAccept, onDecline }`); `Header`'s new `invites`/`onAcceptInvite`/`onDeclineInvite` props.

- [ ] **Step 1: Create `src/components/InvitesMenu.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react';
import type { EventInviteResponse } from '../api/invites';

interface Props {
  invites: EventInviteResponse[];
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
}

const ROLE_LABELS: Record<string, string> = { VIEWER: 'Xem', EDITOR: 'Sửa' };

export default function InvitesMenu({ invites, onAccept, onDecline }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Lời mời của tôi"
        title="Lời mời của tôi"
        className="relative w-9 h-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        {invites.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {invites.length > 9 ? '9+' : invites.length}
          </span>
        )}
      </button>

      {open && (
        <div className="slide-up absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Lời mời của tôi</p>
          </div>
          {invites.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500 text-center">Chưa có lời mời nào.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {invites.map((inv) => (
                <div key={inv.id} className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60 last:border-0">
                  <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{inv.eventName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Quyền: {ROLE_LABELS[inv.role] ?? inv.role}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onAccept(inv.id); setOpen(false); }}
                      className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                    >
                      Chấp nhận
                    </button>
                    <button
                      onClick={() => onDecline(inv.id)}
                      className="flex-1 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire `InvitesMenu` into `Header.tsx`**

Add the import:

```tsx
import InvitesMenu from './InvitesMenu';
import type { EventInviteResponse } from '../api/invites';
```

Add three props to `Props` (after `onToggleTheme: () => void;`):

```tsx
  invites: EventInviteResponse[];
  onAcceptInvite: (id: number) => void;
  onDeclineInvite: (id: number) => void;
```

Add them to the destructured function params, then insert the menu in the JSX right after the theme-toggle `<button>` and before the `{/* Profile */}` block:

```tsx
        {user && <InvitesMenu invites={invites} onAccept={onAcceptInvite} onDecline={onDeclineInvite} />}
```

- [ ] **Step 3: Add invites state + handlers to `App.tsx`**

Add the import:

```tsx
import { listMyInvites, acceptInvite, declineInvite, type EventInviteResponse } from './api/invites';
```

Add state (near the other `useState` declarations):

```tsx
  const [invites, setInvites] = useState<EventInviteResponse[]>([]);
```

Add a loader (near `loadEvents`):

```tsx
  const loadInvites = useCallback(async () => {
    try {
      setInvites(await listMyInvites());
    } catch {
      // Nền, không quan trọng bằng loadEvents — không làm phiền người dùng bằng toast lỗi.
    }
  }, []);
```

Call `loadInvites();` right after every existing `loadEvents(...)` call inside the session-restore `useEffect` (there are two call sites — `loadEvents(loggedInUser.name);` in the `/oauth2/callback` success branch and `loadEvents(restoredUser.name);` in the plain token-restore success branch, per Task 1 Step 4's stale-closure fix).

Add handlers (near `handleLogout`):

```tsx
  const handleAcceptInvite = async (id: number) => {
    try {
      const eventId = await acceptInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      addToast('success', 'Đã tham gia sự kiện.');
      handleOpenEvent(String(eventId));
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không thể chấp nhận lời mời.');
    }
  };

  const handleDeclineInvite = async (id: number) => {
    try {
      await declineInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Không thể từ chối lời mời.');
    }
  };
```

(`handleAcceptInvite`/`handleDeclineInvite` must be defined after `handleOpenEvent` since the former calls the latter — place them below it.)

Pass the three new props to `<Header ...>`:

```tsx
            invites={invites}
            onAcceptInvite={handleAcceptInvite}
            onDeclineInvite={handleDeclineInvite}
```

- [ ] **Step 4: Verify compiles**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 5: Manual check**

Log in, confirm the bell icon appears in the header with no badge (assuming no pending invites), click it, confirm the empty state ("Chưa có lời mời nào.") renders with no console errors. If Task 2's manual check sent a real invite to a second test account, log in as that account instead: confirm the badge shows "1", the dropdown lists the event with the correct role label, "Chấp nhận" navigates into the Album page and removes the invite from the list, and (using a fresh invite, or re-inviting) "Từ chối" removes it without navigating anywhere.

- [ ] **Step 6: Commit**

```bash
git add src/components/InvitesMenu.tsx src/components/Header.tsx src/App.tsx
git commit -m "Add invites inbox (bell icon) to Header"
```

---

### Task 5: Public `/share/:token` page + join flow (including login round trip)

**Files:**
- Create: `src/lib/pendingShare.ts`
- Create: `src/components/SharedAlbumPage.tsx`
- Modify: `src/types.ts` (`AppView`)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getSharedEvent(token)`, `getSharedPhotos(token, page, size)`, `joinShareLink(token)` from `src/api/share.ts`; `getGoogleLoginUrl()` from `src/lib/authApi.ts`; `formatDateRange` from `src/utils.ts`.
- Produces: `savePendingShareToken`/`readPendingShareToken`/`clearPendingShareToken` (`src/lib/pendingShare.ts`); `SharedAlbumPage` component (`{ token: string; user: User | null; onJoined: (eventId: string) => void }`); `AppView` gains `'shared'`.

- [ ] **Step 1: Create `src/lib/pendingShare.ts`**

```ts
// src/lib/pendingShare.ts
// Lưu token share link tạm thời trong lúc user chưa đăng nhập bấm "Đăng nhập để tham
// gia" -> rời trang sang Google -> quay lại qua /oauth2/callback. sessionStorage (không
// phải localStorage) để tự dọn khi đóng tab, giống cách paymentApi.ts đang làm với
// pending VNPay order.
const PENDING_SHARE_TOKEN_KEY = 'phototrip-pending-share-token';

export function savePendingShareToken(token: string) {
  sessionStorage.setItem(PENDING_SHARE_TOKEN_KEY, token);
}

export function readPendingShareToken(): string | null {
  return sessionStorage.getItem(PENDING_SHARE_TOKEN_KEY);
}

export function clearPendingShareToken() {
  sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY);
}
```

- [ ] **Step 2: Add `'shared'` to `AppView` in `src/types.ts`**

```ts
export type AppView = 'login' | 'dashboard' | 'album' | 'help' | 'shared';
```

- [ ] **Step 3: Create `src/components/SharedAlbumPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { User } from '../types';
import { getSharedEvent, getSharedPhotos, joinShareLink } from '../api/share';
import type { EventResponse } from '../api/events';
import type { PhotoResponse } from '../api/photos';
import { getGoogleLoginUrl } from '../lib/authApi';
import { savePendingShareToken } from '../lib/pendingShare';
import { formatDateRange } from '../utils';

interface Props {
  token: string;
  user: User | null;
  onJoined: (eventId: string) => void;
}

type Status = 'loading' | 'error' | 'ready';

export default function SharedAlbumPage({ token, user, onJoined }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [event, setEvent] = useState<EventResponse | null>(null);
  const [photos, setPhotos] = useState<PhotoResponse[]>([]);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [eventDto, photosPage] = await Promise.all([
          getSharedEvent(token),
          getSharedPhotos(token, 0, 100),
        ]);
        if (cancelled) return;
        setEvent(eventDto);
        setPhotos(photosPage.content);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Không thể tải link chia sẻ.');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleJoin = async () => {
    if (!user) {
      savePendingShareToken(token);
      window.location.href = getGoogleLoginUrl();
      return;
    }
    setJoining(true);
    try {
      const eventId = await joinShareLink(token);
      onJoined(String(eventId));
    } catch (err) {
      setJoining(false);
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tham gia sự kiện.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'error' || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Không thể mở link chia sẻ</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 flex items-start gap-5">
          <div className="hidden sm:block w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
            <img src={event.coverImageUrl} alt={event.name} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{event.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              {event.location} · {formatDateRange(event.startDate, event.endDate)}
            </p>
          </div>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex-shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all text-sm shadow-sm disabled:opacity-60"
          >
            {joining ? 'Đang tham gia…' : user ? 'Tham gia sự kiện' : 'Đăng nhập để tham gia'}
          </button>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
        {photos.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-20">Chưa có ảnh nào trong sự kiện này.</p>
        ) : (
          <div className="photo-masonry">
            {photos.map((photo) => (
              <div key={photo.id} className="photo-item rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                <img src={photo.url} alt={photo.originalName} className="w-full h-auto object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire routing + join-after-login into `App.tsx`**

Add imports:

```tsx
import SharedAlbumPage from './components/SharedAlbumPage';
import { joinShareLink } from './api/share';
import { readPendingShareToken, clearPendingShareToken } from './lib/pendingShare';
```

Add state (near `selectedEventId`):

```tsx
  const [sharedToken, setSharedToken] = useState<string | null>(null);
```

Replace the entire session-restore `useEffect` (the one starting `if (window.location.pathname === '/oauth2/callback') {` and ending `}, []);`, which by this point already has the `loadInvites();` calls from Task 4) with:

```tsx
  useEffect(() => {
    if (window.location.pathname === '/oauth2/callback') {
      const token = new URLSearchParams(window.location.search).get('token');
      window.history.replaceState({}, '', '/');

      if (!token) {
        addToast('error', 'Đăng nhập Google thất bại. Vui lòng thử lại.');
        replace({ view: 'login' });
        setCheckingSession(false);
        return;
      }

      setToken(token);
      fetchCurrentUser()
        .then(async (loggedInUser) => {
          setUser(loggedInUser);
          addToast('success', `Xin chào, ${loggedInUser.name}! Đăng nhập thành công.`);
          loadEvents(loggedInUser.name);
          loadInvites();

          // Nếu vừa đăng nhập từ luồng "Đăng nhập để tham gia" trên link chia sẻ
          // (SharedAlbumPage lưu token trước khi rời sang Google), tự join ngay.
          const pendingShareToken = readPendingShareToken();
          if (pendingShareToken) {
            clearPendingShareToken();
            try {
              const eventId = await joinShareLink(pendingShareToken);
              addToast('success', 'Đã tham gia sự kiện từ link chia sẻ.');
              handleOpenEvent(String(eventId));
              return;
            } catch (err) {
              addToast('error', err instanceof Error ? err.message : 'Không thể tham gia sự kiện qua link chia sẻ.');
              // rơi xuống dashboard mặc định bên dưới
            }
          }

          setView('dashboard');
          replace({ view: 'dashboard' });
        })
        .catch(() => {
          clearToken();
          addToast('error', 'Không thể xác thực tài khoản. Vui lòng đăng nhập lại.');
          replace({ view: 'login' });
        })
        .finally(() => setCheckingSession(false));
      return;
    }

    if (window.location.pathname.startsWith('/share/')) {
      const token = window.location.pathname.slice('/share/'.length).split('/')[0];
      setSharedToken(token);
      setView('shared');
      const existingToken = getToken();
      if (existingToken) {
        fetchCurrentUser()
          .then(setUser)
          .catch(() => clearToken())
          .finally(() => setCheckingSession(false));
      } else {
        setCheckingSession(false);
      }
      return;
    }

    const token = getToken();
    if (!token) {
      replace({ view: 'login' });
      setCheckingSession(false);
      return;
    }
    fetchCurrentUser()
      .then((restoredUser) => {
        setUser(restoredUser);
        setView('dashboard');
        replace({ view: 'dashboard' });
        loadEvents(restoredUser.name);
        loadInvites();
      })
      .catch(() => {
        replace({ view: 'login' });
      })
      .finally(() => setCheckingSession(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

(`handleOpenEvent` is referenced here even though it's defined later in the component body — safe, since this callback only executes after the first render commits, by which point `handleOpenEvent` already exists in the closure, same as the pre-existing `addToast`/`loadEvents` usage.)

Add the `'shared'` render branch in the top-level JSX, right after the `view === 'login'` branch:

```tsx
      {view === 'login' ? (
        <LoginPage theme={theme} onToggleTheme={toggleTheme} />
      ) : view === 'shared' ? (
        <SharedAlbumPage
          token={sharedToken ?? ''}
          user={user}
          onJoined={(eventId) => {
            window.history.replaceState({}, '', '/');
            handleOpenEvent(eventId);
          }}
        />
      ) : (
```

(The existing `<>...</>` block that used to be the `) : (` branch stays exactly as-is, just now nested one level further under this new condition.)

- [ ] **Step 5: Verify compiles**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 6: Manual check — full loop, logged out then logged in**

Using a share link created in Task 2's manual check (or create a fresh one): open it in a private/incognito-equivalent browser context (no existing session — `claude-in-chrome` can open a fresh tab; clear `localStorage`/cookies for the origin first if needed) at `http://localhost:8443/share/<token>`. Confirm: the event's name/cover/location render, photos show in a read-only grid (no upload/select chrome), and the button reads "Đăng nhập để tham gia". Click it, confirm it redirects to Google, then complete login manually (same constraint as earlier in this session — credentials aren't something to automate) and confirm you land back in the app already inside that event's Album page (not the Dashboard), with a "Đã tham gia sự kiện từ link chia sẻ." toast, and the URL bar shows `/` (not `/share/...` anymore). Repeat while already logged in: open the same `/share/<token>` URL, confirm the button reads "Tham gia sự kiện", click it, confirm it navigates straight into the Album page without leaving the app.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pendingShare.ts src/components/SharedAlbumPage.tsx src/types.ts src/App.tsx
git commit -m "Add public /share/:token page and join-after-login flow"
```

---

### Task 6: Remove dead "Xem không cần đăng nhập" button on `LoginPage`

**Files:**
- Modify: `src/components/LoginPage.tsx:124-127`

- [ ] **Step 1: Remove the dead block**

Delete this block entirely (it has no `onClick` and, now that viewing requires a real `/share/:token` URL, there's nothing generic to browse to without one):

```tsx
          <p className="mt-6 text-sm text-center text-gray-500 dark:text-gray-400">
            Bạn có album được chia sẻ?{' '}
            <button className="text-blue-600 font-medium hover:underline">Xem không cần đăng nhập</button>
          </p>
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit -p .`
Expected: no output, exit code 0.

- [ ] **Step 3: Manual check**

Open `http://localhost:8443/` logged out, confirm the LoginPage renders without that paragraph/button and nothing else shifted awkwardly (the "hoặc" divider above it and the terms-of-service paragraph below it are unaffected — check spacing looks fine with it gone).

- [ ] **Step 4: Commit**

```bash
git add src/components/LoginPage.tsx
git commit -m "Remove dead 'xem không cần đăng nhập' button from LoginPage"
```
