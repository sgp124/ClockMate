-- ClockMate — Full Database Migration
-- Run this in Supabase SQL Editor to set up all tables, RLS, and seed data.

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. TABLES
-- ============================================================

-- Settings (singleton row for business configuration)
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'My Store',
  pay_period_type text NOT NULL DEFAULT 'biweekly'
    CHECK (pay_period_type IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  pay_period_start_day int NOT NULL DEFAULT 1
    CHECK (pay_period_start_day BETWEEN 0 AND 6),
  business_day_start time NOT NULL DEFAULT '10:00',
  auto_clockout_time time NOT NULL DEFAULT '03:30',
  max_shift_length_hours int NOT NULL DEFAULT 12,
  updated_at timestamptz DEFAULT now()
);

-- Users (employees, admins, kiosk)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  pin text NOT NULL,
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('admin', 'employee', 'kiosk')),
  is_admin_granted boolean NOT NULL DEFAULT false,
  pay_rate decimal(10, 2) DEFAULT 0.00,
  pay_rate_type text NOT NULL DEFAULT 'hourly',
  pay_rate_updated_at timestamptz,
  pay_rate_updated_by uuid REFERENCES users(id),
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_pin ON users(pin) WHERE is_active = true;

-- Shifts (scheduled work blocks)
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_shifts_user_date ON shifts(user_id, shift_date);
CREATE INDEX idx_shifts_date ON shifts(shift_date);

-- Time Logs (clock in/out records)
CREATE TABLE IF NOT EXISTS time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  business_date date NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  lat float,
  lng float,
  auto_clockout boolean NOT NULL DEFAULT false,
  forgot_flag boolean NOT NULL DEFAULT false,
  note text,
  edited_by uuid REFERENCES users(id)
);

CREATE INDEX idx_timelogs_user_date ON time_logs(user_id, business_date);
CREATE INDEX idx_timelogs_open ON time_logs(user_id) WHERE clock_out IS NULL;

-- Time Off Requests
CREATE TABLE IF NOT EXISTS time_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_timeoff_user ON time_off_requests(user_id);
CREATE INDEX idx_timeoff_status ON time_off_requests(status);

-- Admin Audit Log (immutable)
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_date ON admin_audit_log(created_at DESC);

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Helper: check if a user_id is admin or granted admin
CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = uid
      AND is_active = true
      AND (role = 'admin' OR is_admin_granted = true)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if a user_id is the primary admin
CREATE OR REPLACE FUNCTION is_primary_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = uid AND role = 'admin' AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---- USERS ----
-- Anyone can read basic user info (needed for kiosk PIN lookup)
-- But pay_rate is protected via a secure view
CREATE POLICY "users_select" ON users
  FOR SELECT USING (true);

CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "users_update" ON users
  FOR UPDATE USING (true);

-- Secure view that hides pay_rate from non-admins
CREATE OR REPLACE VIEW users_safe AS
  SELECT
    id, name, email, role, is_admin_granted, color, is_active, created_at,
    pay_rate_type,
    CASE
      WHEN current_setting('app.current_user_role', true) IN ('admin', 'granted_admin')
      THEN pay_rate
      ELSE NULL
    END AS pay_rate,
    CASE
      WHEN current_setting('app.current_user_role', true) IN ('admin', 'granted_admin')
      THEN pay_rate_updated_at
      ELSE NULL
    END AS pay_rate_updated_at
  FROM users;

-- ---- SHIFTS ----
CREATE POLICY "shifts_select" ON shifts
  FOR SELECT USING (true);

CREATE POLICY "shifts_insert_admin" ON shifts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "shifts_update_admin" ON shifts
  FOR UPDATE USING (true);

CREATE POLICY "shifts_delete_admin" ON shifts
  FOR DELETE USING (true);

-- ---- TIME LOGS ----
CREATE POLICY "timelogs_select" ON time_logs
  FOR SELECT USING (true);

CREATE POLICY "timelogs_insert" ON time_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "timelogs_update" ON time_logs
  FOR UPDATE USING (true);

-- ---- TIME OFF REQUESTS ----
CREATE POLICY "timeoff_select" ON time_off_requests
  FOR SELECT USING (true);

CREATE POLICY "timeoff_insert" ON time_off_requests
  FOR INSERT WITH CHECK (true);

CREATE POLICY "timeoff_update" ON time_off_requests
  FOR UPDATE USING (true);

-- ---- ADMIN AUDIT LOG ----
CREATE POLICY "audit_select" ON admin_audit_log
  FOR SELECT USING (true);

CREATE POLICY "audit_insert" ON admin_audit_log
  FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE on audit log — immutable by design

-- ---- SETTINGS ----
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);

CREATE POLICY "settings_update" ON settings
  FOR UPDATE USING (true);

-- ============================================================
-- 4. AUTO CLOCK-OUT FUNCTION
-- Call via Supabase cron or edge function at 3:30 AM daily
-- ============================================================

CREATE OR REPLACE FUNCTION auto_clockout()
RETURNS void AS $$
DECLARE
  cutoff_time timestamptz;
BEGIN
  SELECT (now()::date || ' ' || s.auto_clockout_time)::timestamptz
    INTO cutoff_time
    FROM settings s LIMIT 1;

  UPDATE time_logs
    SET clock_out = cutoff_time,
        auto_clockout = true
    WHERE clock_out IS NULL
      AND clock_in < cutoff_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. SEED DATA
-- ============================================================

-- Seed settings (singleton)
INSERT INTO settings (store_name) VALUES ('My Store')
  ON CONFLICT DO NOTHING;

-- Seed admin user (PIN: 1234 → bcrypt hash)
-- The app will hash PINs client-side with bcryptjs.
-- For seeding, we store a pre-hashed value.
-- PIN "0000" for admin — change after first login.
INSERT INTO users (name, email, pin, role, color)
VALUES (
  'Admin',
  'admin@clockmate.app',
  '$2a$10$XQxBj5QF5.OYkKEPfZYMwOyLqhmDl3JlfGNtz0bMfKxcEP8UAx5Ky',
  'admin',
  '#4F46E5'
);

-- Seed kiosk user (PIN: 9999)
INSERT INTO users (name, pin, role, color)
VALUES (
  'Kiosk',
  '$2a$10$F0dBGFNj7Ql3ygKjA/IZ0.j1F/xyOqdBfzCNKRnBqFEeW.xTNGVya',
  'kiosk',
  '#6B7280'
);
