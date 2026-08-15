# Hướng dẫn Docker hoá TravelAlbum (FE: PhotoTripManagement + BE: travelPhoto-API)

> Cập nhật: backend đã chuyển sang repo **travelPhoto-API** (Spring Boot 3.3, PostgreSQL, JWT + Google OAuth2, Flyway). Repo này **đã có sẵn `Dockerfile` và `docker-compose.yml`** — mục dưới đây review lại các file có sẵn, chỉ ra chỗ cần sửa, và bổ sung phần còn thiếu (DB service, frontend, network dùng chung, Cloudflare).

---

## 0. Kiến trúc mục tiêu

```
Internet ── Cloudflare ──▶  VPS
                             │
                    external network "shared-network"
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                      ▼
   frontend (nginx:80)   backend (travelPhoto-API)   postgres:5432
   port public: 8090      port public: 8085→8083      (không expose ra host)
```

`backend` build từ repo `travelPhoto-API`, đã có Dockerfile chuẩn (multi-stage, non-root user, expose 8083). `frontend` build từ `PhotoTripManagement` (nginx, proxy `/api/` sang backend). Tất cả nằm chung 1 network Docker **external** tên `shared-network` (network bạn đã dùng sẵn cho `mysql-shared` và các project khác trên server) để bạn có thể quản lý FE/BE/DB bằng các `docker-compose.yml` tách riêng theo từng repo mà vẫn nói chuyện được với nhau qua tên service.

---

## 1. Review `Dockerfile` (travelPhoto-API) — ĐÃ ỔN, không cần sửa

```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/target/*.jar app.jar
RUN chown app:app app.jar
USER app
EXPOSE 8083
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Multi-stage, chạy bằng user không phải root, expose 8083 — đúng chuẩn, giữ nguyên.

---

## 2. Review `docker-compose.yml` (travelPhoto-API) — CÓ 3 LỖI CẦN SỬA

File gốc:

```yaml
version: '3.9'
services:
  backend:
    build: .
    container_name: travelPhoto-backend
    restart: unless-stopped
    env_file:
      - ..env
    environment:
      SPRING_PROFILES_ACTIVE: prod
      SWAGGER_ENABLED: "true"
      FLYWAY_BASELINE: "false"
      JWT_SECRET: "SuperLongSecretKeyHereAtLeast32CharactersMakeItRandom20262"
    ports:
      - "${SERVER_PORT:-8085}:${SERVER_PORT:-8083}"
    volumes:
      - ${STORAGE_ROOT_PATH:-/data/photo-storage}:/data/photo-storage
    networks:
      - shared-network

networks:
  shared:
    external: true
```

**Lỗi 1 — `env_file: - ..env`**: thừa 1 dấu chấm, đúng ra phải là `.env`. Với `..env` Docker Compose sẽ báo lỗi không tìm thấy file.

**Lỗi 2 — tên network không khớp**: service khai `networks: - shared-network` nhưng phần định nghĩa network ở cuối lại đặt tên là `shared` (`shared: external: true`). Compose sẽ báo lỗi vì `shared-network` chưa từng được định nghĩa. Phải dùng cùng một tên ở cả hai chỗ.

**Lỗi 3 — cổng host và cổng container dùng chung 1 biến**: `"${SERVER_PORT:-8085}:${SERVER_PORT:-8083}"` — cả 2 phía đều đọc từ `SERVER_PORT`. Nếu bạn set `SERVER_PORT=8085` trong `.env`, mapping sẽ thành `"8085:8085"` (không phải `8085:8083`), trong khi container thực tế lắng nghe ở `8083` (theo `EXPOSE 8083`) → request vào container sẽ không tới được app, trừ khi bạn cũng set `server.port=${SERVER_PORT}` trong `application.yml`. Cách sửa an toàn nhất: tách 2 biến riêng, cổng container giữ cố định `8083` khớp với Dockerfile.

**Vấn đề phụ**: `JWT_SECRET` bị hard-code ngay trong file (đã commit lên Git) — dù vẫn nhận qua `env_file`, dòng `environment:` này override và lộ secret thật lên GitHub công khai. Nên xoá dòng này, để `JWT_SECRET` chỉ nằm trong `.env` (không commit).

### `docker-compose.yml` đã sửa:

```yaml
version: '3.9'
services:
  backend:
    build: .
    container_name: travelPhoto-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE:-prod}
      SWAGGER_ENABLED: ${SWAGGER_ENABLED:-false}
      FLYWAY_BASELINE: "false"
    ports:
      - "${SERVER_PORT_HOST:-8085}:8083"
    volumes:
      - ${STORAGE_ROOT_PATH:-/data/photo-storage}:/data/photo-storage
    networks:
      - shared-network

networks:
  shared-network:
    external: true
```

> Ở production thật ra bạn có thể bỏ hẳn `ports:` (dùng `expose: ["8083"]`) vì nginx của `frontend` sẽ proxy nội bộ qua tên service `backend:8083` — không cần mở cổng backend ra host. Giữ `ports` như trên chỉ hữu ích khi bạn cần gọi thẳng backend để debug từ máy VPS/bên ngoài network.

---

## 3. Tạo network dùng chung trước khi chạy bất kỳ compose nào

```bash
docker network create shared-network
```

Chạy 1 lần trên VPS (bạn có thể đã tạo network này từ trước cho `mysql-shared` — kiểm tra bằng `docker network ls` trước khi tạo mới, tránh trùng). Cả 3 `docker-compose.yml` (frontend, backend, database) đều khai `networks: shared-network: external: true` để cùng trỏ vào network này.

---

## 4. `docker-compose.db.yml` (PostgreSQL — repo không có sẵn, cần thêm)

`pom.xml` của `travelPhoto-API` dùng driver `org.postgresql:postgresql` (không phải MySQL như repo backend cũ) — Flyway migrations (`V1__init_schema.sql`...) cũng viết cho Postgres. Tạo file riêng:

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    container_name: travelPhoto-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:-travel_photo}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - shared-network
    # KHÔNG publish port ra host ở production

networks:
  shared-network:
    external: true

volumes:
  pg_data:
```

`DB_USER`/`DB_PASSWORD` là 2 biến README của backend đã yêu cầu — dùng đúng tên này trong `.env` để Spring Boot và Postgres container đọc cùng một cặp giá trị, tránh lệch user/password giữa 2 container.

> Lưu ý: tôi chưa fetch được `application.yml` thật của repo (link không nằm trong kết quả tôi có thể truy cập), nên chưa xác nhận 100% tên property Spring dùng để build `spring.datasource.url`. Hãy đối chiếu lại đúng tên biến (`DB_HOST`, `DB_PORT`, `DB_NAME`...) trong `application.yml`/`application-prod.yml` thật rồi khớp vào `.env` bên dưới.

