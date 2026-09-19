# Sổ ATTP trường học — Google Apps Script

Mục tiêu: bỏ Render/Vercel/AppDeploy khỏi luồng vận hành hằng ngày.

## Kiến trúc
Điện thoại → Google Apps Script Web App → Gemini 3.8 Flash → Google Sheets
                                      ↘ Zalo OA (nếu cấu hình)

## File
- Code.gs: backend, Gemini OCR, Google Sheets, báo cáo, trigger Zalo.
- Index.html: giao diện mobile.
- appsscript.json: manifest.

## Google Sheet đang dùng
https://docs.google.com/spreadsheets/d/1BcRDGO9oTiPeGFxHe7oYspvYaQKR0dxnjBPZlqZzgAI/edit

## Cài lần đầu
1. Mở https://script.google.com → New project.
2. Tạo file Code.gs và Index.html, dán nội dung tương ứng từ thư mục này.
3. Project Settings → bật "Show appsscript.json manifest file" nếu muốn dùng manifest này.
4. Script Properties:
   - GEMINI_API_KEY = key Google AI Studio.
   - GEMINI_MODEL = gemini-3.8-flash (không bắt buộc; code đã mặc định).
   - ZALO_ACCESS_TOKEN = token OA (chỉ khi dùng Zalo).
5. Deploy → New deployment → Web app.
   - Execute as: Me.
   - Who has access: mức phù hợp với tài khoản/trường.
6. Cấp quyền lần đầu và mở URL Web App.

## Nguyên tắc dữ liệu
- Không tuyên bố độ chính xác OCR >95% nếu chưa benchmark.
- Dòng dưới 95% vẫn ghi vào Google Sheet nhưng trạng thái = CẦN DÒ LẠI.
- Không tự suy đoán HSD, giờ nhập, kiểm dịch, cảm quan hoặc số lô khi ảnh không có.
- Hóa đơn nhiều dòng: mỗi mặt hàng trở thành một dòng Bước 1.

## Ghi chú Zalo
Endpoint OA không được hard-code. Cấu hình endpoint trong giao diện Cài đặt và token trong Script Properties để dễ thay đổi theo phiên bản OpenAPI.
