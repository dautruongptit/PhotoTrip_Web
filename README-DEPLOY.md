# Frontend deploy files — PhotoTripManagement

| File | Hành động |
|---|---|
| `Dockerfile` | File MỚI — copy vào gốc repo |
| `nginx.conf` | File MỚI — copy vào gốc repo (đã proxy đủ `/api`, `/oauth2`, `/login/oauth2`) |
| `docker-compose.yml` | File MỚI — copy vào gốc repo, dùng cho production trên Ubuntu |
| `vite.config.ts` | GHI ĐÈ file gốc — đã thêm khối `proxy` trong `server{}` (dev only, không ảnh hưởng build production), giữ nguyên toàn bộ phần Figma Make khác |
| `.env.development` / `.env.production` | Copy vào gốc repo, điền `VITE_GOOGLE_CLIENT_ID` thật |
| `src/api/*.ts` | File MỚI — copy vào `src/api/` |
| `src/pages/OAuth2Callback.tsx` | File MỚI — copy vào `src/pages/`, nhớ thêm route `<Route path="/oauth2/callback" element={<OAuth2Callback />} />` |
| `.gitignore.additions` | Thêm các dòng này vào `.gitignore` hiện có |

## Chạy dev (native, không Docker)
```bash
pnpm install
pnpm dev     # http://localhost:8443, proxy /api,/oauth2,/login/oauth2 -> localhost:8083
```
Yêu cầu: backend đang chạy ở `localhost:8083` (qua IntelliJ, xem `docker-deployment-guide.md` mục 14) và Postgres dev đang chạy (`docker-compose.db.dev.yml` trong bộ backend).

## Build production (Ubuntu, Docker)
```bash
docker compose up -d --build
```
Yêu cầu: network `shared-network` đã tồn tại, backend + Postgres production đã chạy (xem bộ backend).

## 2 chỗ cần điền trước khi chạy
- `VITE_GOOGLE_CLIENT_ID` trong `.env.development` và `.env.production`
- Trong `src/api/photos.ts`, tên field `"files"` khi upload — đối chiếu lại `@RequestParam` thật trong `PhotoController.upload()` nếu upload trả lỗi 400

Xem giải thích đầy đủ (endpoint thật, luồng Google Login, các lỗi đã sửa...) trong `docker-deployment-guide.md` đính kèm.
