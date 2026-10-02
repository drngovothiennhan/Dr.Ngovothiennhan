# App Y tế VK — Production baseline

Ngày chốt: 2026-10-02
Cập nhật trạng thái: 2026-10-02 23:48 (UTC+7)

## Trạng thái
- Frontend: GitHub Pages, nhánh gh-pages.
- OAuth: Google Identity Services.
- Quyền Google production: openid + email + profile + drive.file.
- Google Picker: dùng để người dùng chọn đúng Master Sheet.
- Master Sheet: `App Y tế VK - MASTER PRODUCTION`.
- Dữ liệu demo: tách khỏi production và chuyển vào thư mục Backup.
- Login gate: bắt buộc đăng nhập Google trước khi xem dữ liệu.
- RBAC: bảng Users với role ADMIN / NVYT / ATTP / VIEWER.
- AuditLog: ghi nhận đăng nhập và thao tác ghi.
- Privacy / Terms: public trên GitHub Pages.
- Múi giờ Master Sheet: Asia/Ho_Chi_Minh (Google hiển thị tương đương Asia/Saigon).
- Thư mục gốc Drive đã dọn sạch thư mục trùng; chỉ còn 5 thư mục production chuẩn.

## Google Drive
- App Y tế VK
  - 01_Dữ liệu — chứa `App Y tế VK - MASTER PRODUCTION`
  - 02_Tài liệu & chứng từ
  - 03_Nhập liệu
  - 04_Backup — chứa bản demo archive và 4 thư mục trùng rỗng đã chuyển ra khỏi thư mục gốc
  - 05_Cấu hình — chứa hướng dẫn cấu hình Google

## Bảo mật
- Không dùng spreadsheets scope rộng ở production.
- Không commit Client Secret, access token, refresh token hoặc service-account key.
- Users và Config trong Master Sheet đã có chế độ bảo vệ trang tính.
- Repo GitHub không chứa hồ sơ học sinh thật.
- Dữ liệu nguồn nhập qua Preview → Mapping → Xác nhận → Master Sheet.

## Việc cấu hình Google còn lại
Đây là phần duy nhất còn phụ thuộc thao tác trong Google Cloud Console:
1. Enable Google Picker API.
2. Tạo API key.
3. Hạn chế Website: `https://drngovothiennhan.github.io/*` và `https://docs.google.com/*`.
4. Hạn chế API: Google Picker API và Google Drive API.
5. Lưu key trong màn hình ⚙ Google của app.
6. Đăng nhập và chọn `App Y tế VK - MASTER PRODUCTION`.
7. Khi sẵn sàng phát hành rộng, chuyển OAuth Audience từ Testing sang In production trong Google Auth Platform.

## Bước tiếp theo
Nhập danh sách học sinh do chủ dự án cung cấp vào staging, chỉ ghi Master Sheet sau khi preview và mapping được duyệt.
