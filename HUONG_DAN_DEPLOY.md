# Hướng dẫn triển khai Sổ Tay Nhanh lên Cloudflare Workers & D1

Tài liệu này hướng dẫn từng bước để đưa ứng dụng **Sổ Tay Nhanh** lên Cloudflare Workers (miễn phí hoàn toàn trong gói Free Tier của Cloudflare), dùng Cloudflare D1 làm cơ sở dữ liệu và đăng nhập bằng Gmail.

---

## Phần 1: Lấy `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` từ Google Cloud Console

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/) và đăng nhập bằng tài khoản Google của bạn.
2. Nhấn **Select a project** (trên thanh trên cùng) → **New Project**, đặt tên dự án (ví dụ: `so-tay-nhanh`), rồi nhấn **Create**.
3. Trong menu bên trái, chọn **APIs & Services** → **OAuth consent screen** (hoặc **Google Auth Platform** → **Branding / Audience**):
   - Chọn **External** → nhấn **Create**.
   - Điền **App name** (`Sổ Tay Nhanh`), **User support email** và **Developer contact information** (email Gmail của bạn) → **Save and Continue**.
   - Ở bước **Test users** (khi app đang ở trạng thái Testing): thêm email Gmail của bạn và những người thân/đồng nghiệp được phép dùng thử (hoặc chuyển sang **Publish App** khi muốn mọi người dùng Gmail bất kỳ đều đăng nhập được).
4. Vào **APIs & Services** → **Credentials** → nhấn **+ Create Credentials** → chọn **OAuth client ID**:
   - **Application type**: chọn **Web application**.
   - **Name**: `Sổ Tay Nhanh Web`.
   - **Authorized JavaScript origins**:
     - Cho môi trường phát triển cục bộ: `http://localhost:8787` (cổng mặc định của `wrangler dev`) và `http://localhost:3000`.
     - Cho môi trường thật trên Cloudflare Workers: `https://so-tay-nhanh.<subdomain-cua-ban>.workers.dev` (hoặc tên miền riêng nếu có).
   - **Authorized redirect URIs**:
     - `http://localhost:8787/auth/callback`
     - `http://localhost:3000/auth/callback`
     - `https://so-tay-nhanh.<subdomain-cua-ban>.workers.dev/auth/callback`
5. Nhấn **Create**. Sao chép **Client ID** (`GOOGLE_CLIENT_ID`) và **Client secret** (`GOOGLE_CLIENT_SECRET`).

---

## Phần 2: Tạo Cloudflare D1 Database & Chạy Schema

Cài đặt dependencies (nếu chưa cài):

```bash
npm install
```

Đăng nhập Cloudflare CLI (`wrangler`):

```bash
npx wrangler login
```

### Bước 1: Tạo D1 Database

```bash
npx wrangler d1 create notes-db
```

Sau khi chạy xong, terminal sẽ in ra đoạn cấu hình chứa `database_id`, ví dụ:

```toml
[[d1_databases]]
binding = "DB"
database_name = "notes-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Hãy mở file `wrangler.toml` và thay `THAY_BANG_DATABASE_ID_CUA_BAN` bằng `database_id` vừa nhận được.

### Bước 2: Tạo bảng `notes`, index và bảng `sessions` bằng `schema.sql`

- Chạy trên D1 cục bộ (để test với `wrangler dev`):

```bash
npx wrangler d1 execute notes-db --local --file=schema.sql
```

- Chạy trên D1 thật (production trên Cloudflare):

```bash
npx wrangler d1 execute notes-db --remote --file=schema.sql
```

---

## Phần 3: Thiết lập biến bí mật (Secrets) trên Cloudflare

Không bao giờ lưu khóa bí mật vào `wrangler.toml` hay Git. Hãy nạp 3 biến bí mật bằng `wrangler secret put`:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```
*(Dán Client ID từ Google Cloud Console rồi nhấn Enter)*

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```
*(Dán Client Secret từ Google Cloud Console rồi nhấn Enter)*

```bash
npx wrangler secret put AUTH_SECRET
```
*(Nhập một chuỗi ngẫu nhiên dài tối thiểu 32 ký tự, ví dụ tạo nhanh bằng `openssl rand -hex 32`)*

---

## Phần 4: Chạy thử và Deploy lên Cloudflare Workers

### Chạy thử cục bộ với Wrangler + D1 Local

Tạo file `.dev.vars` (đã có trong `.gitignore`) để test `wrangler dev`:

```ini
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
AUTH_SECRET="chuoi-bi-mat-ngau-nhien-it-nhat-32-ky-tu"
```

Sau đó build frontend và chạy Worker cục bộ:

```bash
npm run build
npx wrangler dev
```

### Deploy chính thức lên Cloudflare

```bash
npx wrangler deploy
```

*(File `wrangler.toml` đã cấu hình sẵn `[build] command = "npm run build"`, nên khi chạy `npx wrangler deploy` hoặc khi Cloudflare Workers Builds tự động deploy từ Git, thư mục `./dist` sẽ được build trước khi tải lên.)*

Nếu bạn cấu hình **Workers Builds** (kết nối GitHub/GitLab trên Cloudflare Dashboard):
- **Build command**: `npm run build` (hoặc để trống vì `wrangler.toml` đã tự chạy)
- **Deploy command**: `npx wrangler deploy`

Sau khi deploy thành công, Wrangler sẽ trả về URL dạng `https://so-tay-nhanh.<tai-khoan>.workers.dev`. Hãy nhớ quay lại Google Cloud Console kiểm tra **Authorized JavaScript origins** và **Authorized redirect URIs** đã khớp URL này chưa (kèm `/auth/callback`).

