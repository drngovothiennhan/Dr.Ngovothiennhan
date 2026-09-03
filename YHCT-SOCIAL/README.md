# YHCT SOCIAL

Canonical social-network platform for the HIU Traditional Medicine academic club.

- Product: **YHCT SOCIAL**
- Canonical GitHub branch/folder: `YHCT-SOCIAL`
- Canonical Vercel project: `yhct-social`
- Current development release: **2.5.0**
- Architecture: provider-independent modular PWA + versioned REST API + PostgreSQL governance schema

## Current identity model

The club spreadsheet is normalized to 159 unique accounts:
- 1 ADMIN — Chủ nhiệm
- 2 SUPER_MOD — Phó chủ nhiệm
- 8 MOD — Ban quản lý
- 148 MEMBER — Thành viên

Initial username/password follows the requested `MSSV / MSSV` bootstrap rule. Production code treats that password only as a first-login credential: it is one-way hashed and the user must change it after first successful login.

## Verification

Run before deployment:

```bash
npm test
npm run check
node scripts/build-preview.mjs
node scripts/build-production.mjs
```

The production API reference starts with `YHCT_SESSION_SECRET` (>=32 chars):

```bash
YHCT_SESSION_SECRET='...' npm run api:start
```
