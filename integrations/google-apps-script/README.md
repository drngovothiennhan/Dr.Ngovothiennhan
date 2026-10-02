# Google Sheets bridge

Kiến trúc đã chốt:

GitHub Pages -> Google Apps Script Web App -> Google Sheets

Không dùng Netlify.

## Mục tiêu
- Google Sheets là lớp dữ liệu vận hành cho giai đoạn đầu.
- GitHub Pages không giữ khóa API hay dữ liệu sức khỏe thật.
- Apps Script là cầu nối Google-side, kiểm tra tài khoản Google được phép trước khi trả dữ liệu.
- Ghi dữ liệu mặc định TẮT.
- Mọi thao tác ghi nhạy cảm phải gửi confirmed=true và ALLOW_WRITES phải được bật thủ công.

## Triển khai
1. Tạo Apps Script project.
2. Dán Code.gs.
3. Trong Script Properties thêm SPREADSHEET_ID trỏ tới Sheet của dự án.
4. Trong tab Config điền ALLOWED_EMAILS.
5. Deploy Web App với quyền phù hợp cho nhóm người dùng. Với dữ liệu sức khỏe thật, không deploy công khai ẩn danh.
6. Giữ ALLOW_WRITES=FALSE trong giai đoạn đọc/kiểm thử.
7. Khi kiểm thử quyền hoàn tất mới bật TRUE.

Không commit credential, token hoặc dữ liệu thật lên GitHub.
