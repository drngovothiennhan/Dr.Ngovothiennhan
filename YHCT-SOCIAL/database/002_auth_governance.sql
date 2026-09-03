-- YHCT SOCIAL v2.5 auth/governance baseline. Portable PostgreSQL; no provider auth helper.
BEGIN;
DO $$ BEGIN
  ALTER TYPE yhct_role ADD VALUE IF NOT EXISTS 'SUPER_MOD';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS auth_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mssv text NOT NULL UNIQUE,
  password_hash text,
  password_salt text,
  password_algorithm text NOT NULL DEFAULT 'scrypt',
  password_cost integer NOT NULL DEFAULT 16384 CHECK (password_cost >= 1024),
  must_change_password boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest text NOT NULL UNIQUE,
  role yhct_role NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  client_label text,
  CHECK (expires_at > issued_at)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS ui_theme_config (
  id text PRIMARY KEY DEFAULT 'global',
  primary_color text NOT NULL DEFAULT '#2d6045',
  secondary_color text NOT NULL DEFAULT '#b85f3f',
  background_color text NOT NULL DEFAULT '#e9efe4',
  border_color text NOT NULL DEFAULT '#315943',
  radius_px integer NOT NULL DEFAULT 18 CHECK (radius_px BETWEEN 8 AND 30),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_queue (
  id uuid PRIMARY KEY,
  object_type text NOT NULL CHECK (object_type IN ('post','comment','profile','message-report')),
  object_id uuid NOT NULL,
  reason text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','resolved','dismissed','escalated')),
  assigned_to uuid REFERENCES users(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON moderation_queue(status, risk_level, created_at);
COMMIT;
