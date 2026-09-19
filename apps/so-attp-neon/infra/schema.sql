CREATE TABLE IF NOT EXISTS ocr_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text UNIQUE,
  kind text NOT NULL CHECK (kind IN ('1a','1b','2','3','sample')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','review','completed','failed')),
  image_key text,
  image_sha256 text,
  provider text,
  model text,
  raw_text text,
  passes integer NOT NULL DEFAULT 0 CHECK (passes >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS ocr_line_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocr_job_id bigint NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  code text,
  name text NOT NULL,
  unit text,
  quantity text,
  expiry date,
  confidence numeric(5,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100),
  kind_suggestion text NOT NULL DEFAULT 'review' CHECK (kind_suggestion IN ('1a','1b','review')),
  column_verified boolean NOT NULL DEFAULT false,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (ocr_job_id, line_no)
);

CREATE TABLE IF NOT EXISTS records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id text UNIQUE,
  kind text NOT NULL CHECK (kind IN ('1a','1b','2','3','sample')),
  status text NOT NULL CHECK (status IN ('CẦN DÒ LẠI','ĐÃ XÁC MINH')),
  source text,
  item_code text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  markers jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_text text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_image_key text,
  ocr_job_id bigint REFERENCES ocr_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menus (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id text UNIQUE,
  menu_date date NOT NULL,
  meal text NOT NULL,
  dish text NOT NULL,
  servings numeric,
  ingredients text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id text UNIQUE,
  name text NOT NULL,
  group_name text,
  received date,
  expiry date NOT NULL,
  lot text,
  supplier text,
  opening_qty numeric NOT NULL DEFAULT 0,
  in_qty numeric NOT NULL DEFAULT 0 CHECK (in_qty >= 0),
  out_qty numeric NOT NULL DEFAULT 0 CHECK (out_qty >= 0),
  sample_qty numeric NOT NULL DEFAULT 0 CHECK (sample_qty >= 0),
  unit text,
  location text,
  storage text,
  balance numeric GENERATED ALWAYS AS (opening_qty + in_qty - out_qty - sample_qty) STORED,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id text UNIQUE,
  report_date date,
  period text CHECK (period IS NULL OR period IN ('today','week','month')),
  start_date date,
  end_date date,
  report_text text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_sent boolean NOT NULL DEFAULT false,
  send_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  google_sheet_id text,
  google_sheet_url text,
  google_script_url text,
  report_hour smallint CHECK (report_hour BETWEEN 0 AND 23),
  zalo_recipients text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  destination text NOT NULL CHECK (destination IN ('google_sheets','zalo')),
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_kind_status ON records(kind, status);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_created ON ocr_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_line_items_job ON ocr_line_items(ocr_job_id, line_no);
CREATE INDEX IF NOT EXISTS idx_menus_date_meal ON menus(menu_date, meal);
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory(expiry);
CREATE INDEX IF NOT EXISTS idx_inventory_name_received ON inventory(name, received DESC);
CREATE INDEX IF NOT EXISTS idx_reports_period_date ON reports(period, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, next_retry_at, created_at);
