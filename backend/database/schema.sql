-- ═══════════════════════════════════════════════════════════
--  VendorBridge Database Schema
--  PostgreSQL
-- ═══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── users ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       VARCHAR(255)        NOT NULL,
  company_name    VARCHAR(255)        NOT NULL,
  email           VARCHAR(255)        NOT NULL UNIQUE,
  password_hash   VARCHAR(255),                          -- nullable for Google-only accounts
  role            VARCHAR(50)         NOT NULL DEFAULT 'procurement_officer'
                  CHECK (role IN ('admin','procurement_officer','manager','vendor')),
  is_verified     BOOLEAN             NOT NULL DEFAULT FALSE,
  google_id       VARCHAR(255)        UNIQUE,
  auth_provider   VARCHAR(20)         NOT NULL DEFAULT 'local'
                  CHECK (auth_provider IN ('local','google')),
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- ─── email_verifications ───────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── password_resets ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id   ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users(role);

CREATE INDEX IF NOT EXISTS idx_email_verif_user  ON email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verif_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verif_exp   ON email_verifications(expires_at);

CREATE INDEX IF NOT EXISTS idx_pw_reset_user     ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_token    ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_pw_reset_exp      ON password_resets(expires_at);

-- ─── Auto-update updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Seed admin account (update credentials before use) ───
-- INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, auth_provider)
-- VALUES (
--   'Super Admin',
--   'VendorBridge',
--   'admin@vendorbridge.com',
--   '$2b$12$HASH_GENERATED_BY_BCRYPT',   -- bcrypt hash of your chosen password
--   'admin',
--   TRUE,
--   'local'
-- );
