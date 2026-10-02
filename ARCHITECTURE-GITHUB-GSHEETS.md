# School Health Assistant — GitHub Pages + Google Sheets

## Kiến trúc đã chốt

- Frontend/PWA: GitHub Pages
- Data store giai đoạn đầu: Google Sheets
- Xác thực: Google Identity Services OAuth 2.0
- Đọc/ghi: Google Sheets API trực tiếp từ trình duyệt sau khi người dùng đăng nhập Google
- File chứng từ/toa thuốc/ảnh: Google Drive, chỉ lưu file ID trong Sheet
- Audit: tab `AuditLog`
- Không dùng Netlify
- Không dùng AppDeploy
- Không chứa service-account key, refresh token, access token hoặc dữ liệu y tế thật trong GitHub.

## Nguyên tắc bảo mật

Repo GitHub có thể public nhưng chỉ chứa code. Spreadsheet và Drive giữ private. OAuth Client ID không phải secret; access token chỉ tồn tại trong phiên trình duyệt và không commit. Các thao tác ghi phải tạo audit record.

## Master Sheet schema

Students, HealthScreenings, Immunizations, MedicationOrders, MedicationAdministrations, Incidents, DiseaseSurveillance, FoodB1, FoodB2, FoodB3, FoodSamples, Inventory, Documents, Tasks, AuditLog, Config.

## Đấu nối nguồn cũ

Các file nguồn hiện có không bị ghi đè. Quy trình: Source -> Preview/Mapping -> Xác nhận -> Master Sheet -> AuditLog.

## Một lần cấu hình còn lại

Google Cloud cần bật Google Sheets API + Google Drive API và tạo OAuth Web Client cho domain GitHub Pages. Sau khi có Client ID, nhập Client ID và Spreadsheet ID vào trang Dữ liệu & kết nối. Không cần Client Secret trong frontend.
