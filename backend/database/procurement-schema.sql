-- ═══════════════════════════════════════════════════════════
--  VendorBridge — Procurement Module Schema Extension
--  Run AFTER admin-schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─── Extend rfqs table with procurement fields ─────────────
ALTER TABLE rfqs
  ADD COLUMN IF NOT EXISTS product_category   VARCHAR(150),
  ADD COLUMN IF NOT EXISTS quantity           NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS expected_budget    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS delivery_location  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes              TEXT;

-- ─── Extend rfq status to full procurement lifecycle ───────
ALTER TABLE rfqs DROP CONSTRAINT IF EXISTS rfqs_status_check;
ALTER TABLE rfqs ADD CONSTRAINT rfqs_status_check
  CHECK (status IN ('draft','active','quotation_received','pending_approval',
                    'approved','rejected','po_generated','invoice_generated','closed','cancelled'));

-- ─── Extend rfq_vendors with response status ───────────────
ALTER TABLE rfq_vendors
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned','viewed','responded','declined'));

-- ─── Extend quotations with more fields ────────────────────
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS quoted_amount    NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS delivery_days    INTEGER,
  ADD COLUMN IF NOT EXISTS remarks          TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url   VARCHAR(1000);

-- Sync quoted_amount with existing amount column
UPDATE quotations SET quoted_amount = amount WHERE quoted_amount IS NULL;

-- ─── Extend approvals table with rfq-specific fields ───────
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS rfq_id              UUID REFERENCES rfqs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS manager_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remarks             TEXT,
  ADD COLUMN IF NOT EXISTS requested_at_ts     TIMESTAMPTZ DEFAULT NOW();

-- ─── Extend purchase_orders with procurement fields ────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_date    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms            TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ─── Extend invoices with procurement fields ───────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS generated_at    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS notes           TEXT;

-- ─── Additional indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rfqs_created_by_2    ON rfqs(created_by);
CREATE INDEX IF NOT EXISTS idx_rfqs_deadline        ON rfqs(deadline);
CREATE INDEX IF NOT EXISTS idx_rfqs_preferred_vendor ON rfqs(preferred_vendor_id);
CREATE INDEX IF NOT EXISTS idx_rfq_vendors_status   ON rfq_vendors(status);
CREATE INDEX IF NOT EXISTS idx_approvals_rfq        ON approvals(rfq_id);
CREATE INDEX IF NOT EXISTS idx_approvals_manager    ON approvals(manager_id);
CREATE INDEX IF NOT EXISTS idx_po_created_by        ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_po          ON invoices(po_id);
