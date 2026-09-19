# Sổ ATTP Trường học — GitHub Pages + Neon

Kiến trúc v2:

- GitHub Pages: static PWA frontend
- Neon Function `attpapi`: authentication bridge, API, OCR persistence, reports
- Neon Auth: identity source, server-side token exchange
- Neon Postgres: operational data
- Neon Object Storage: private source images
- OCR local (Tesseract.js): primary
- AI cloud: fallback only when local OCR cannot structure the document

## Security / reliability rules

- No signup from the app.
- Only `admin@attp.local` with admin role can use protected APIs.
- Frontend stores only short-lived JWT + opaque refresh handle in `sessionStorage`.
- OCR images must be persisted to private Storage before a record may be saved.
- SHA-256 + idempotency are used for OCR jobs.
- Local OCR can never auto-confirm; it stays `CẦN DÒ LẠI`.
- Invoice writes are idempotent and atomic at the SQL statement level.
- GitHub Pages is immutable static frontend; backend deploys independently through Neon Functions.

## Production branch

`so-attp-github-pages-v2`

## Frontend folder

`apps/so-attp-github/`

## Backend source

`apps/so-attp-github/backend/attpapi.mjs`
