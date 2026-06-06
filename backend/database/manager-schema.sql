-- ═══════════════════════════════════════════════════════════
--  VendorBridge — Manager Module Schema Extension
--  Run AFTER procurement-schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─── approval_history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  approval_id   UUID NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  action        VARCHAR(50) NOT NULL
                CHECK (action IN ('requested','viewed','approved','rejected','reopened','reminder_sent')),
  performed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks       TEXT,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appr_hist_approval ON approval_history(approval_id);
CREATE INDEX IF NOT EXISTS idx_appr_hist_performed ON approval_history(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_appr_hist_action    ON approval_history(action);

-- ─── Add approved_at to approvals if missing ──────────────
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─── Add priority to approvals ────────────────────────────
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS priority VARCHAR(20)
  NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent'));

-- ─── Auto-log history when approval status changes ────────
CREATE OR REPLACE FUNCTION log_approval_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO approval_history(approval_id, action, performed_by, remarks)
    VALUES (NEW.id, NEW.status, NEW.approved_by,
      CASE WHEN NEW.status='approved' THEN NEW.notes
           WHEN NEW.status='rejected' THEN NEW.notes
           ELSE NULL END);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_history ON approvals;
CREATE TRIGGER trg_approval_history
  AFTER UPDATE ON approvals
  FOR EACH ROW EXECUTE FUNCTION log_approval_status_change();
