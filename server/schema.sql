-- PostgreSQL schema for the TEC Hub platform (local server mode).
-- Creates all tables with standard PostgreSQL types (uuid, jsonb, timestamptz, etc.)
-- plus auth tables (auth_users, auth_sessions) for local password auth.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Auth tables (local password store — replaces Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'student',
  department text,
  phone text,
  avatar_url text,
  fingerprint_enrolled boolean NOT NULL DEFAULT false,
  fingerprint_credential_id text,
  webauthn_credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  exempt_auto_logout boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  permissions jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns if table already exists (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='must_change_password') THEN
    ALTER TABLE profiles ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='permissions') THEN
    ALTER TABLE profiles ADD COLUMN permissions jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone') THEN
    ALTER TABLE profiles ADD COLUMN phone text;
  END IF;
END $$;

-- ============================================================
-- inventory_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  icon text NOT NULL DEFAULT 'Package',
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- buildings
-- ============================================================
CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address text,
  floors int NOT NULL DEFAULT 3,
  floor_plan_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- rooms
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_number text NOT NULL,
  floor int NOT NULL DEFAULT 1,
  room_type text NOT NULL DEFAULT 'classroom',
  capacity int,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  installed_technology jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_connections jsonb NOT NULL DEFAULT '[]'::jsonb,
  connections jsonb NOT NULL DEFAULT '[]'::jsonb,
  room_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- cabinets / shelves
-- ============================================================
CREATE TABLE IF NOT EXISTS cabinets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  rows int NOT NULL DEFAULT 4,
  columns int NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, code)
);

CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES cabinets(id) ON DELETE CASCADE,
  row_index int NOT NULL,
  col_index int NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cabinet_id, row_index, col_index)
);

-- ============================================================
-- devices
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_number text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  manufacturer text,
  model text,
  serial_number text,
  status text NOT NULL DEFAULT 'available',
  tracking_method text NOT NULL DEFAULT 'barcode',
  barcode text UNIQUE,
  nfc_tag_id text UNIQUE,
  qr_code text UNIQUE,
  value numeric(10,2) NOT NULL DEFAULT 0,
  purchase_date date,
  warranty_until date,
  condition text NOT NULL DEFAULT 'good',
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  cabinet_id uuid REFERENCES cabinets(id) ON DELETE SET NULL,
  shelf_id uuid REFERENCES shelves(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_high_value boolean NOT NULL DEFAULT false,
  operating_system text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='operating_system') THEN
    ALTER TABLE devices ADD COLUMN operating_system text;
  END IF;
END $$;

-- ============================================================
-- device_bundles / device_bundle_items
-- ============================================================
CREATE TABLE IF NOT EXISTS device_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  room_type_hint text,
  is_room_aware boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES device_bundles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- lending_periods / break_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes int NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS break_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  day_of_week int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- lending_requests / lending_request_items
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  period_id uuid REFERENCES lending_periods(id) ON DELETE SET NULL,
  custom_duration_minutes int,
  requested_at timestamptz NOT NULL DEFAULT now(),
  pickup_at timestamptz,
  return_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON lending_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_teacher ON lending_requests(teacher_id);

