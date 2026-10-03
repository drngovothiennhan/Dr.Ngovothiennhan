# App Y tế VK V2 — Apps Script Bridge

Mục tiêu: user thường không cần quyền Writer trực tiếp vào Master Sheet. Bridge chạy bằng quyền chủ sở hữu và kiểm tra OAuth access token + bảng Users trước từng request.

## Triển khai
1. Tạo một Google Apps Script project trong tài khoản sở hữu Master.
2. Dán `Code.gs` từ thư mục này.
3. Deploy → New deployment → Web app.
4. Execute as: Me (chủ sở hữu).
5. Chọn mức truy cập phù hợp với Google account/Workspace. Mỗi request vẫn bị Bridge kiểm tra access token và Users.
6. Sao chép URL `https://script.google.com/macros/s/.../exec`.
7. Trong App Y tế VK V2 → ⚙ Google → nhập URL vào **Bridge Web App URL**.
8. Kiểm tra đăng nhập, đọc Dashboard và tạo một bản ghi thử.
9. Sau khi xác nhận Bridge ổn định, gỡ quyền Writer trực tiếp của NVYT/ATTP khỏi Master; chỉ giữ Admin sở hữu/chỉnh trực tiếp.

## Quyền
- ADMIN: mọi bảng.
- NVYT: hồ sơ học sinh, enrollment, KSK, tiêm, thuốc, sơ cứu, bệnh, documents/tasks.
- ATTP: B1/B2/B3, lưu mẫu, MealSessions, kho, documents/tasks.
- VIEWER: chỉ đọc.

Bridge không nhận Client Secret và không lưu access token. Token ngắn hạn chỉ dùng để xác thực request hiện tại.


## Kết nối Vành Khuyên v2

Bridge V2.3 có thêm hai action server-to-server:

- `portalSnapshot`: trả về dữ liệu tối thiểu từ `PortalProjection`.
- `portalAttendancePush`: ghi điểm danh/nghỉ bệnh từ Vành Khuyên về `Attendance`.

Không lưu khóa tích hợp trong GitHub. Sau khi deploy Apps Script:

1. Apps Script → Project Settings → Script properties.
2. Tạo `PORTAL_INTEGRATION_KEY` bằng một chuỗi ngẫu nhiên dài.
3. Cùng giá trị đó phải được đặt ở biến môi trường backend của Vành Khuyên v2.
4. Backend Vành Khuyên gọi Web App URL với `action`, `integration_key`, và `payload`.
5. Không gọi bridge bằng khóa này từ JavaScript phía trình duyệt phụ huynh.

Dữ liệu portal chỉ gồm định danh nghiệp vụ tối thiểu, lớp và chỉ số sức khỏe đã duyệt. Không đưa toa thuốc, bệnh sử chi tiết, chứng từ hay dữ liệu ATTP sang cổng phụ huynh.
