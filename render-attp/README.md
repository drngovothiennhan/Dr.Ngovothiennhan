# Sổ ATTP trường học — Render Free port

Branch này tách riêng khỏi main để không ảnh hưởng hồ sơ GitHub.

## Kiến trúc
- Render Static Site: giao diện/PWA.
- OCR: Tesseract.js chạy trên thiết bị, không dùng credit hosting.
- Dữ liệu thao tác: localStorage, có hàng chờ đồng bộ.
- Google Sheets: Apps Script Web App; dòng CẦN DÒ LẠI vẫn được ghi, không bị chặn.
- Google Sheet đích: https://docs.google.com/spreadsheets/d/1BcRDGO9oTiPeGFxHe7oYspvYaQKR0dxnjBPZlqZzgAI/edit

## Render
Build command: echo "static"
Publish path: render-attp

## Google Sheets bridge
Mở mục Cài đặt trong app để lấy mã Apps Script và hướng dẫn triển khai một lần.

## Lưu ý độ chính xác
OCR không được tuyên bố >95% nếu chưa benchmark trên tập ảnh thật. App gắn cờ các kết quả dưới 95% và cho phép người dùng rà lại trước khi sử dụng.
