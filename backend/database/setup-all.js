/**
 * VendorBridge — Complete Database Setup + Admin Seed
 * Run: node database/setup-all.js
 *
 * This script:
 * 1. Creates all tables (users, vendors, rfqs, quotations, approvals, POs, invoices, etc.)
 * 2. Creates admin test user
 * 3. Creates sample users for each role
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : { host: process.env.DB_HOST||'localhost', port: parseInt(process.env.DB_PORT)||5432, database: process.env.DB_NAME||'vendorbridge', user: process.env.DB_USER||'postgres', password: process.env.DB_PASSWORD||'' }
);

const SCHEMA = `
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       VARCHAR(255)  NOT NULL,
  company_name    VARCHAR(255)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255),
  role            VARCHAR(50)   NOT NULL DEFAULT 'procurement_officer'
                  CHECK (role IN ('admin','procurement_officer','manager','vendor')),
  is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  status          VARCHAR(20)   NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','suspended')),
  google_id       VARCHAR(255)  UNIQUE,
  firebase_uid    VARCHAR(255)  UNIQUE,
  auth_provider   VARCHAR(20)   NOT NULL DEFAULT 'local'
                  CHECK (auth_provider IN ('local','google','firebase')),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── email_verifications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── password_resets ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(512) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── vendors ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_name     VARCHAR(255) NOT NULL,
  company_name    VARCHAR(255) NOT NULL,
  gst_number      VARCHAR(50),
  contact_person  VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  phone           VARCHAR(30),
  address         TEXT,
  category        VARCHAR(100),
  status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── rfqs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfqs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title               VARCHAR(500) NOT NULL,
  description         TEXT,
  product_category    VARCHAR(150),
  quantity            NUMERIC(15,2),
  expected_budget     NUMERIC(15,2),
  delivery_location   VARCHAR(500),
  deadline            TIMESTAMPTZ,
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  preferred_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  status              VARCHAR(30)  NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','quotation_received','pending_approval',
                                        'approved','rejected','po_generated','invoice_generated',
                                        'closed','cancelled')),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── rfq_vendors ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq_vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id      UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      VARCHAR(30)  NOT NULL DEFAULT 'assigned'
              CHECK (status IN ('assigned','viewed','responded','declined')),
  UNIQUE(rfq_id, vendor_id)
);

-- ── quotations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id         UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  quoted_amount  NUMERIC(15,2),
  delivery_days  INTEGER,
  remarks        TEXT,
  attachment_url VARCHAR(1000),
  currency       VARCHAR(10)   NOT NULL DEFAULT 'INR',
  notes          TEXT,
  status         VARCHAR(30)   NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted','under_review','approved','rejected')),
  submitted_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type         VARCHAR(50)  NOT NULL DEFAULT 'rfq',
  entity_id           UUID,
  rfq_id              UUID REFERENCES rfqs(id) ON DELETE CASCADE,
  requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  manager_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  preferred_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  priority            VARCHAR(20)  NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low','normal','high','urgent')),
  notes               TEXT,
  remarks             TEXT,
  requested_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── approval_history ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id   UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  action        VARCHAR(50)  NOT NULL
                CHECK (action IN ('requested','viewed','approved','rejected','reopened','reminder_sent')),
  performed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks       TEXT,
  performed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── purchase_orders ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number      VARCHAR(50)  UNIQUE NOT NULL,
  rfq_id         UUID REFERENCES rfqs(id) ON DELETE SET NULL,
  vendor_id      UUID REFERENCES vendors(id) ON DELETE SET NULL,
  quotation_id   UUID REFERENCES quotations(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status         VARCHAR(30)   NOT NULL DEFAULT 'issued'
                 CHECK (status IN ('draft','issued','acknowledged','delivered','cancelled')),
  delivery_date  TIMESTAMPTZ,
  terms          TEXT,
  notes          TEXT,
  issued_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── invoices ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(50)  UNIQUE NOT NULL,
  po_id           UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10)   NOT NULL DEFAULT 'INR',
  status          VARCHAR(30)   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','overdue','cancelled')),
  due_date        TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  generated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── activity_logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(50),
  entity_id    UUID,
  description  TEXT         NOT NULL,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255)  NOT NULL,
  message     TEXT          NOT NULL,
  type        VARCHAR(50)   NOT NULL DEFAULT 'info'
              CHECK (type IN ('info','success','warning','error')),
  is_read     BOOLEAN       NOT NULL DEFAULT FALSE,
  link        VARCHAR(500),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── settings ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name     VARCHAR(255) NOT NULL DEFAULT 'VendorBridge',
  company_logo     TEXT,
  default_currency VARCHAR(10)  NOT NULL DEFAULT 'INR',
  tax_percentage   NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  support_email    VARCHAR(255) DEFAULT 'support@vendorbridge.com',
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email         ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role          ON users(role);
CREATE INDEX IF NOT EXISTS idx_vendors_email       ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_status      ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_status         ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_created_by     ON rfqs(created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_rfq      ON quotations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotations_vendor   ON quotations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status    ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_manager   ON approvals(manager_id);
CREATE INDEX IF NOT EXISTS idx_approvals_rfq       ON approvals(rfq_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor           ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_created_by       ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor     ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_po         ON invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_activity_user       ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created    ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_user          ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read          ON notifications(is_read);

-- ── Auto-update updated_at trigger ────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
`;

const TRIGGERS = ['users','vendors','rfqs','quotations','approvals','purchase_orders','invoices'];

async function run() {
  const client = await pool.connect();
  try {
    console.log('\n🚀 VendorBridge — Database Setup\n');
    console.log('📡 Connecting to database...');

    // Run schema
    console.log('📋 Creating tables...');
    await client.query(SCHEMA);

    // Create triggers
    for (const tbl of TRIGGERS) {
      await client.query(`DROP TRIGGER IF EXISTS trg_${tbl}_updated_at ON ${tbl}`);
      await client.query(`CREATE TRIGGER trg_${tbl}_updated_at BEFORE UPDATE ON ${tbl} FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
    }
    console.log('   ✅ Tables and triggers created');

    // Default settings
    await client.query(`INSERT INTO settings (company_name, default_currency, tax_percentage, support_email)
      VALUES ('VendorBridge', 'INR', 18.00, 'ohmpatel655@gmail.com')
      ON CONFLICT DO NOTHING`);
    console.log('   ✅ Default settings inserted');

    // Test users to create
    const users = [
      { full_name: 'Super Admin',         company_name: 'VendorBridge HQ', email: 'admin@vendorbridge.com',      password: 'Admin@12345!',    role: 'admin' },
      { full_name: 'Ohm Patel (Admin)',    company_name: 'VendorBridge HQ', email: 'ohmpatel655@gmail.com',      password: 'Admin@12345!',    role: 'admin' },
      { full_name: 'Raj Kumar',            company_name: 'Acme Corp',        email: 'procurement@vendorbridge.com',password: 'Proc@12345!',     role: 'procurement_officer' },
      { full_name: 'Priya Sharma',         company_name: 'Acme Corp',        email: 'manager@vendorbridge.com',   password: 'Manager@12345!',  role: 'manager' },
      { full_name: 'TechCorp Supplies',    company_name: 'TechCorp Ltd',     email: 'vendor@vendorbridge.com',    password: 'Vendor@12345!',   role: 'vendor' },
    ];

    console.log('\n👤 Creating test users...\n');

    for (const u of users) {
      const existing = await client.query('SELECT id, role FROM users WHERE email=$1', [u.email]);
      if (existing.rows.length) {
        console.log(`   ⚠️  ${u.email} already exists (${existing.rows[0].role}) — skipping`);
        continue;
      }
      const hash = await bcrypt.hash(u.password, 12);
      const result = await client.query(
        `INSERT INTO users (full_name, company_name, email, password_hash, role, is_verified, status)
         VALUES ($1,$2,$3,$4,$5,TRUE,'active') RETURNING id, email, role`,
        [u.full_name, u.company_name, u.email, hash, u.role]
      );
      console.log(`   ✅ Created: ${u.email}`);
      console.log(`      Role    : ${u.role}`);
      console.log(`      Password: ${u.password}`);
      console.log(`      ID      : ${result.rows[0].id}\n`);

      // If vendor role, also create vendor profile
      if (u.role === 'vendor') {
        const userId = result.rows[0].id;
        const vendorExists = await client.query('SELECT id FROM vendors WHERE email=$1', [u.email]);
        if (!vendorExists.rows.length) {
          await client.query(
            `INSERT INTO vendors (vendor_name, company_name, contact_person, email, category, status, user_id)
             VALUES ($1,$2,$3,$4,$5,'active',$6)`,
            [u.company_name, u.company_name, u.full_name, u.email, 'IT Equipment', userId]
          );
          console.log(`   ✅ Vendor profile created for ${u.email}`);
        }
      }
    }

    console.log('\n════════════════════════════════════════');
    console.log('✅ SETUP COMPLETE!\n');
    console.log('🔐 Test Credentials:\n');
    console.log('  Admin:               admin@vendorbridge.com        / Admin@12345!');
    console.log('  Admin (your email):  ohmpatel655@gmail.com         / Admin@12345!');
    console.log('  Procurement Officer: procurement@vendorbridge.com  / Proc@12345!');
    console.log('  Manager:             manager@vendorbridge.com      / Manager@12345!');
    console.log('  Vendor:              vendor@vendorbridge.com       / Vendor@12345!');
    console.log('\n🌐 App URL: http://localhost:3001');
    console.log('════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    if (err.detail) console.error('   Detail:', err.detail);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