---

## 5. `.env` cho backend (đặt cạnh `docker-compose.yml` của travelPhoto-API)

```env
SPRING_PROFILES_ACTIVE=prod
SWAGGER_ENABLED=false
SERVER_PORT_HOST=8085

# Postgres — backend kết nối qua tên service trong network "shared-network"
DB_HOST=postgres
DB_PORT=5432
DB_NAME=travel_photo
DB_USER=app_user
DB_PASSWORD=<mat khau manh>

JWT_SECRET=<random 32+ ky tu, KHONG dung gia tri mau trong repo>

GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx

STORAGE_ROOT_PATH=/data/photo-storage
```

Nhớ đổi `JWT_SECRET` — giá trị mẫu trong `docker-compose.yml` gốc đã bị lộ công khai trên GitHub, không dùng lại ở production.

---

## 6. Frontend — Dockerfile + compose nối vào network `shared-network`

`PhotoTripManagement/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`PhotoTripManagement/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8083/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Chú ý `proxy_pass` trỏ đúng cổng 8083 (container port thật của backend), không phải 8085 (cổng publish ra host).

`PhotoTripManagement/docker-compose.yml`:

```yaml
version: '3.9'
services:
  frontend:
    build:
      context: .
      args:
        VITE_API_BASE_URL: https://triptravel.thongtinchinhhieu.site/api
        VITE_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
    container_name: travelPhoto-frontend
    restart: unless-stopped
    ports:
      - "8090:80"
    networks:
      - shared-network

networks:
  shared-network:
    external: true
```

---

## 7. Thứ tự chạy trên VPS

```bash
docker network create shared-network   # 1 lan duy nhat (bo qua neu da co san)

cd travelPhoto-API
docker compose -f docker-compose.db.yml up -d     # postgres truoc
docker compose up -d --build                       # backend

cd ../PhotoTripManagement
docker compose up -d --build          # frontend
```

---

## 8. Cloudflare — domain `triptravel.thongtinchinhhieu.site`

**Cách A — Cloudflare Tunnel (khuyến nghị)**: bạn **đã có sẵn Cloudflare Tunnel chạy trên server này** (dùng cho SSH/Portainer/WordPress) — chỉ cần thêm 1 **Public Hostname** mới trong tunnel hiện có, xem chi tiết mục 13 bên dưới. Không cần tạo thêm container `cloudflared` mới.

**Cách B — DNS proxy (orange cloud) + port thật**: A record trỏ về IP VPS, SSL mode **Full**, VPS mở port 80/443 (Nginx/Caddy ngoài Docker) proxy vào `127.0.0.1:8090`.

---

## 9. Google Login — Authorized origins

`travelPhoto-API` đã có sẵn `CustomOAuth2UserService`/`OAuth2SuccessHandler`/`OAuth2FailureHandler` — tức dùng luồng redirect chuẩn của Spring Security OAuth2, không phải Google Identity Services phía FE. Với luồng này bắt buộc phải khai **Authorized redirect URI**, không chỉ JavaScript origin:

| Môi trường | Authorized JavaScript origins | Authorized redirect URI |
|---|---|---|
| Dev | `http://localhost:8443` | `http://localhost:8083/login/oauth2/code/google` |
| Prod | `https://triptravel.thongtinchinhhieu.site` | `https://triptravel.thongtinchinhhieu.site/login/oauth2/code/google` |

`/login/oauth2/code/google` là path mặc định của Spring Security. **Quan trọng**: đọc trực tiếp `SecurityConfig.java` thật xác nhận `/oauth2/**` và `/login/oauth2/code/**` nằm ở **root, KHÔNG có prefix `/api`** (khác với các endpoint REST khác trong `AuthController`/`EventController`... vốn có `/api` vì khai trực tiếp trong `@RequestMapping` của từng controller, không phải qua `context-path` toàn cục). Do đó `nginx.conf` phải proxy thêm 2 location riêng cho `/oauth2/` và `/login/oauth2/` (xem mục 12.7 cập nhật bên dưới) — chỉ proxy `/api/` là **không đủ**, sẽ khiến bước redirect về Google bị 404.

---

## 10. Checklist khác biệt so với bản trước (repo backend cũ MySQL)

- [x] Backend đổi từ MySQL sang **PostgreSQL** — cập nhật lại mọi chỗ đã lỡ cấu hình MySQL.
- [x] `pom.xml` còn dư `flyway-mysql` và `mysql-connector-j` dù đã dùng Postgres — không bắt buộc phải xoá để chạy được, nhưng nên dọn để tránh nhầm lẫn.
- [ ] Sửa 3 lỗi trong `docker-compose.yml` gốc (mục 2) trước khi deploy — nếu không sửa, `docker compose up` sẽ lỗi ngay ở bước network, và port backend map sai.
- [ ] Xác nhận tên property thật trong `application.yml`/`application-prod.yml` khớp với các biến `.env` ở mục 5 (chưa fetch được file này để đối chiếu).

---

## 11. Cấu hình chi tiết Google Cloud Console — Dev & Prod

### 11.1 Tạo project (nếu chưa có)

console.cloud.google.com → chọn/tạo project, ví dụ `travel-photo-album`. Dev và Prod nên dùng **chung 1 project**, chỉ tách **2 OAuth Client ID khác nhau** (khuyến nghị) — dễ revoke riêng, dễ theo dõi log, không lẫn secret dev vào prod.

### 11.2 Cấu hình OAuth consent screen (làm 1 lần)

APIs & Services → OAuth consent screen:
- **User Type**: chọn **External** (trừ khi bạn có Google Workspace và chỉ muốn nội bộ dùng thì chọn Internal).
- Điền **App name**, **User support email**, **Developer contact information**.
- **Scopes**: thêm `.../auth/userinfo.email` và `.../auth/userinfo.profile` (đủ cho đăng nhập cơ bản, không cần scope nhạy cảm nên **không cần Google verify app**).
- **Publishing status**:
  - `Testing`: chỉ những email bạn thêm vào **Test users** mới đăng nhập được — dùng giai đoạn dev/thử nghiệm, không giới hạn thời gian với scope cơ bản.
  - `In production`: ai cũng đăng nhập được, không cần thêm test user — chuyển sang trạng thái này khi launch thật ra `triptravel.thongtinchinhhieu.site`. Với scope cơ bản (email/profile) việc publish **không yêu cầu Google review**, chỉ cần bấm "Publish app".

### 11.3 Tạo 2 OAuth Client ID (Web application)

APIs & Services → Credentials → **Create Credentials → OAuth client ID → Application type: Web application**.

