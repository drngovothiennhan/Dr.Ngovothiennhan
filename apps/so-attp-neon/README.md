# Sổ ATTP Trường học — GitHub + Neon rebuild

Runtime chính thức của branch này **không dùng AppDeploy, Render hay Vercel**.

## Kiến trúc

- **Source:** GitHub branch `so-attp-neon-rebuild`
- **Web:** Neon Function `attpweb` — phục vụ frontend tĩnh từ GitHub source và proxy same-origin `/api/*`
- **API/OCR:** Neon Function `attpapi`
- **Database:** Neon Postgres, database `attp`, branch `so-attp-truong-hoc-prod`
- **Ảnh chứng từ:** Neon Object Storage, private bucket `attp-documents`
- **Đăng nhập:** Neon Auth (Better Auth), JWT EdDSA
- **AI/OCR:** Neon AI Gateway khi model khả dụng; OCR 2 lượt và fail-closed
- **Google Sheets:** chỉ là lớp đồng bộ/xuất báo cáo về sau, không phải database chính

## OCR policy

1. Ảnh frontend được giảm tối đa khoảng 1600 px / 2 MP.
2. Lượt 1 chép bảng theo cấu trúc: `STT | Mã | Tên hàng | ĐVT | Số lượng | Đơn giá | Thành tiền`.
3. Lượt 2 trích dữ liệu có cấu trúc.
4. Confidence >=95 chỉ khi code tự đối chiếu được tên hàng và **Số lượng nằm đúng cột Số lượng**.
5. Nếu bằng chứng không đủ, bản ghi giữ `CẦN DÒ LẠI`; không tự nâng confidence.

## GitHub Pages

Workflow Pages được giữ ở chế độ **manual-only**. Repository hiện chưa bật Pages trong Settings, nên runtime chính là `attpweb`. Khi Pages được bật sau này có thể chạy workflow thủ công mà không đổi backend.

## Không commit secret

Không đưa connection string, storage credential hay AI key vào GitHub. Neon Functions dùng biến môi trường/injected credentials của branch.