CREATE TABLE IF NOT EXISTS lending_request_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES lending_requests(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  bundle_id uuid REFERENCES device_bundles(id) ON DELETE SET NULL,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- lending_loans / lending_loan_items
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES lending_requests(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  period_id uuid REFERENCES lending_periods(id) ON DELETE SET NULL,
  checkout_at timestamptz NOT NULL DEFAULT now(),
  expected_return_at timestamptz NOT NULL,
  actual_return_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  signature_data text,
  signature_name text,
  return_condition text,
  return_notes text,
  return_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  return_signature_data text,
  return_signature_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loans_status ON lending_loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_teacher ON lending_loans(teacher_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lending_loans' AND column_name='return_signature_data') THEN
    ALTER TABLE lending_loans ADD COLUMN return_signature_data text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lending_loans' AND column_name='return_signature_name') THEN
    ALTER TABLE lending_loans ADD COLUMN return_signature_name text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lending_loan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES lending_loans(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- holidays (vacation/vacation blocking for calendar)
-- ============================================================
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL DEFAULT 'holiday',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- system_settings / activity_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);

-- ============================================================
-- consumables
-- ============================================================
CREATE TABLE IF NOT EXISTS consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  current_stock numeric(10,2) NOT NULL DEFAULT 0,
  min_stock numeric(10,2) NOT NULL DEFAULT 0,
  max_stock numeric(10,2) NOT NULL DEFAULT 0,
  reorder_qty numeric(10,2) NOT NULL DEFAULT 0,
  reorder_link text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consumables' AND column_name='max_stock') THEN
    ALTER TABLE consumables ADD COLUMN max_stock numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- filament_catalog / filament_inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS filament_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material text NOT NULL,
  color text NOT NULL,
  color_hex text NOT NULL DEFAULT '#cccccc',
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (material, color)
);

CREATE TABLE IF NOT EXISTS filament_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES filament_catalog(id) ON DELETE CASCADE,
  remaining_grams numeric(10,2) NOT NULL DEFAULT 0,
  total_grams numeric(10,2) NOT NULL DEFAULT 1000,
  spool_count int NOT NULL DEFAULT 0,
  min_grams numeric(10,2) NOT NULL DEFAULT 200,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- printers / print_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS printers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'idle',
  current_job_id uuid,
  ip_address text,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text,
  file_size_bytes bigint,
  file_format text,
  file_valid boolean NOT NULL DEFAULT false,
  validation_notes text,
  filament_catalog_id uuid REFERENCES filament_catalog(id) ON DELETE SET NULL,
  filament_material text,
  filament_color text,
  estimated_grams numeric(10,2),
  estimated_minutes int,
  copies int NOT NULL DEFAULT 1,
  notes text,
  status text NOT NULL DEFAULT 'queued',
  assigned_printer_id uuid REFERENCES printers(id) ON DELETE SET NULL,
  queue_position int,
  current_layer int NOT NULL DEFAULT 0,
  total_layers int NOT NULL DEFAULT 0,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  estimated_finish_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_reason text,
  bambu_job_id text,
  bambu_printer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_print_requests_status ON print_requests(status);
CREATE INDEX IF NOT EXISTS idx_print_requests_teacher ON print_requests(teacher_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='print_requests' AND column_name='bambu_job_id') THEN
    ALTER TABLE print_requests ADD COLUMN bambu_job_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='print_requests' AND column_name='bambu_printer_id') THEN
    ALTER TABLE print_requests ADD COLUMN bambu_printer_id text;
  END IF;
END $$;

-- ============================================================
-- ticket_categories / tickets / ticket_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'CircleHelp',
  color text NOT NULL DEFAULT '#64748b',
  requires_room boolean NOT NULL DEFAULT true,
  requires_speedtest boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  category_key text NOT NULL,
  title text NOT NULL,
  description text,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  speedtest_result jsonb,
  ping_result jsonb,
  escalated boolean NOT NULL DEFAULT false,
  escalated_at timestamptz,
  escalated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- wifi_measurements
-- ============================================================
CREATE TABLE IF NOT EXISTS wifi_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  measured_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  signal_strength_dbm int NOT NULL,
  download_mbps numeric(10,2) NOT NULL DEFAULT 0,
  upload_mbps numeric(10,2) NOT NULL DEFAULT 0,
  ping_ms numeric(10,2) NOT NULL DEFAULT 0,
  jitter_ms numeric(10,2) NOT NULL DEFAULT 0,
  packet_loss_pct numeric(5,2) NOT NULL DEFAULT 0,
  is_outage boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wifi_room ON wifi_measurements(room_id);
CREATE INDEX IF NOT EXISTS idx_wifi_created ON wifi_measurements(created_at DESC);

-- ============================================================
-- faq_articles (merged general + 3D-print FAQs)
-- ============================================================
CREATE TABLE IF NOT EXISTS faq_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  is_3d_print boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- events / event_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'auditorium',
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'planning',
  stage_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  equipment_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  rehearsal_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

CREATE TABLE IF NOT EXISTS event_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- damage_reports / repair_records / repair_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inventory_number text,
  serial_number text,
  description text NOT NULL,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text NOT NULL DEFAULT 'minor',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_damage_device ON damage_reports(device_id);

CREATE TABLE IF NOT EXISTS repair_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  damage_report_id uuid REFERENCES damage_reports(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issue_description text NOT NULL,
  repair_status text NOT NULL DEFAULT 'intake',
  intake_form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolution text,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  is_recurring boolean NOT NULL DEFAULT false,
  maintenance_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_device ON repair_records(device_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='repair_records' AND column_name='maintenance_started_at') THEN
    ALTER TABLE repair_records ADD COLUMN maintenance_started_at timestamptz;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS repair_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES repair_records(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- inventory_audits / inventory_audit_items
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  expected_count int NOT NULL DEFAULT 0,
  actual_count int NOT NULL DEFAULT 0,
  missing_count int NOT NULL DEFAULT 0,
  unexpected_count int NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'none',
  risk_notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  inventory_number text,
  expected_status text,
  actual_status text,
  item_status text NOT NULL DEFAULT 'missing',
  scanned_at timestamptz,
  scanned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- device_notes / notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS device_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  is_read boolean NOT NULL DEFAULT false,
  entity_type text,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- Ticket number generator function
-- ============================================================
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS text AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 3) AS int)), 0) + 1 INTO next_num FROM tickets;
  RETURN 'TK' || lpad(next_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Seed data
-- ============================================================
INSERT INTO ticket_categories (key, name, description, icon, color, requires_room, requires_speedtest, is_enabled, sort_order) VALUES
  ('technical_problem', 'Technisches Problem', 'Ein Gerät oder System funktioniert nicht richtig', 'Wrench', '#ef4444', true, false, true, 1),
  ('technical_question', 'Technische Frage', 'Hilfe oder Beratung bei Technik', 'CircleHelp', '#3b82f6', false, false, true, 2),
  ('wifi_issue', 'WLAN-Problem', 'Netzwerkverbindung oder Geschwindigkeit', 'Wifi', '#f59e0b', true, true, true, 3),
  ('room_building', 'Raum / Gebäude', 'Probleme mit Raum oder Gebäudeinfrastruktur', 'Building2', '#8b5cf6', true, false, true, 4),
  ('auditorium_event', 'Auditorium / Event', 'Technische Unterstützung für Event oder Auditorium', 'Mic2', '#10b981', true, false, true, 5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO lending_periods (name, duration_minutes, is_custom, sort_order) VALUES
  ('Einzelstunde', 45, false, 1),
  ('Doppelstunde', 90, false, 2),
  ('Halber Tag', 240, false, 3),
  ('Ganzer Tag', 480, false, 4)
ON CONFLICT DO NOTHING;

INSERT INTO break_periods (name, start_time, end_time, day_of_week, is_active) VALUES
  ('Morgenpause', '09:25', '09:40', 0, true),
  ('Große Pause', '10:55', '11:15', 0, true),
  ('Mittagspause', '12:30', '13:15', 0, true),
  ('Nachmittagspause', '14:35', '14:50', 0, true)
ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value, description) VALUES
  ('org_name', '"School TEC Hub"', 'Organization / School name'),
  ('auto_logout_minutes', '15', 'Inactivity timeout in minutes'),
  ('auto_logout_admin_exempt', 'true', 'Whether admins are exempt from auto-logout'),
  ('supported_print_formats', '["stl","obj","3mf","gcode"]', 'Allowed 3D print file formats'),
  ('max_print_file_size_mb', '50', 'Maximum upload size for 3D print files'),
  ('wifi_good_threshold_dbm', '-55', 'Wi-Fi signal strength considered good (dBm)'),
  ('wifi_ok_threshold_dbm', '-67', 'Wi-Fi signal strength considered OK (dBm)'),
  ('wifi_poor_threshold_dbm', '-75', 'Wi-Fi signal strength considered poor (dBm)'),
  ('wifi_min_download_mbps', '25', 'Minimum acceptable download speed'),
  ('lesson_start_time', '"08:00"', 'First lesson start time (HH:MM)'),
  ('lesson_duration_minutes', '45', 'Standard lesson duration'),
  ('lesson_break_minutes', '15', 'Break between lessons'),
  ('enable_bluetooth_scan', 'true', 'Enable NFC/Bluetooth device scanning'),
  ('signature_required', 'true', 'Require signature on lending checkout'),
  ('teacher_self_return', 'false', 'Allow teachers to return devices themselves'),
  ('low_stock_notification', 'true', 'Send notifications when consumables are low'),
  ('ai_suggestions_enabled', 'true', 'Enable AI workflow optimization suggestions')
ON CONFLICT (key) DO NOTHING;

INSERT INTO filament_catalog (material, color, color_hex, is_available, sort_order) VALUES
  ('PLA', 'Weiß', '#f8fafc', true, 1),
  ('PLA', 'Schwarz', '#0f172a', true, 2),
  ('PLA', 'Rot', '#ef4444', true, 3),
  ('PLA', 'Blau', '#3b82f6', true, 4),
  ('PLA', 'Grün', '#22c55e', true, 5),
  ('PLA', 'Gelb', '#eab308', true, 6),
  ('PLA', 'Orange', '#f97316', true, 7),
  ('PLA', 'Grau', '#94a3b8', true, 8),
  ('PETG', 'Schwarz', '#1e293b', true, 9),
  ('PETG', 'Transparent', '#e2e8f0', true, 10),
  ('ABS', 'Weiß', '#f1f5e9', true, 11),
  ('ABS', 'Schwarz', '#0f172a', true, 12)
ON CONFLICT (material, color) DO NOTHING;

INSERT INTO inventory_categories (name, description, icon, color, sort_order) VALUES
  ('Beamer', 'Projektoren und Projektionsgeräte', 'Projector', '#6366f1', 1),
  ('Adapter', 'Video- und Netzadapter', 'Cable', '#06b6d4', 2),
  ('Laptops', 'Tragbare Computer', 'Laptop', '#0ea5e9', 3),
  ('Kameras', 'Foto- und Videokameras', 'Camera', '#f59e0b', 4),
  ('Audio', 'Lautsprecher, Mikrofone und Audio-Geräte', 'Speaker', '#ec4899', 5),
  ('3D-Drucker', '3D-Druck-Ausrüstung', 'Printer3d', '#22c55e', 6),
  ('Tablets', 'Tablets und mobile Geräte', 'Tablet', '#8b5cf6', 7),
  ('Kabel', 'Verlängerungs- und Verbindungskabel', 'Cable', '#64748b', 8),
  ('Präsentationskits', 'Gebündelte Präsentationsausrüstung', 'Presentation', '#14b8a6', 9),
  ('Messgeräte', 'Mess- und Prüfgeräte', 'Ruler', '#f97316', 10),
  ('Netzwerk', 'Netzwerkausrüstung und Router', 'Router', '#3b82f6', 11),
  ('Sonstiges', 'Verschiedene Geräte', 'Package', '#94a3b8', 99)
ON CONFLICT (name) DO NOTHING;

-- Seed a few FAQ articles
INSERT INTO faq_articles (question, answer, category, is_3d_print, sort_order) VALUES
  ('Wie richte ich einen Beamer ein?', 'Beamer an die Stromversorgung anschließen, dann das HDMI/DisplayPort-Kabel mit dem Laptop verbinden. Die korrekte Quelle am Beamer auswählen (HDMI1/HDMI2). Falls kein Bild erscheint, die Windows-Taste + P drücken und "Duplizieren" wählen.', 'general', false, 1),
  ('Wie funktioniert der 3D-Druck?', 'Laden Sie Ihre STL- oder 3MF-Datei im 3D-Druck-Bereich hoch, wählen Sie das gewünschte Filament und die Menge. Ein Teammitglied prüft den Auftrag und startet den Druck. Die fertigen Drucke können im TEC-Raum abgeholt werden.', 'printing', true, 1),
  ('Wie leihe ich Geräte aus?', 'Gehen Sie zum Ausleih-Bereich, wählen Sie die gewünschten Geräte und den Zeitraum. Die Ausleihe muss von einem Teammitglied freigegeben werden. Bei Abholung ist eine Unterschrift erforderlich.', 'lending', false, 1)
ON CONFLICT DO NOTHING;

-- Seed filament inventory
INSERT INTO filament_inventory (catalog_id, remaining_grams, total_grams, spool_count, min_grams)
SELECT id, 1000, 1000, 2, 200 FROM filament_catalog
WHERE NOT EXISTS (SELECT 1 FROM filament_inventory fi WHERE fi.catalog_id = filament_catalog.id);
