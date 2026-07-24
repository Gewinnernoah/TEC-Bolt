-- PGlite local schema — mirrors the Supabase schema but without RLS/auth.users dependencies.
-- This runs once on first PGlite initialization.

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'teacher');
CREATE TYPE device_status AS ENUM ('available', 'borrowed', 'maintenance', 'defective', 'internal_use');
CREATE TYPE tracking_method AS ENUM ('barcode', 'nfc');
CREATE TYPE loan_status AS ENUM ('active', 'returned', 'overdue');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled');
CREATE TYPE condition_rating AS ENUM ('excellent', 'good', 'fair', 'damaged', 'defective');
CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'escalated');
CREATE TYPE print_status AS ENUM ('queued', 'validating', 'ready', 'printing', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE event_status AS ENUM ('planning', 'preparation', 'rehearsal', 'ready', 'in_progress', 'completed', 'cancelled');
CREATE TYPE audit_risk AS ENUM ('none', 'low', 'medium', 'high');
CREATE TYPE audit_item_status AS ENUM ('present', 'missing', 'unexpected');

-- gen_random_uuid() compatibility
CREATE OR REPLACE FUNCTION gen_random_uuid() RETURNS uuid AS $$
BEGIN
  RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql VOLATILE;

-- profiles (standalone, no auth.users dependency)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'teacher',
  department text,
  phone text,
  avatar_url text,
  fingerprint_enrolled boolean NOT NULL DEFAULT false,
  fingerprint_credential_id text,
  webauthn_credentials jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  exempt_auto_logout boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- inventory_categories
CREATE TABLE IF NOT EXISTS inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  icon text NOT NULL DEFAULT 'Package',
  color text NOT NULL DEFAULT '#3b82f6',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- buildings
CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address text,
  floors int NOT NULL DEFAULT 3,
  floor_plan_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- rooms
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

-- cabinets
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

-- shelves
CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES cabinets(id) ON DELETE CASCADE,
  row_index int NOT NULL,
  col_index int NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cabinet_id, row_index, col_index)
);

