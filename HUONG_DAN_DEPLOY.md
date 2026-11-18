# Hướng dẫn triển khai Sổ Tay Nhanh lên Cloudflare Workers & D1 (Firebase Auth)

Ứng dụng sử dụng **Firebase Auth (Đăng nhập bằng Gmail)** ở giao diện kết hợp xác thực **Firebase ID Token** phía **Cloudflare Workers** và lưu trữ dữ liệu ghi chú trong **Cloudflare D1**.

---

## Phần 1: Cấu hình tên ứng dụng & tên miền trong Firebase Console

1. Truy cập [Firebase Console](https://console.firebase.google.com/) và mở dự án **`fast-tribute-0c62s`**.
2. **Đặt tên hiển thị cho ứng dụng**:
   - Nhấn biểu tượng bánh răng **Project settings** → tab **General** → đặt **Public-facing name** (ví dụ: `Sổ Tay Nhanh`) để hiển thị tên đẹp trên cửa sổ đăng nhập Gmail.
   - *(Lưu ý: Phương thức đăng nhập **Google** đã được kích hoạt sẵn cho dự án này).*
3. **Thêm tên miền Cloudflare Workers vào Authorized domains (BẮT BUỘC sau khi deploy)**:
   - Vào **Authentication** → tab **Settings** → **Authorized domains**.
   - Nhấn **Add domain** và thêm tên miền Worker của bạn, ví dụ:
     ```text
     ghichucanhancloudflared1.<subdomain-cua-ban>.workers.dev
     ```
   - Nhấn **Add**. *(Không có bước này, khi bấm "Đăng nhập bằng Gmail" trên trang `.workers.dev` sẽ báo lỗi `auth/unauthorized-domain`).*

---

## Phần 2: Chạy Schema trên Cloudflare D1 (`notes-db`)

Database `notes-db` đã được khai báo trong `wrangler.toml`. Hãy đảm bảo bảng `notes`, index và bảng `sessions` đã được tạo trên D1:

- **Qua Cloudflare Dashboard** (không cần CLI):
  Vào **Storage & Databases** → **D1 SQL Database** → chọn `notes-db` → tab **Console** → dán toàn bộ nội dung `schema.sql` và nhấn **Execute**.
- **Hoặc qua CLI**:
  ```bash
  npx wrangler d1 execute notes-db --remote --file=schema.sql
  ```

---

## Phần 3: Đặt `AUTH_SECRET` (khuyến nghị)

Thiết lập chuỗi bí mật để ký khóa phiên đăng nhập trong D1:

```bash
npx wrangler secret put AUTH_SECRET
```
*(Hoặc thêm trong Cloudflare Dashboard → Worker `ghichucanhancloudflared1` → **Settings** → **Variables and Secrets** → type **Secret**).*

---

## Phần 4: Deploy lên Cloudflare Workers

- Nếu kết nối Git (**Workers Builds**): chỉ cần push code lên Git, Cloudflare sẽ tự chạy `npx wrangler deploy` (và `wrangler.toml` tự gọi `npm run build`).
- Nếu deploy từ máy cá nhân:
  ```bash
  npx wrangler deploy
  ```
Sau khi deploy xong, nhớ quay lại **Phần 1 - Bước 3** thêm domain `.workers.dev` vào **Authorized domains** trong Firebase Console.