**Client #1 — Dev**
- Name: `travel-photo-dev`
- Authorized JavaScript origins:
  - `http://localhost:8443`
- Authorized redirect URIs:
  - `http://localhost:8083/login/oauth2/code/google`
- Sau khi tạo, copy `Client ID` + `Client secret` → dán vào `.env.dev` / `.env` dùng lúc chạy `docker-compose.dev.yml`.

**Client #2 — Production**
- Name: `travel-photo-prod`
- Authorized JavaScript origins:
  - `https://triptravel.thongtinchinhhieu.site`
- Authorized redirect URIs:
  - `https://triptravel.thongtinchinhhieu.site/login/oauth2/code/google`
- Copy `Client ID` + `Client secret` riêng → dán vào `.env` trên VPS (không commit, không dùng chung với dev).

> Nếu bạn muốn đơn giản hơn, có thể dùng **1 Client ID duy nhất** và khai cả 2 origin + cả 2 redirect URI cùng lúc (Google cho phép nhiều dòng). Cách này ít việc quản lý hơn nhưng dev và prod sẽ dùng chung 1 secret — nếu secret dev lỡ lộ (ví dụ commit nhầm `.env` lúc code) thì phải revoke luôn cả prod.

### 11.4 Map vào Spring Boot (`application.yml`)

Vì `travelPhoto-API` dùng `spring-boot-starter-oauth2-client` (luồng redirect chuẩn), khai báo theo convention của Spring Security:

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope:
              - email
              - profile
