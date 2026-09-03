# YHCT SOCIAL v2.5 — Auth & Governance Hardening

MSSV remains the initial username and initial password as requested, but only as a bootstrap credential. Production authentication never persists plaintext passwords and requires password change after the first successful login.

- ADMIN — Chủ nhiệm: exclusive Admin Control Center, theme, role, backup and restore.
- SUPER_MOD — Phó chủ nhiệm: moderation, escalation and member support; no Admin Control Center/theme.
- MOD — Ban quản lý: moderation queue; no escalation/admin/theme.
- MEMBER — standard social functions.

Credentials are one-way salted hashes. Signed expiring session tokens protect API routes. Role checks run server-side. Ordinary directory responses omit MSSV/faculty for other users; ADMIN may retrieve management fields.
