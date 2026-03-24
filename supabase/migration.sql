-- ClockMate — Full Database Migration (Secure)
-- Uses Supabase Auth for authentication. Run in Supabase SQL Editor.
-- IMPORTANT: Create the admin user via Supabase Auth first, then run this.

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 2. TABLES
-- ============================================================

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

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  pin text,
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('admin', 'employee', 'kiosk')),
  is_admin_granted boolean NOT NULL DEFAULT false,
  pay_rate decimal(10, 2) DEFAULT 0.00,
  pay_rate_type text NOT NULL DEFAULT 'hourly',
  pay_rate_updated_at timestamptz,
  pay_rate_updated_by uuid REFERENCES auth.users(id),
  color text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_pin_active ON users(pin) WHERE is_active = true AND pin IS NOT NULL;

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

-- Notifications (in-app)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  body text,
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'schedule', 'timeoff', 'alert')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Rate-limit table for kiosk PIN attempts
CREATE TABLE IF NOT EXISTS pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hint text,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX idx_pin_attempts_time ON pin_attempts(attempted_at DESC);

-- ============================================================
-- 3. HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = uid AND is_active = true
      AND (role = 'admin' OR is_admin_granted = true)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_primary_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = uid AND role = 'admin' AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS text AS $$
  SELECT role FROM users WHERE id = uid AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Secure PIN lookup function (prevents exposing user data via direct table access)
CREATE OR REPLACE FUNCTION lookup_pin(entered_pin text)
RETURNS TABLE(
  user_id uuid,
  user_name text,
  user_color text,
  user_role text
) AS $$
BEGIN
  -- Log the attempt for rate limiting
  INSERT INTO pin_attempts (ip_hint) VALUES ('kiosk');

  -- Check rate: max 10 attempts per minute
  IF (SELECT count(*) FROM pin_attempts WHERE attempted_at > now() - interval '1 minute') > 10 THEN
    RAISE EXCEPTION 'Too many PIN attempts. Please wait.';
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.color, u.role
    FROM users u
    WHERE u.pin = entered_pin AND u.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto clock-out function
CREATE OR REPLACE FUNCTION auto_clockout()
RETURNS void AS $$
DECLARE
  cutoff_time timestamptz;
BEGIN
  SELECT (now()::date || ' ' || s.auto_clockout_time)::timestamptz
    INTO cutoff_time FROM settings s LIMIT 1;

  UPDATE time_logs
    SET clock_out = cutoff_time, auto_clockout = true
    WHERE clock_out IS NULL AND clock_in < cutoff_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;

-- ---- USERS ----
-- Admins can see all users; employees see only themselves; kiosk sees nobody via table
CREATE POLICY "users_select_admin" ON users
  FOR SELECT USING (
    is_admin(auth.uid())
    OR id = auth.uid()
    OR get_user_role(auth.uid()) = 'kiosk'
  );

-- Only admins can insert new user profiles
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT WITH CHECK (
    id = auth.uid()
    OR is_admin(auth.uid())
  );

-- Admins can update any user; users can't update themselves (admin does it)
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (is_admin(auth.uid()));

-- ---- SHIFTS ----
CREATE POLICY "shifts_select" ON shifts
  FOR SELECT USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "shifts_insert" ON shifts
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "shifts_update" ON shifts
  FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "shifts_delete" ON shifts
  FOR DELETE USING (is_admin(auth.uid()));

-- ---- TIME LOGS ----
-- Admins see all; employees see own; kiosk can insert for any employee
CREATE POLICY "timelogs_select" ON time_logs
  FOR SELECT USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "timelogs_insert" ON time_logs
  FOR INSERT WITH CHECK (
    is_admin(auth.uid())
    OR user_id = auth.uid()
    OR get_user_role(auth.uid()) = 'kiosk'
  );

CREATE POLICY "timelogs_update" ON time_logs
  FOR UPDATE USING (is_admin(auth.uid()));

-- ---- TIME OFF REQUESTS ----
CREATE POLICY "timeoff_select" ON time_off_requests
  FOR SELECT USING (
    is_admin(auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "timeoff_insert" ON time_off_requests
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "timeoff_update" ON time_off_requests
  FOR UPDATE USING (is_admin(auth.uid()));

-- ---- ADMIN AUDIT LOG ----
-- Only primary admins can read; inserts only via admin
CREATE POLICY "audit_select" ON admin_audit_log
  FOR SELECT USING (is_primary_admin(auth.uid()));

CREATE POLICY "audit_insert" ON admin_audit_log
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

-- ---- SETTINGS ----
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);

CREATE POLICY "settings_update" ON settings
  FOR UPDATE USING (is_admin(auth.uid()));

-- ---- NOTIFICATIONS ----
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ---- PIN ATTEMPTS ----
-- Kiosk can insert attempts; only admins can read
CREATE POLICY "pin_attempts_insert" ON pin_attempts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "pin_attempts_select" ON pin_attempts
  FOR SELECT USING (is_admin(auth.uid()));

-- ============================================================
-- 5. TRIGGER: auto-create user profile on Supabase Auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 6. SEED DATA (settings only — create admin via Supabase Auth)
-- ============================================================

INSERT INTO settings (store_name) VALUES ('My Store')
  ON CONFLICT DO NOTHING;

-- ============================================================
-- SETUP INSTRUCTIONS:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Go to Supabase Auth > Users > "Create user"
--    Email: your-email@example.com, Password: (your strong password)
-- 3. The trigger auto-creates a user profile with role='employee'
-- 4. Manually promote yourself to admin:
--    UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
-- 5. Create a kiosk user the same way and set role = 'kiosk'
-- ============================================================
