-- ============================================================
--  XPay Enrollment System Migration
--  Run this in the Supabase SQL Editor:
--  https://supabase.com/dashboard/project/mhummbkiafjqgrhnewsb/sql
-- ============================================================

-- ── 1. ENROLLMENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_name     text NOT NULL,
  program_type    text NOT NULL DEFAULT 'standard',
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','suspended','completed','cancelled')),
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  activated_at    timestamptz,
  completed_at    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status  ON enrollments(status);

-- ── 2. ENROLLMENT PAYMENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  user_id             text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount              numeric(12,2) NOT NULL,
  currency            text NOT NULL DEFAULT 'NGN',
  payment_method      text,
  payment_reference   text,
  proof_url           text,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','refunded','failed')),
  admin_id            text REFERENCES profiles(id),
  admin_note          text,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ep_enrollment_id ON enrollment_payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_ep_user_id       ON enrollment_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_ep_status        ON enrollment_payments(status);

-- ── 3. ADMIN NOTIFICATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text NOT NULL,
  title           text NOT NULL,
  message         text NOT NULL,
  user_id         text REFERENCES profiles(id) ON DELETE SET NULL,
  enrollment_id   uuid REFERENCES enrollments(id) ON DELETE SET NULL,
  payment_id      uuid REFERENCES enrollment_payments(id) ON DELETE SET NULL,
  is_read         boolean NOT NULL DEFAULT false,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_is_read    ON admin_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_admin_notif_created_at ON admin_notifications(created_at DESC);

-- ── 4. USER PROGRESS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrollment_id       uuid NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  total_lessons       int NOT NULL DEFAULT 0,
  completed_lessons   int NOT NULL DEFAULT 0,
  last_activity_at    timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user_id       ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_enrollment_id ON user_progress(enrollment_id);

-- ── 5. AUTO-UPDATE updated_at TRIGGER ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_enrollments_updated_at') THEN
    CREATE TRIGGER set_enrollments_updated_at
      BEFORE UPDATE ON enrollments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ep_updated_at') THEN
    CREATE TRIGGER set_ep_updated_at
      BEFORE UPDATE ON enrollment_payments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_progress_updated_at') THEN
    CREATE TRIGGER set_progress_updated_at
      BEFORE UPDATE ON user_progress
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── 6. DISABLE RLS (service role key used from frontend — same pattern as profiles table) ──
ALTER TABLE enrollments           DISABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_payments   DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_notifications   DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress         DISABLE ROW LEVEL SECURITY;
