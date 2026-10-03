# App Y tế VK V2.4 — Apps Script Bridge (miễn phí)

Bridge chạy bằng quyền chủ sở hữu Master Sheet, kiểm tra OAuth token + bảng Users trước mỗi request.
Dùng Bridge thì nhân viên **không cần Picker API key** và không cần quyền Writer trực tiếp vào Master.

## Triển khai (làm một lần, ~5 phút, đăng nhập đúng tài khoản chủ Master)
1. Mở https://script.google.com/home/projects/create — đặt tên `App Y te VK Bridge`.
2. Xóa nội dung mặc định, dán toàn bộ file `apps-script/Code.gs` (V2.4.0).
3. Deploy → New deployment → Web app → *Execute as*: **Me**, *Who has access*: **Anyone**
   (an toàn vì mỗi request vẫn bị kiểm tra Google access token và bảng Users) → Deploy → cấp quyền.
4. Sao chép URL dạng `https://script.google.com/macros/s/.../exec`.
5. Gửi URL đó cho Claude (hoặc dán vào `DEFAULT_BRIDGE_URL` trong `google-sheets-connector.js`) để mọi thiết bị dùng ngay.
6. Trong trình soạn Apps Script chọn hàm **setupTriggers** → Run (một lần). Bật nhắc việc 10:30 và 15:00, kiểm tra hệ thống 06:30 (giờ VN, ngày đi học).

## Phân quyền
- Admin mặc định: 2 email trong `ADMIN_FALLBACK` (đổi bằng Script Property `ADMIN_EMAILS`, cách nhau dấu phẩy).
- Nhân viên khác: Admin thêm email vào tab **Users** (Role `NVYT` hoặc `ATTP`, Status `ACTIVE`).
- Email không có trong Users: **bị từ chối** (không còn quyền mặc định).
- ADMIN: mọi bảng · NVYT: hồ sơ y tế + toàn bộ kiểm thực ATTP · ATTP: B1/B2/B3, lưu mẫu, kho · VIEWER: chỉ đọc.

## Cập nhật Bridge sau này
Dán lại `Code.gs` → Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL giữ nguyên).

## Chi phí
0 đồng: GitHub Pages + Apps Script + Google Sheets/Drive + Tesseract chạy ngay trên máy người dùng. Giới hạn miễn phí
(≈100 email/ngày, 6 giờ chạy script/ngày) rất rộng so với nhu cầu của một trường.

## Kết nối Vành Khuyên v2
Giữ nguyên: Script Properties → `PORTAL_INTEGRATION_KEY` = chuỗi ngẫu nhiên dài; backend Vành Khuyên gọi `portalSnapshot` / `portalAttendancePush`.
Không gọi bằng khóa này từ JavaScript trình duyệt.
