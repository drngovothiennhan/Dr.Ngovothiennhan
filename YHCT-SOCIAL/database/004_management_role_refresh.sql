-- YHCT SOCIAL v2.6 management authority refresh.
-- Source authority: DS CLB YHCT.xlsx. Idempotent; no user deletion or password mutation.
BEGIN;

UPDATE users SET role='ADMIN', updated_at=now() WHERE mssv='2413120084'; -- Chủ nhiệm
UPDATE users SET role='SUPER_MOD', updated_at=now() WHERE mssv='2213120022'; -- Phó Chủ nhiệm
UPDATE users SET role='SUPER_MOD', updated_at=now() WHERE mssv='2413120089'; -- Phó Chủ nhiệm

UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2413120092'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2213120019'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2413120063'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2413120055'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2413120099'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2413120072'; -- Ban quản lý
UPDATE users SET role='MOD', updated_at=now() WHERE mssv='2513120049'; -- Ban quản lý

-- Explicit demotions from the superseded directory. This prevents stale privileged roles.
UPDATE users SET role='MEMBER', updated_at=now() WHERE mssv='2513060068';
UPDATE users SET role='MEMBER', updated_at=now() WHERE mssv='2413120079';
UPDATE users SET role='MEMBER', updated_at=now() WHERE mssv='2413120004';

-- Active sessions must never keep a stronger role than current directory authority.
UPDATE auth_sessions s
SET revoked_at=COALESCE(revoked_at,now())
FROM users u
WHERE s.user_id=u.id
  AND s.revoked_at IS NULL
  AND s.role<>u.role;

COMMIT;
