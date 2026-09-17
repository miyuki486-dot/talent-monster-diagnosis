PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diagnoses (
  id TEXT PRIMARY KEY,
  receipt_code_hash TEXT NOT NULL UNIQUE,
  respondent_type TEXT NOT NULL CHECK (respondent_type IN ('adult', 'child')),
  guardian_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (guardian_confirmed IN (0, 1)),
  gender_choice TEXT NOT NULL CHECK (gender_choice IN ('boy', 'girl', 'other', 'legacy')),
  monster_variant TEXT NOT NULL CHECK (monster_variant IN ('male', 'female')),
  zodiac TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  result_type TEXT NOT NULL,
  ranking_json TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  receipt_expires_at INTEGER NOT NULL,
  result_expires_at INTEGER NOT NULL,
  purge_at INTEGER NOT NULL,
  line_user_hash TEXT,
  claimed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_purge_at ON diagnoses (purge_at);
CREATE INDEX IF NOT EXISTS idx_diagnoses_receipt_expires_at ON diagnoses (receipt_expires_at);

CREATE TABLE IF NOT EXISTS result_tokens (
  token_hash TEXT PRIMARY KEY,
  diagnosis_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_result_tokens_diagnosis_id ON result_tokens (diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_result_tokens_expires_at ON result_tokens (expires_at);

-- 自由回答、受取コード、LINEユーザーIDを含まない長期分析用データです。
CREATE TABLE IF NOT EXISTS analytics_diagnoses (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  respondent_type TEXT NOT NULL,
  zodiac TEXT NOT NULL,
  choice_answers_json TEXT NOT NULL,
  result_type TEXT NOT NULL,
  top_types_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_diagnoses (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_result_type ON analytics_diagnoses (result_type);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events (received_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (rate_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start);
