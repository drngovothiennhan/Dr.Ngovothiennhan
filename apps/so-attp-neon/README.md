# Sổ ATTP Trường học — Neon rebuild

Kiến trúc độc lập AppDeploy:

- **Frontend:** static HTML/CSS/JS trên Render Static Site.
- **API/OCR:** Node.js trên Render Web Service.
- **Database:** Neon Postgres, database `attp`, branch `so-attp-truong-hoc-prod`.
- **Ảnh chứng từ:** Neon Object Storage, private bucket `attp-documents`.
- **OCR/AI:** Google Gemini hai lượt; lượt 1 chép bảng, lượt 2 trích cấu trúc. Confidence >=95 chỉ khi code đối chiếu được số lượng đúng cột trong transcript chuẩn hóa.
- **Google Sheets:** chỉ là lớp đồng bộ/xuất báo cáo về sau; không phải database chính.

## Runtime env (server)

`DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `ATTP_BUCKET`, `GEMINI_API_KEY`, `GEMINI_OCR_MODEL`, `GEMINI_VERIFY_MODEL`, `CORS_ORIGINS`.

Không commit khóa bí mật vào GitHub.