```

Spring Security tự dựng redirect URI theo pattern `{baseUrl}/login/oauth2/code/{registrationId}` → chính là `.../login/oauth2/code/google`, **không có `/api`** ở đầu — đã sửa lại ở mục 11.3. Sai một ký tự (kể cả có/không `/api`) ở đây là nguyên nhân phổ biến nhất của lỗi `redirect_uri_mismatch`.

### 11.5 Lỗi thường gặp

| Lỗi | Nguyên nhân thường gặp |
|---|---|
| `redirect_uri_mismatch` | Redirect URI thực tế app gửi lên không khớp 100% (kể cả `http` vs `https`, có/không dấu `/` cuối, sai context-path) với URI đã khai trên Console |
| `Error 403: access_denied` lúc đang ở Testing | Email đăng nhập chưa được thêm vào **Test users** |
| Google login chạy ổn ở dev nhưng lỗi ở prod dù đã đổi Client ID | Quên đổi `APP_CORS_ALLOWED_ORIGINS` / origin trong `application-prod.yml` sang domain thật, hoặc chưa restart container sau khi đổi `.env` |

---

## 12. Danh sách endpoint THẬT (đọc trực tiếp từ source code 7 Controller) + code FE chính xác

> Khác với mục 11 cũ (dựa vào Swagger để đoán), phần này mình đã đọc trực tiếp `AuthController`, `EventController`, `PhotoController`, `ShareController`, `UserController`, `AdminController`, `SearchController`, `SecurityConfig`, `OAuth2SuccessHandler` thật trong repo — endpoint dưới đây chính xác 100% theo code hiện tại, không phải suy đoán.

### 12.1 Bảng endpoint đầy đủ

| Method | Path | Auth | Ghi chú |
|---|---|---|---|
| GET | `/oauth2/authorization/google` | public | Điểm khởi đầu luồng login — **redirect cả trang** (`window.location.href = ...`), không phải gọi bằng `fetch` |
| POST | `/api/auth/refresh` | cookie `refresh_token` | Trả `{accessToken, user}`, xoay vòng refresh token (rotation) |
| POST | `/api/auth/logout` | Bearer token | |
| GET | `/api/auth/me` | Bearer token | |
| GET | `/api/events` | public (GET permitAll) | phân trang (`Pageable`: `?page=&size=&sort=`) |
| GET | `/api/events/{id}` | public | |
| POST | `/api/events` | Bearer token | **multipart/form-data**, không phải JSON |
| PUT | `/api/events/{id}` | Bearer token | **multipart/form-data** |
| DELETE | `/api/events/{id}` | Bearer token | |
| GET | `/api/events/{id}/cover` | public | trả ảnh raw (dùng thẳng làm `src` của `<img>`), không phải JSON |
| GET | `/api/events/search?keyword=` | public | |
| POST | `/api/events/{eventId}/photos` | Bearer token | **multipart/form-data**, upload nhiều ảnh cùng lúc |
| GET | `/api/events/{eventId}/photos` | public | phân trang |
| DELETE | `/api/photos/{id}` | Bearer token | |
| GET | `/api/photos/download/{id}` | public | trả file raw — dùng link tải trực tiếp, không `fetch` JSON |
| POST | `/api/photos/download-zip?ids=1&ids=2` | public | trả file zip raw |
| GET | `/api/photos/search?keyword=` | public | |
| POST | `/api/events/{id}/share` | Bearer token | tạo link chia sẻ |
| GET | `/api/share/{token}` | public | ai có link cũng xem được, không cần đăng nhập |
| GET | `/api/share/{token}/photos` | public | |
| DELETE | `/api/share/{token}` | Bearer token | thu hồi link |
| GET | `/api/users/profile` | Bearer token | |
| PUT | `/api/users/profile` | Bearer token | JSON: `{ "fullName": "..." }` |
| GET | `/api/users` | Bearer token (role ADMIN, theo `/api/admin/**`... **thực ra path này KHÔNG có prefix `/admin` nên không bị chặn role — xem cảnh báo bên dưới**) | |
| DELETE | `/api/users/{id}` | Bearer token | |
| GET | `/api/admin/dashboard` | **role ADMIN** | |
| GET | `/api/admin/storage` | **role ADMIN** | |
| GET | `/api/admin/statistics` | **role ADMIN** | |
| GET | `/api/admin/users` | **role ADMIN** | |
| GET | `/api/admin/logs` | **role ADMIN** | phân trang |

### 12.2 Hai điều cần báo với bạn trước khi FE tích hợp (đọc thấy trong `SecurityConfig`, không phải do mình đoán)

1. ~~`GET /api/users` không nằm dưới `/api/admin/**`...~~ — **Đính chính**: sau khi đọc trực tiếp `UserController.java`, endpoint này thực ra có `@PreAuthorize("hasRole('ADMIN')")` ngay trên method, tức được bảo vệ ở **method-level annotation**, độc lập với rule URL-pattern trong `SecurityConfig`. Nhận định trước đó của mình là sai — endpoint này **an toàn**, xin lỗi vì thông tin nhiễu. Chi tiết đầy đủ + chính xác từng endpoint xem mục 15 bên dưới.
2. **`"/api/auth/me/**"` (có `/**`) vô tình khớp luôn cả path chính xác `/api/auth/me`** theo cách Spring so khớp Ant-pattern — nghĩa là `GET /api/auth/me` đang **permitAll**, trong khi code bên trong lại bắt buộc dùng `@AuthenticationPrincipal principal` (sẽ gây lỗi 500 thay vì 401 gọn gàng nếu gọi mà không có token). FE vẫn gọi bình thường kèm Bearer token thì không sao, chỉ là bạn không nên dựa vào response 401 của endpoint này để phát hiện "chưa đăng nhập" — nó có thể trả 500.

### 12.3 Luồng Google Login phía FE (chính xác theo `OAuth2SuccessHandler` thật)

Backend **không** trả JSON cho bước login — nó **redirect cả trình duyệt**:

```
FE bấm nút → window.location.href = `/oauth2/authorization/google`  (đường dẫn TUYỆT ĐỐI tính từ domain gốc, không cộng thêm `${API_BASE}` vì endpoint này nằm ngoài `/api`)
   ↓ (rời khỏi SPA, sang Google, người dùng chọn tài khoản)
Google redirect ngược về BE → BE xử lý → set cookie refresh_token (HttpOnly)
   ↓
BE redirect trình duyệt về: `${app.frontend-url}/oauth2/callback?token=<accessToken>`
```

`app.frontend-url` là property đọc từ biến môi trường — **bắt buộc phải set đúng domain FE thật** cho từng môi trường, thêm vào `.env` mục 5:

```env
# thêm vào .env (dev) và .env (prod) của backend
APP_FRONTEND_URL=http://localhost:8443      # dev
# APP_FRONTEND_URL=https://triptravel.thongtinchinhhieu.site   # prod
```

và trong `application.yml`:
```yaml
app:
  frontend-url: ${APP_FRONTEND_URL}
  cookie-secure: ${APP_COOKIE_SECURE:true}
```

`app.cookie-secure` **phải là `false` ở dev** (`.env` dev: `APP_COOKIE_SECURE=false`) — cookie `Secure` chỉ được trình duyệt lưu qua HTTPS, mà dev bạn chạy `http://localhost:8085`, nếu để `true` cookie `refresh_token` sẽ **không bao giờ được lưu**, luồng refresh sẽ luôn lỗi ở dev dù code không sai.

**Route FE cần thêm**: `/oauth2/callback` (React Router) — đọc query `token`, lưu vào state, gọi `/api/auth/me` lấy thông tin user, rồi điều hướng vào app:

```tsx
// src/pages/OAuth2Callback.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setAccessToken } from "@/api/client";
import { fetchMe } from "@/api/auth";

export default function OAuth2Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { navigate("/login?error=missing_token"); return; }

    setAccessToken(token);
    fetchMe()
      .then(() => navigate("/"))
      .catch(() => navigate("/login?error=session"));
  }, []);

  return <p>Đang đăng nhập...</p>;
}
```

### 12.4 ⚠️ Gotcha quan trọng nhất khi test ở DEV: cookie `SameSite=Strict`

`OAuth2SuccessHandler`/`AuthController` set cookie với `.sameSite("Strict")`. Cookie `SameSite=Strict` **chỉ được trình duyệt gửi kèm khi request cùng site (cùng domain, kể cả khác port thì vẫn coi là khác origin nhưng cùng "site")** — thực ra `localhost:8443` (FE) gọi `localhost:8085` (BE) vẫn được coi khác **origin** nhưng theo định nghĩa "site" của trình duyệt (eTLD+1) thì `localhost` cùng site nên `SameSite=Strict` **vẫn chặn** vì đây là 2 port khác nhau bị xem là cross-site request về mặt cookie policy của một số trình duyệt hiện đại (Chrome coi `localhost` các port khác nhau vẫn là khác site cho mục đích cookie). Nói ngắn gọn: **`POST /api/auth/refresh` gọi trực tiếp từ `localhost:8443` sang `localhost:8085` rất dễ không nhận được cookie**, dù `CorsConfiguration` đã set `allowCredentials(true)` đúng.

**Cách khắc phục chuẩn nhất — thêm Vite dev proxy** để FE dev server tự forward `/api`, `/oauth2`, `/login/oauth2` sang backend, biến mọi request thành "cùng origin" y hệt cách nginx làm ở production (đã cấu hình ở mục 6):

`vite.config.ts` — thêm khối `server.proxy`:

```ts
server: {
  host: '0.0.0.0',
  port: parseInt(process.env.PORT || '8443'),
  strictPort: true,
  proxy: {
    '/api': { target: 'http://localhost:8085', changeOrigin: true },
    '/oauth2': { target: 'http://localhost:8085', changeOrigin: true },
    '/login/oauth2': { target: 'http://localhost:8085', changeOrigin: true },
  },
  watch: { ignored: ['**/.figma/**'] },
},
```

Và đổi `VITE_API_BASE_URL` ở dev thành **đường dẫn tương đối**, không phải `http://localhost:8085`:

```env
# .env.development
VITE_API_BASE_URL=/api
```

Nhờ vậy trình duyệt chỉ thấy 1 origin duy nhất (`http://localhost:8443`) cả lúc dev lẫn prod — cookie, CORS, redirect Google login hoạt động giống hệt production, tránh được cả lớp bug chỉ-xảy-ra-ở-dev.

### 12.5 API client — cập nhật lại cho khớp response envelope thật

Backend bọc mọi response trong `{ success, message, data, errorCode, timestamp }` — FE cần unwrap `.data`:

```ts
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_BASE_URL; // "/api" ở cả dev (nhờ proxy) và prod (nhờ nginx)

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include", // bắt buộc để gửi cookie refresh_token
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options); // retry 1 lần sau khi refresh
  }

  const body = await res.json();
  if (!body.success) throw new Error(body.message ?? "Request failed");
  return body.data as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    const body = await res.json();
    if (body.success) { setAccessToken(body.data.accessToken); return true; }
  } catch {}
  setAccessToken(null);
  return false;
}

export const apiGet = <T,>(path: string) => request<T>(path);
export const apiPost = <T,>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
export const apiPut = <T,>(path: string, data?: unknown) =>
  request<T>(path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
export const apiDelete = <T,>(path: string) => request<T>(path, { method: "DELETE" });

// riêng cho multipart (create/update Event, upload Photo)
export const apiPostForm = <T,>(path: string, form: FormData) =>
  request<T>(path, { method: "POST", body: form }); // KHÔNG set Content-Type, browser tự thêm boundary
export const apiPutForm = <T,>(path: string, form: FormData) =>
  request<T>(path, { method: "PUT", body: form });
```

### 12.6 Service theo từng controller (endpoint thật)

```ts
// src/api/auth.ts
import { apiGet, apiPost, setAccessToken } from "./client";

export const loginWithGoogle = () => {
  window.location.href = `/oauth2/authorization/google`; // đường dẫn root, KHÔNG cộng VITE_API_BASE_URL ("/api")
};
export const fetchMe = () => apiGet<{ id: number; fullName: string; email: string; role: string }>("/auth/me");
export const logout = async () => { await apiPost("/auth/logout"); setAccessToken(null); };
```

```ts
// src/api/events.ts
import { apiGet, apiDelete, apiPostForm, apiPutForm } from "./client";

export const listEvents = (page = 0, size = 10) => apiGet(`/events?page=${page}&size=${size}`);
export const getEvent = (id: number) => apiGet(`/events/${id}`);
export const searchEvents = (keyword: string) => apiGet(`/events/search?keyword=${encodeURIComponent(keyword)}`);
export const deleteEvent = (id: number) => apiDelete(`/events/${id}`);

export const createEvent = (data: { name: string; description?: string; startDate: string; endDate?: string; location: string; cover?: File }) => {
  const form = new FormData();
  Object.entries(data).forEach(([k, v]) => v !== undefined && form.append(k, v as any));
  return apiPostForm(`/events`, form);
};
export const updateEvent = (id: number, data: Partial<Parameters<typeof createEvent>[0]>) => {
  const form = new FormData();
  Object.entries(data).forEach(([k, v]) => v !== undefined && form.append(k, v as any));
  return apiPutForm(`/events/${id}`, form);
};

export const eventCoverUrl = (id: number) => `${import.meta.env.VITE_API_BASE_URL}/events/${id}/cover`; // dùng thẳng làm <img src>
```

```ts
// src/api/photos.ts
import { apiGet, apiDelete, apiPostForm } from "./client";

export const listPhotosByEvent = (eventId: number, page = 0, size = 20) =>
  apiGet(`/events/${eventId}/photos?page=${page}&size=${size}`);
export const searchPhotos = (keyword: string) => apiGet(`/photos/search?keyword=${encodeURIComponent(keyword)}`);
export const deletePhoto = (id: number) => apiDelete(`/photos/${id}`);

export const uploadPhotos = (eventId: number, files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f)); // tên field "files" — đối chiếu lại nếu backend đặt tên khác
  return apiPostForm(`/events/${eventId}/photos`, form);
};

export const photoDownloadUrl = (id: number) => `${import.meta.env.VITE_API_BASE_URL}/photos/download/${id}`;
export const photosDownloadZipUrl = (ids: number[]) =>
  `${import.meta.env.VITE_API_BASE_URL}/photos/download-zip?${ids.map((i) => `ids=${i}`).join("&")}`;
```

```ts
// src/api/share.ts
import { apiGet, apiPost, apiDelete } from "./client";

export const createShareLink = (eventId: number) => apiPost(`/events/${eventId}/share`);
export const getSharedEvent = (token: string) => apiGet(`/share/${token}`);
export const getSharedPhotos = (token: string, page = 0, size = 20) =>
  apiGet(`/share/${token}/photos?page=${page}&size=${size}`);
export const revokeShareLink = (token: string) => apiDelete(`/share/${token}`);
```

```ts
// src/api/users.ts
import { apiGet, apiPut, apiDelete } from "./client";

export const getMyProfile = () => apiGet(`/users/profile`);
export const updateMyProfile = (fullName: string) => apiPut(`/users/profile`, { fullName });
export const deleteUser = (id: number) => apiDelete(`/users/${id}`); // cần role ADMIN theo thiết kế — xem cảnh báo 12.2
```

```ts
// src/api/admin.ts
import { apiGet } from "./client";

export const getDashboard = () => apiGet(`/admin/dashboard`);
export const getStorageOverview = () => apiGet(`/admin/storage`);
export const getStatistics = () => apiGet(`/admin/statistics`);
export const getAdminUsers = (page = 0, size = 20) => apiGet(`/admin/users?page=${page}&size=${size}`);
export const getAuditLogs = (page = 0, size = 20) => apiGet(`/admin/logs?page=${page}&size=${size}`);
```

Tải file trực tiếp (`photoDownloadUrl`, `photosDownloadZipUrl`, `eventCoverUrl`) — **không gọi qua `apiGet`**, dùng thẳng làm `href`/`src`:

```tsx
<img src={eventCoverUrl(event.id)} alt={event.name} />
<a href={photoDownloadUrl(photo.id)} download>Tải ảnh</a>
```

---

## 13. Deploy chi tiết lên Ubuntu Server (dùng đúng hạ tầng sẵn có: Tailscale/SSH, Portainer, `shared-network`, Cloudflare Tunnel)

> Phần này giả định server Ubuntu đã có Docker + Docker Compose (đã dùng cho `demo-cicd`/`mysql-shared` trước đó). Nếu là server mới hoàn toàn, làm bước 13.1; nếu đã có Docker rồi thì bỏ qua, nhảy thẳng bước 13.3.

### 13.1 Cài Docker trên Ubuntu (server mới)

```bash
sudo apt update && sudo apt upgrade -y

# Gỡ bản cũ nếu có (tránh xung đột)
sudo apt remove -y docker docker-engine docker.io containerd runc

# Cài theo repo chính thức của Docker
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Cho phép chạy docker không cần sudo
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

### 13.2 Cấu hình firewall cơ bản (nếu chưa làm)

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Vì bạn dùng Tailscale để SSH, **không cần mở thêm port 80/443 ra internet** nếu đi theo hướng Cloudflare Tunnel (mục 13.6) — đây là lý do Tunnel phù hợp với setup hiện tại của bạn hơn port-forward.

### 13.3 Tạo thư mục deploy + clone code

```bash
mkdir -p ~/apps/travel-album && cd ~/apps/travel-album
git clone https://github.com/dautruongptit/travelPhoto-API.git
git clone https://github.com/dautruongptit/PhotoTripManagement.git
```

### 13.4 Kiểm tra / tạo network `shared-network`

Network này bạn đã dùng cho `mysql-shared` trước đó — kiểm tra trước khi tạo mới để tránh trùng:

```bash
docker network ls | grep shared-network
# nếu chưa có dòng nào hiện ra:
docker network create shared-network
```

### 13.5 Cấu hình `.env` và chạy từng service

**Backend** — `~/apps/travel-album/travelPhoto-API/.env`:

```bash
cd ~/apps/travel-album/travelPhoto-API
cat > .env << 'EOF'
SPRING_PROFILES_ACTIVE=prod
SWAGGER_ENABLED=false
SERVER_PORT_HOST=8085

DB_HOST=postgres
DB_PORT=5432
DB_NAME=travel_photo
DB_USER=app_user
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

JWT_SECRET=CHANGE_ME_RANDOM_32_CHARS_MIN

APP_FRONTEND_URL=https://triptravel.thongtinchinhhieu.site
APP_COOKIE_SECURE=true

GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx

STORAGE_ROOT_PATH=/data/photo-storage
EOF

# random secret nhanh, thay vào JWT_SECRET và DB_PASSWORD ở trên
openssl rand -base64 32
```

Deploy Postgres (mục 4) trước, để Flyway migrate ngay khi backend khởi động:

```bash
# tạo file docker-compose.db.yml theo mục 4 của guide này, cùng thư mục .env ở trên
docker compose -f docker-compose.db.yml up -d
docker compose logs -f postgres   # Ctrl+C khi thấy "database system is ready to accept connections"
```

Chạy backend (đã sửa 3 lỗi ở mục 2):

```bash
docker compose up -d --build
docker compose logs -f backend    # kiểm tra Flyway migrate thành công + Tomcat started on port 8083
```

**Frontend** — `~/apps/travel-album/PhotoTripManagement/`:

```bash
cd ~/apps/travel-album/PhotoTripManagement
docker compose up -d --build      # dùng docker-compose.yml đã tạo ở mục 6, build-arg trỏ đúng domain prod
docker compose logs -f frontend
```

### 13.6 Kiểm tra nội bộ trước khi public

```bash
# backend còn sống, trả JSON thật không
curl -i http://localhost:8085/api/actuator/health

# frontend đã build đúng chưa
curl -i http://localhost:8090/

# 2 container thấy nhau qua tên service chưa (từ trong network)
docker exec -it travelPhoto-frontend wget -qO- http://backend:8083/api/actuator/health
```

Nếu bước cuối lỗi "could not resolve host" → 2 container chưa thật sự cùng network, chạy `docker network inspect shared-network` để xác nhận cả `travelPhoto-backend` và `travelPhoto-frontend` đều có mặt trong danh sách `Containers`.

### 13.7 Trỏ domain qua Cloudflare Tunnel sẵn có (không tạo tunnel mới)

Vì bạn đã có Cloudflare Tunnel chạy cho SSH/Portainer/WordPress trên domain `thongtinchinhhieu.site`, chỉ cần **thêm 1 Public Hostname mới** vào tunnel đó:

1. Vào **Cloudflare Zero Trust dashboard** → **Networks → Tunnels** → chọn tunnel đang chạy trên server này.
2. Tab **Public Hostname → Add a public hostname**:
   - Subdomain: `triptravel`
   - Domain: `thongtinchinhhieu.site`
   - Service Type: `HTTP`
   - URL: `frontend:80` (tên service, **không phải** `localhost:8090`)
3. Kiểm tra container `cloudflared` hiện có có nằm cùng `shared-network` với `frontend` không:
   ```bash
   docker inspect cloudflared --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
   ```
   Nếu `cloudflared` đang chạy ở network khác (ví dụ network riêng cho Portainer/WordPress trước đó), attach thêm vào `shared-network`:
   ```bash
   docker network connect shared-network cloudflared
   ```
   Sau đó URL ở bước 2 dùng `frontend:80` là gọi được, vì lúc này `cloudflared` đã "nhìn thấy" service `frontend` qua DNS nội bộ của `shared-network`.
4. Save — Cloudflare tự cấp SSL, domain `https://triptravel.thongtinchinhhieu.site` chạy được ngay, không cần mở port nào thêm trên Ubuntu.

### 13.8 (Tuỳ chọn) CI/CD tự động — theo đúng pattern GitHub Actions + DockerHub bạn đã dùng cho `demo-cicd`

Thay vì `git pull` + `docker compose up --build` thủ công mỗi lần sửa code, làm tương tự dự án cũ:

1. Mỗi repo (`travelPhoto-API`, `PhotoTripManagement`) thêm `.github/workflows/deploy.yml`: build image, push lên DockerHub khi push nhánh `main`.
2. Trên server, thay `build: .` trong `docker-compose.yml` bằng `image: <dockerhub-username>/travelphoto-backend:latest`.
3. Dùng GitHub Actions step SSH vào server (hoặc self-hosted runner nếu bạn đã cấu hình) chạy `docker compose pull && docker compose up -d`.

Vì bạn đã có pipeline này chạy ổn cho `demo-cicd`, chỉ cần nhân bản workflow file sang 2 repo này và đổi tên image/service.

### 13.9 Checklist deploy Ubuntu

- [ ] Docker + Docker Compose plugin đã cài, `docker compose version` chạy được không cần `sudo`
- [ ] `docker network ls` có `shared-network`
- [ ] `.env` backend: `JWT_SECRET`, `DB_PASSWORD` đã đổi khỏi giá trị mẫu, `APP_FRONTEND_URL` = domain prod thật
- [ ] Postgres chạy trước, Flyway migrate log không lỗi
- [ ] `curl http://localhost:8085/api/actuator/health` trả OK
- [ ] `docker exec` từ frontend gọi được `backend:8083` qua tên service
- [ ] Cloudflare Tunnel: Public Hostname `triptravel.thongtinchinhhieu.site` → `frontend:80`, `cloudflared` cùng `shared-network` với `frontend`
- [ ] Google Console: redirect URI + JavaScript origin đã trỏ đúng domain prod (mục 11)
- [ ] Test luồng Google Login thật trên domain prod (không phải localhost)

---

## 14. Môi trường DEV thật: Backend chạy native trong IntelliJ, Frontend chạy native qua VSCode (không dùng Docker cho dev)

> Docker chỉ dùng cho **production trên Ubuntu** (mục 13). Ở máy dev, chạy backend trực tiếp bằng IntelliJ (debug được, hot-reload nhanh hơn container) và frontend bằng `pnpm dev` trong VSCode. Chỉ **PostgreSQL** là chạy qua Docker (gọn hơn cài native lên máy).

### 14.1 Sửa lại `nginx.conf` production — bổ sung 2 route bị thiếu ở mục 6

Phát hiện ở mục 13 sửa: `/oauth2/**` và `/login/oauth2/code/**` nằm ở **root**, không có prefix `/api`. `nginx.conf` production trước đó chỉ proxy `/api/` nên bước redirect Google Login trên domain thật **sẽ lỗi 404**. Sửa lại `PhotoTripManagement/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend:8083/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Google OAuth2 — nằm ở root, KHÔNG có prefix /api
    location /oauth2/ {
        proxy_pass http://backend:8083/oauth2/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /login/oauth2/ {
        proxy_pass http://backend:8083/login/oauth2/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

(Trước đó `proxy_pass http://backend:8083/;` bị cắt `/api/` khi forward — sửa lại rõ ràng thành `proxy_pass http://backend:8083/api/;` để giữ nguyên path, tránh nhầm lẫn.)

### 14.2 Chạy PostgreSQL riêng cho dev (chỉ DB, không chạy app qua Docker)

Tạo `travelPhoto-API/docker-compose.db.dev.yml` (không dùng `shared-network` vì chỉ chạy 1 mình trên máy dev, không cần network dùng chung với container khác):

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    container_name: travelPhoto-db-dev
    restart: unless-stopped
    environment:
      POSTGRES_DB: travel_photo_dev
      POSTGRES_USER: dev_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"     # publish ra host để IntelliJ/DBeaver kết nối trực tiếp localhost:5432
    volumes:
      - pg_data_dev:/var/lib/postgresql/data

volumes:
  pg_data_dev:
```

```bash
cd travelPhoto-API
docker compose -f docker-compose.db.dev.yml up -d
```

### 14.3 Chạy Backend trong IntelliJ

1. Mở `travelPhoto-API` bằng IntelliJ (File → Open, chọn thư mục chứa `pom.xml`), để IntelliJ tự import Maven.
2. Cài plugin **EnvFile** (Settings → Plugins → tìm "EnvFile") — cho phép nạp file `.env` thẳng vào Run Configuration, đỡ phải gõ tay từng biến.
3. Tạo file `.env.dev` ở gốc project (đừng commit — thêm vào `.gitignore`):

```env
SPRING_PROFILES_ACTIVE=dev
SWAGGER_ENABLED=true
SERVER_PORT=8083

DB_HOST=localhost
DB_PORT=5432
DB_NAME=travel_photo_dev
DB_USER=dev_user
DB_PASSWORD=dev_password

JWT_SECRET=dev-only-secret-not-for-production-use-32chars
APP_FRONTEND_URL=http://localhost:8443
APP_COOKIE_SECURE=false

GOOGLE_CLIENT_ID=<client id dev — mục 11.3>
GOOGLE_CLIENT_SECRET=<client secret dev>

STORAGE_ROOT_PATH=./storage-dev
```

4. Vào **Run → Edit Configurations** → chọn (hoặc tạo mới) Application config trỏ tới main class (thường `TravelPhotoApiApplication` hoặc tương tự) → tab **EnvFile** → bật **Enable EnvFile** → **+** → chọn `.env.dev` vừa tạo.
5. Bấm **Run** (▶) hoặc **Debug** (🐞) — khuyến nghị dùng **Debug** để đặt breakpoint trong `OAuth2SuccessHandler`/`JwtAuthFilter` khi cần soi luồng login.
6. Kiểm tra log thấy `Tomcat started on port 8083` và Flyway migrate thành công (không lỗi kết nối Postgres) là chạy ổn.

> Vì `application.yml` đọc `${DB_HOST}`, `${SERVER_PORT}`... từ biến môi trường (đã cấu hình ở mục 2), **không cần file `application-dev.yml` riêng** — chỉ cần đổi `.env.dev` là chuyển được giữa các máy dev khác nhau.

### 14.4 Chạy Frontend qua VSCode

```bash
cd PhotoTripManagement
pnpm install
pnpm dev
```

Vite chạy ở `http://localhost:8443` (theo `vite.config.ts` đã sửa mục 12.4, có `proxy` trỏ `/api`, `/oauth2`, `/login/oauth2` sang `http://localhost:8083`). Mở trình duyệt vào `http://localhost:8443`, bấm nút đăng nhập Google — nhờ proxy, trình duyệt vẫn coi mọi request là cùng 1 origin (`localhost:8443`) y hệt production, cookie `refresh_token` (`SameSite=Strict`) hoạt động bình thường.

Debug FE trong VSCode: cài extension **Debugger for Chrome** (hoặc dùng sẵn nếu VSCode bản mới có tích hợp), tạo `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug FE (Vite)",
      "url": "http://localhost:8443",
      "webRoot": "${workspaceFolder}/src"
    }
  ]
}
```

### 14.5 Thứ tự khởi động dev hằng ngày

```
1. docker compose -f docker-compose.db.dev.yml up -d   (travelPhoto-API/, chỉ cần làm lại nếu đã tắt máy/container)
2. Mở travelPhoto-API trong IntelliJ → Debug (dùng .env.dev qua EnvFile plugin)
3. cd PhotoTripManagement && pnpm dev
4. Mở http://localhost:8443
```

Tắt dev: `Ctrl+C` ở terminal VSCode, Stop trong IntelliJ, `docker compose -f docker-compose.db.dev.yml down` (thêm `-v` nếu muốn xoá luôn data Postgres dev).

### 14.6 Google Console — Client dev cập nhật lại theo port 8083 (không phải 8085)

Vì giờ dev chạy native (không qua Docker port-mapping `8085:8083` như production), backend dev lắng nghe thẳng ở **8083** (không phải 8085). Cập nhật lại Client dev ở mục 11.3:

- Authorized JavaScript origins: `http://localhost:8443`
- Authorized redirect URIs: `http://localhost:8083/login/oauth2/code/google`

(Cổng 8085 chỉ tồn tại ở **production**, do `docker-compose.yml` map `SERVER_PORT_HOST:-8085` ra ngoài host — dev không đi qua lớp map cổng này nên dùng thẳng 8083.)

---

## 15. Mô tả chi tiết từng Endpoint (đọc trực tiếp toàn bộ Controller + DTO thật)

### 15.1 Envelope response chung

Mọi response (trừ endpoint trả file raw như download/cover) đều bọc trong:

```json
{
  "success": true,
  "message": "OK",
  "data": { /* nội dung thật */ },
  "errorCode": null,
  "timestamp": "2026-08-03T10:00:00"
}
```

Khi lỗi: `success: false`, `data: null`, `errorCode` có giá trị (ví dụ `"NOT_FOUND"`, `"VALIDATION_ERROR"`...).

### 15.2 Auth — `AuthController` (`/api/auth`, không có prefix riêng cho oauth2)

| Endpoint | Auth | Mô tả |
|---|---|---|
| `GET /oauth2/authorization/google` | public | Điểm bắt đầu login — redirect cả trang sang Google, **root path, không có `/api`** |
| `POST /api/auth/refresh` | cookie `refresh_token` | Đọc cookie, xoay vòng refresh token, trả `LoginResponse` |
| `POST /api/auth/logout` | Bearer token | Vô hiệu hoá refresh token hiện tại |
| `GET /api/auth/me` | Bearer token | Trả `UserResponse` của user đang đăng nhập |

**`LoginResponse`** (trả về sau `/api/auth/refresh`, và trong cookie/redirect lúc login):
```ts
{ accessToken: string; user: UserResponse }
```

**`UserResponse`**:
```ts
{
  id: number;
  email: string;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string;
  role: string;          // "USER" | "ADMIN"
  lastLoginAt: string;    // ISO datetime
  lastLoginIp: string;
}
```

### 15.3 Event — `EventController` (`/api/events`)

| Endpoint | Auth | Mô tả |
|---|---|---|
| `GET /api/events` | public | Danh sách phân trang (`Pageable`: `?page=&size=&sort=`) |
| `GET /api/events/{id}` | public | Chi tiết 1 event |
| `POST /api/events` | role `USER` hoặc `ADMIN` | Tạo event — **multipart/form-data** |
| `PUT /api/events/{id}` | role `ADMIN` **hoặc** đúng chủ sở hữu event (`@eventSecurity.isOwner`) | Sửa event — **multipart/form-data** |
| `DELETE /api/events/{id}` | role `ADMIN` hoặc chủ sở hữu | Xoá event |
| `GET /api/events/{id}/cover` | public | Trả ảnh bìa **raw** (`image/jpeg`) — dùng thẳng làm `src`, không gọi qua JSON client |

**Form fields khi `POST`/`PUT` (multipart)** — đúng tên field khớp `CreateEventRequest`/`UpdateEventRequest`:

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `name` | string, max 255 | ✅ | |
| `description` | string, max 2000 | ❌ | |
| `startDate` | `yyyy-MM-dd` | ✅ | ISO date, không phải datetime |
| `endDate` | `yyyy-MM-dd` | ❌ | |
| `location` | string, max 255 | ✅ | |
| `coverImage` | file | ❌ | **field riêng** (`@RequestParam`), không nằm trong `CreateEventRequest`, phải `form.append("coverImage", file)` |

**`EventResponse`** (trả về):
```ts
{
  id: number;
  name: string;
  description: string;
  ownerName: string;
  startDate: string;      // yyyy-MM-dd
  endDate: string;
  location: string;
  coverImageUrl: string;
  photoCount: number;
  totalSize: number;      // bytes
  createdAt: string;      // ISO datetime
}
```

> ⚠️ File `events.ts` mình đưa ở lượt trước thiếu field `coverImage` tách riêng khỏi form data chính, và interface `EventResponse` chưa khớp field thật (`ownerName`, `photoCount`, `totalSize`...) — nói ở mục 15.6 mình đính kèm bản sửa.

### 15.4 Photo — `PhotoController` (`/api/events/{eventId}/photos`, `/api/photos/*`)

| Endpoint | Auth | Mô tả |
|---|---|---|
| `POST /api/events/{eventId}/photos` | role `USER`/`ADMIN` | Upload nhiều ảnh, field **`files`** (mảng) — đúng như mình đã dùng ở `photos.ts`, không cần sửa |
| `GET /api/events/{eventId}/photos` | public | Danh sách ảnh theo event, phân trang |
| `DELETE /api/photos/{id}` | role `ADMIN` hoặc chủ sở hữu ảnh | |
| `GET /api/photos/download/{id}` | public | Trả file raw kèm header `Content-Disposition: attachment` — dùng `<a href download>`, không `fetch` |
| `POST /api/photos/download-zip?ids=1&ids=2` | public | Trả file `.zip` raw, cũng dùng trực tiếp làm link/href |

**`PhotoResponse`**:
```ts
{
  id: number;
  originalName: string;
  url: string;
  thumbnailUrl: string;
  size: number;           // bytes
  width: number;
  height: number;
  uploadedBy: string;
  uploadedTime: string;   // ISO datetime
}
```

> ⚠️ `PhotoResponse` interface mình đưa trước đó chưa khớp field thật (`fileName`/`eventId`/`uploadedAt` không tồn tại — field thật là `originalName`, `url`, `thumbnailUrl`, `uploadedBy`, `uploadedTime`). Sửa ở mục 15.6.

### 15.5 Share, User, Admin, Search

**`ShareController`**

| Endpoint | Auth | Mô tả |
|---|---|---|
| `POST /api/events/{id}/share` | role `ADMIN` hoặc chủ sở hữu event | Tạo link chia sẻ, trả `ShareLinkResponse` |
| `GET /api/share/{token}` | public | Xem thông tin event qua link chia sẻ |
| `GET /api/share/{token}/photos` | public | Danh sách ảnh qua link chia sẻ |
| `DELETE /api/share/{token}` | role `USER`/`ADMIN` (kiểm tra chủ sở hữu trong service layer) | Thu hồi link |

`ShareLinkResponse`: `{ token: string; shareUrl: string; expiredAt: string; active: boolean }`

**`UserController`**

| Endpoint | Auth | Mô tả |
|---|---|---|
| `GET /api/users/profile` | Bearer token | Hồ sơ user hiện tại |
| `PUT /api/users/profile` | Bearer token | Body JSON: `{ "fullName": "..." }` — chỉ sửa được tên, không sửa email/avatar qua endpoint này |
| `GET /api/users` | **role `ADMIN`** (đã xác nhận có `@PreAuthorize`, xem đính chính mục 12.2) | Danh sách toàn bộ user |
| `DELETE /api/users/{id}` | role `ADMIN` | Thực chất là **vô hiệu hoá** tài khoản (message trả về: `"User disabled"`), không xoá cứng dữ liệu |

**`AdminController`** — tất cả `role ADMIN`, response shape:

```ts
// GET /api/admin/dashboard
{ totalUsers, totalEvents, totalPhotos, totalStorageUsedBytes, uploadsToday, diskUsableBytes, diskTotalBytes }

// GET /api/admin/storage
{ totalUsedBytes, totalQuotaBytes, usedPercentage, topUsers: [{userId, fullName, storageUsedBytes}] }

// GET /api/admin/statistics
{ uploadsToday, uploadsByMonth: [{month, count}], topUsers: [{userId, fullName, uploadCount}] }

// GET /api/admin/users, GET /api/admin/logs — phân trang UserResponse / AuditLogResponse
```

**`SearchController`**

| Endpoint | Auth | Mô tả |
|---|---|---|
| `GET /api/events/search?keyword=` | public | |
| `GET /api/photos/search?keyword=` | public | |

### 15.6 Sửa lại `events.ts` và `photos.ts` cho khớp field response thật

Do phát hiện sai lệch ở 15.3/15.4, xem file `.ts` đính kèm bên dưới (đã cập nhật đúng `EventResponse`, `PhotoResponse`, tách field `coverImage` ra khỏi body chính khi tạo/sửa event).