-- devices
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_number text NOT NULL UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  manufacturer text,
  model text,
  serial_number text,
  status device_status NOT NULL DEFAULT 'available',
  tracking_method tracking_method NOT NULL DEFAULT 'barcode',
  barcode text UNIQUE,
  nfc_tag_id text UNIQUE,
  qr_code text UNIQUE,
  value numeric(10,2) NOT NULL DEFAULT 0,
  purchase_date date,
  warranty_until date,
  condition condition_rating NOT NULL DEFAULT 'good',
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  cabinet_id uuid REFERENCES cabinets(id) ON DELETE SET NULL,
  shelf_id uuid REFERENCES shelves(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_high_value boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- device_bundles
CREATE TABLE IF NOT EXISTS device_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  room_type_hint text,
  is_room_aware boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- device_bundle_items
CREATE TABLE IF NOT EXISTS device_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES device_bundles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- lending_periods
CREATE TABLE IF NOT EXISTS lending_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes int NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- break_periods
CREATE TABLE IF NOT EXISTS break_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  day_of_week int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- lending_requests
CREATE TABLE IF NOT EXISTS lending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  period_id uuid REFERENCES lending_periods(id) ON DELETE SET NULL,
  custom_duration_minutes int,
  requested_at timestamptz NOT NULL DEFAULT now(),
  pickup_at timestamptz,
  return_at timestamptz,
  status request_status NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- lending_request_items
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

-- lending_loans
CREATE TABLE IF NOT EXISTS lending_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES lending_requests(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  period_id uuid REFERENCES lending_periods(id) ON DELETE SET NULL,
  checkout_at timestamptz NOT NULL DEFAULT now(),
  expected_return_at timestamptz NOT NULL,
  actual_return_at timestamptz,
  status loan_status NOT NULL DEFAULT 'active',
  signature_data text,
  signature_name text,
  return_condition condition_rating,
  return_notes text,
  return_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- lending_loan_items
CREATE TABLE IF NOT EXISTS lending_loan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES lending_loans(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- activity_logs
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

-- consumables
CREATE TABLE IF NOT EXISTS consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  current_stock numeric(10,2) NOT NULL DEFAULT 0,
  min_stock numeric(10,2) NOT NULL DEFAULT 0,
  reorder_qty numeric(10,2) NOT NULL DEFAULT 0,
  reorder_link text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- filament_catalog
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

-- filament_inventory
CREATE TABLE IF NOT EXISTS filament_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES filament_catalog(id) ON DELETE CASCADE,
  remaining_grams numeric(10,2) NOT NULL DEFAULT 0,
  total_grams numeric(10,2) NOT NULL DEFAULT 1000,
  spool_count int NOT NULL DEFAULT 0,
  min_grams numeric(10,2) NOT NULL DEFAULT 200,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- printers
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

-- print_requests
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
  status print_status NOT NULL DEFAULT 'queued',
  assigned_printer_id uuid REFERENCES printers(id) ON DELETE SET NULL,
  queue_position int,
  current_layer int NOT NULL DEFAULT 0,
  total_layers int NOT NULL DEFAULT 0,
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  estimated_finish_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failed_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ticket_categories
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

-- tickets
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
  priority ticket_priority NOT NULL DEFAULT 'normal',
  status ticket_status NOT NULL DEFAULT 'open',
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

-- ticket_comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- wifi_measurements
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

-- faqs
CREATE TABLE IF NOT EXISTS faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  device_category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  video_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- events
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'auditorium',
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  organizer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status event_status NOT NULL DEFAULT 'planning',
  stage_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  equipment_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  rehearsal_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- event_tasks
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

-- damage_reports
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

-- repair_records
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- inventory_audits
CREATE TABLE IF NOT EXISTS inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress',
  expected_count int NOT NULL DEFAULT 0,
  actual_count int NOT NULL DEFAULT 0,
  missing_count int NOT NULL DEFAULT 0,
  unexpected_count int NOT NULL DEFAULT 0,
  risk_level audit_risk NOT NULL DEFAULT 'none',
  risk_notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- inventory_audit_items
CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  inventory_number text,
  expected_status device_status,
  actual_status device_status,
  item_status audit_item_status NOT NULL DEFAULT 'missing',
  scanned_at timestamptz,
  scanned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- device_notes
CREATE TABLE IF NOT EXISTS device_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- notifications
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON lending_loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_teacher ON lending_loans(teacher_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON lending_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_teacher ON lending_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_print_requests_status ON print_requests(status);
CREATE INDEX IF NOT EXISTS idx_print_requests_teacher ON print_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_wifi_room ON wifi_measurements(room_id);
CREATE INDEX IF NOT EXISTS idx_wifi_created ON wifi_measurements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_damage_device ON damage_reports(device_id);
CREATE INDEX IF NOT EXISTS idx_repair_device ON repair_records(device_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS lending_requests_updated_at BEFORE UPDATE ON lending_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS lending_loans_updated_at BEFORE UPDATE ON lending_loans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS consumables_updated_at BEFORE UPDATE ON consumables FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS printers_updated_at BEFORE UPDATE ON printers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS print_requests_updated_at BEFORE UPDATE ON print_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS faqs_updated_at BEFORE UPDATE ON faqs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER IF NOT EXISTS repair_records_updated_at BEFORE UPDATE ON repair_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed data
INSERT INTO ticket_categories (key, name, description, icon, color, requires_room, requires_speedtest, is_enabled, sort_order) VALUES
  ('technical_problem', 'Technical Problem', 'A device or system is not working correctly', 'Wrench', '#ef4444', true, false, true, 1),
  ('technical_question', 'Technical Question', 'Ask for help or guidance with technology', 'CircleHelp', '#3b82f6', false, false, true, 2),
  ('wifi_issue', 'Wi-Fi Issue', 'Network connectivity or speed problems', 'Wifi', '#f59e0b', true, true, true, 3),
  ('room_building', 'Room / Building Issue', 'Problems with a room or building infrastructure', 'Building2', '#8b5cf6', true, false, true, 4),
  ('auditorium_event', 'Auditorium / Event Request', 'Request technical support for an event or auditorium', 'Mic2', '#10b981', true, false, true, 5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO lending_periods (name, duration_minutes, is_custom, sort_order) VALUES
  ('Single Lesson', 45, false, 1),
  ('Double Lesson', 90, false, 2),
  ('Half Day', 240, false, 3),
  ('Full Day', 480, false, 4)
ON CONFLICT DO NOTHING;

INSERT INTO break_periods (name, start_time, end_time, day_of_week, is_active) VALUES
  ('Morning Break', '09:25', '09:40', 0, true),
  ('Big Break', '10:55', '11:15', 0, true),
  ('Lunch Break', '12:30', '13:15', 0, true),
  ('Afternoon Break', '14:35', '14:50', 0, true)
ON CONFLICT DO NOTHING;

INSERT INTO system_settings (key, value, description) VALUES
  ('org_name', '"School TEC Hub"'::jsonb, 'Organization / School name'),
  ('auto_logout_minutes', '15'::jsonb, 'Inactivity timeout in minutes'),
  ('auto_logout_admin_exempt', 'true'::jsonb, 'Whether admins are exempt from auto-logout'),
  ('supported_print_formats', '["stl","obj","3mf","gcode"]'::jsonb, 'Allowed 3D print file formats'),
  ('max_print_file_size_mb', '50'::jsonb, 'Maximum upload size for 3D print files'),
  ('wifi_good_threshold_dbm', '-55'::jsonb, 'Wi-Fi signal strength considered good (dBm)'),
  ('wifi_ok_threshold_dbm', '-67'::jsonb, 'Wi-Fi signal strength considered OK (dBm)'),
  ('wifi_poor_threshold_dbm', '-75'::jsonb, 'Wi-Fi signal strength considered poor (dBm)'),
  ('wifi_min_download_mbps', '25'::jsonb, 'Minimum acceptable download speed'),
  ('lesson_start_time', '"08:00"'::jsonb, 'First lesson start time (HH:MM)'),
  ('lesson_duration_minutes', '45'::jsonb, 'Standard lesson duration'),
  ('lesson_break_minutes', '15'::jsonb, 'Break between lessons'),
  ('enable_bluetooth_scan', 'true'::jsonb, 'Enable NFC/Bluetooth device scanning'),
  ('signature_required', 'true'::jsonb, 'Require signature on lending checkout'),
  ('teacher_self_return', 'false'::jsonb, 'Allow teachers to return devices themselves'),
  ('low_stock_notification', 'true'::jsonb, 'Send notifications when consumables are low'),
  ('ai_suggestions_enabled', 'true'::jsonb, 'Enable AI workflow optimization suggestions')
ON CONFLICT (key) DO NOTHING;

INSERT INTO filament_catalog (material, color, color_hex, is_available, sort_order) VALUES
  ('PLA', 'White', '#f8fafc', true, 1),
  ('PLA', 'Black', '#0f172a', true, 2),
  ('PLA', 'Red', '#ef4444', true, 3),
  ('PLA', 'Blue', '#3b82f6', true, 4),
  ('PLA', 'Green', '#22c55e', true, 5),
  ('PLA', 'Yellow', '#eab308', true, 6),
  ('PLA', 'Orange', '#f97316', true, 7),
  ('PLA', 'Grey', '#94a3b8', true, 8),
  ('PETG', 'Black', '#1e293b', true, 9),
  ('PETG', 'Clear', '#e2e8f0', true, 10),
  ('ABS', 'White', '#f1f5f9', true, 11),
  ('ABS', 'Black', '#0f172a', true, 12)
ON CONFLICT (material, color) DO NOTHING;

INSERT INTO inventory_categories (name, description, icon, color, sort_order) VALUES
  ('Projectors', 'Beamers and projection equipment', 'Projector', '#6366f1', 1),
  ('Adapters', 'Video and power adapters', 'Cable', '#06b6d4', 2),
  ('Laptops', 'Portable computers', 'Laptop', '#0ea5e9', 3),
  ('Cameras', 'Photo and video cameras', 'Camera', '#f59e0b', 4),
  ('Audio', 'Speakers, microphones and audio gear', 'Speaker', '#ec4899', 5),
  ('3D Printers', '3D printing equipment', 'Printer3d', '#22c55e', 6),
  ('Tablets', 'Tablets and mobile devices', 'Tablet', '#8b5cf6', 7),
  ('Cables', 'Extension and connection cables', 'Cable', '#64748b', 8),
  ('Presentation Kits', 'Bundled presentation equipment', 'Presentation', '#14b8a6', 9),
  ('Measurement', 'Measurement and testing devices', 'Ruler', '#f97316', 10),
  ('Networking', 'Network equipment and routers', 'Router', '#3b82f6', 11),
  ('Other', 'Miscellaneous equipment', 'Package', '#94a3b8', 99)
ON CONFLICT (name) DO NOTHING;
