-- ═══════════════════════════════════════════════════════════
--  VendorBridge — Admin Module Schema Extension
--  Run AFTER schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─── Add status column to users if missing ─────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive','suspended'));

-- ─── vendors ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_name     VARCHAR(255)  NOT NULL,
  company_name    VARCHAR(255)  NOT NULL,
  gst_number      VARCHAR(50),
  contact_person  VARCHAR(255)  NOT NULL,
  email           VARCHAR(255)  NOT NULL UNIQUE,
  phone           VARCHAR(30),
  address         TEXT,
  category        VARCHAR(100),
  status          VARCHAR(20)   NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive')),
  user_id         UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── rfqs (stub — used for dashboard analytics) ───────────
CREATE TABLE IF NOT EXISTS rfqs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','closed','cancelled')),
  deadline        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── rfq_vendors (RFQ ↔ Vendor assignments) ───────────────
CREATE TABLE IF NOT EXISTS rfq_vendors (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id     UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id  UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rfq_id, vendor_id)
);

-- ─── quotations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rfq_id       UUID NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id    UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency     VARCHAR(10) NOT NULL DEFAULT 'INR',
  notes        TEXT,
  status       VARCHAR(30) NOT NULL DEFAULT 'submitted'
               CHECK (status IN ('submitted','under_review','approved','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type    VARCHAR(50) NOT NULL,  -- 'rfq','quotation','purchase_order'
  entity_id      UUID NOT NULL,
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  notes          TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── purchase_orders ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number     VARCHAR(50) UNIQUE NOT NULL,
  rfq_id        UUID REFERENCES rfqs(id) ON DELETE SET NULL,
  vendor_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  quotation_id  UUID REFERENCES quotations(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency      VARCHAR(10) NOT NULL DEFAULT 'INR',
  status        VARCHAR(30) NOT NULL DEFAULT 'issued'
                CHECK (status IN ('draft','issued','acknowledged','delivered','cancelled')),
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── invoices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  VARCHAR(50) UNIQUE NOT NULL,
  po_id           UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
  status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','overdue','cancelled')),
  due_date        TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── activity_logs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(50),
  entity_id    UUID,
  description  TEXT NOT NULL,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── notifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  type        VARCHAR(50) NOT NULL DEFAULT 'info'
              CHECK (type IN ('info','success','warning','error')),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  link        VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name     VARCHAR(255) NOT NULL DEFAULT 'VendorBridge',
  company_logo     TEXT,
  default_currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  tax_percentage   NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  support_email    VARCHAR(255) DEFAULT 'support@vendorbridge.com',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (company_name, default_currency, tax_percentage, support_email)
VALUES ('VendorBridge', 'INR', 18.00, 'support@vendorbridge.com')
ON CONFLICT DO NOTHING;

-- ─── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendors_email    ON vendors(email);
CREATE INDEX IF NOT EXISTS idx_vendors_status   ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_category ON vendors(category);

CREATE INDEX IF NOT EXISTS idx_rfqs_status      ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_created_by  ON rfqs(created_by);

CREATE INDEX IF NOT EXISTS idx_quotations_rfq   ON quotations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_quotations_vendor ON quotations(vendor_id);

CREATE INDEX IF NOT EXISTS idx_approvals_status  ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_approvals_entity  ON approvals(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_po_vendor         ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status         ON purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_invoices_vendor   ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status   ON invoices(status);

CREATE INDEX IF NOT EXISTS idx_activity_user     ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity   ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_created  ON activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_user        ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read        ON notifications(is_read);

-- ─── Auto-update triggers ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['vendors','rfqs','quotations','approvals','purchase_orders','invoices']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
  END LOOP;
END $$;
