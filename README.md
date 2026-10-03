# App Y tế VK — V3 (Cloudflare)

- `public/` giao diện (tĩnh) · `worker/index.js` API + đăng nhập + sao lưu · D1 `yte-vk` (dữ liệu) · R2 `yte-vk-files` (ảnh/chứng từ)
- Đăng nhập bằng tên đăng nhập + mật khẩu (PBKDF2), tối đa ~10 tài khoản, Admin tạo/khóa/đặt lại mật khẩu trong tab Quản trị.
- Sao lưu: Worker tự chép D1 → R2 mỗi đêm (giữ 30 bản); `apps-script/Sync.gs` chép sang Google Sheets và gửi email nhắc.
- Triển khai: Cloudflare ▸ Workers & Pages ▸ Import repository (nhánh này). Lệnh deploy mặc định `npx wrangler deploy`.
- Kiểm thử: `node --no-warnings tests/worker.test.mjs`, `node tests/attp-core.test.js`; E2E: chạy `tests/e2e-server.mjs` rồi `tests/e2e.cjs`.
- Không đưa mật khẩu/khóa vào repo. Khóa đồng bộ nằm trong bảng `settings` của D1 và Script Properties của Apps Script.
