// SQLite schema — all tables converted from the Supabase migrations.
// Uses SQLite-compatible types (TEXT for UUIDs/JSON, no enums).

export const SCHEMA_SQL = `
-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher',
  department TEXT,
  phone TEXT,
  avatar_url TEXT,
  fingerprint_enrolled INTEGER NOT NULL DEFAULT 0,
  fingerprint_credential_id TEXT,
  webauthn_credentials TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  exempt_auto_logout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auth users (local password store)
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auth sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);

-- Inventory categories
CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Package',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Buildings
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  floors INTEGER NOT NULL DEFAULT 3,
  floor_plan_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_number TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1,
  room_type TEXT NOT NULL DEFAULT 'classroom',
  capacity INTEGER,
  photos TEXT NOT NULL DEFAULT '[]',
  installed_technology TEXT NOT NULL DEFAULT '[]',
  available_connections TEXT NOT NULL DEFAULT '[]',
  connections TEXT NOT NULL DEFAULT '[]',
  room_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);

-- Cabinets
CREATE TABLE IF NOT EXISTS cabinets (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  rows INTEGER NOT NULL DEFAULT 4,
  columns INTEGER NOT NULL DEFAULT 4,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (room_id, code)
);

-- Shelves
CREATE TABLE IF NOT EXISTS shelves (
  id TEXT PRIMARY KEY,
  cabinet_id TEXT REFERENCES cabinets(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cabinet_id, row_index, col_index)
);

-- Devices
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  inventory_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  tracking_method TEXT NOT NULL DEFAULT 'barcode',
  barcode TEXT UNIQUE,
  nfc_tag_id TEXT UNIQUE,
  qr_code TEXT UNIQUE,
  value REAL NOT NULL DEFAULT 0,
  purchase_date TEXT,
  warranty_until TEXT,
  condition TEXT NOT NULL DEFAULT 'good',
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  cabinet_id TEXT REFERENCES cabinets(id) ON DELETE SET NULL,
  shelf_id TEXT REFERENCES shelves(id) ON DELETE SET NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  is_high_value INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);

-- Device bundles
CREATE TABLE IF NOT EXISTS device_bundles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  room_type_hint TEXT,
  is_room_aware INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device bundle items
CREATE TABLE IF NOT EXISTS device_bundle_items (
  id TEXT PRIMARY KEY,
  bundle_id TEXT NOT NULL REFERENCES device_bundles(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES inventory_categories(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lending periods
CREATE TABLE IF NOT EXISTS lending_periods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  is_custom INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Break periods
CREATE TABLE IF NOT EXISTS break_periods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  day_of_week INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lending requests
CREATE TABLE IF NOT EXISTS lending_requests (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  period_id TEXT REFERENCES lending_periods(id) ON DELETE SET NULL,
  custom_duration_minutes INTEGER,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  pickup_at TEXT,
  return_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TEXT,
  rejection_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON lending_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_teacher ON lending_requests(teacher_id);

-- Lending request items
CREATE TABLE IF NOT EXISTS lending_request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES lending_requests(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  bundle_id TEXT REFERENCES device_bundles(id) ON DELETE SET NULL,
  category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Lending loans
CREATE TABLE IF NOT EXISTS lending_loans (
  id TEXT PRIMARY KEY,
  request_id TEXT REFERENCES lending_requests(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  period_id TEXT REFERENCES lending_periods(id) ON DELETE SET NULL,
  checkout_at TEXT NOT NULL DEFAULT (datetime('now')),
  expected_return_at TEXT NOT NULL,
  actual_return_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  signature_data TEXT,
  signature_name TEXT,
  return_condition TEXT,
  return_notes TEXT,
  return_staff_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loans_status ON lending_loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_teacher ON lending_loans(teacher_id);

-- Lending loan items
CREATE TABLE IF NOT EXISTS lending_loan_items (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES lending_loans(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL
);

-- Activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);

-- Consumables
CREATE TABLE IF NOT EXISTS consumables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  current_stock REAL NOT NULL DEFAULT 0,
  min_stock REAL NOT NULL DEFAULT 0,
  reorder_qty REAL NOT NULL DEFAULT 0,
  reorder_link TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Filament catalog
CREATE TABLE IF NOT EXISTS filament_catalog (
  id TEXT PRIMARY KEY,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  color_hex TEXT NOT NULL DEFAULT '#cccccc',
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (material, color)
);

-- Filament inventory
CREATE TABLE IF NOT EXISTS filament_inventory (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL REFERENCES filament_catalog(id) ON DELETE CASCADE,
  remaining_grams REAL NOT NULL DEFAULT 0,
  total_grams REAL NOT NULL DEFAULT 1000,
  spool_count INTEGER NOT NULL DEFAULT 0,
  min_grams REAL NOT NULL DEFAULT 200,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Printers
CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  current_job_id TEXT,
  ip_address TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Print requests
CREATE TABLE IF NOT EXISTS print_requests (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  file_format TEXT,
  file_valid INTEGER NOT NULL DEFAULT 0,
  validation_notes TEXT,
  filament_catalog_id TEXT REFERENCES filament_catalog(id) ON DELETE SET NULL,
  filament_material TEXT,
  filament_color TEXT,
  estimated_grams REAL,
  estimated_minutes INTEGER,
  copies INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  assigned_printer_id TEXT REFERENCES printers(id) ON DELETE SET NULL,
  queue_position INTEGER,
  current_layer INTEGER NOT NULL DEFAULT 0,
  total_layers INTEGER NOT NULL DEFAULT 0,
  progress_pct REAL NOT NULL DEFAULT 0,
  estimated_finish_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  failed_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_print_requests_status ON print_requests(status);
CREATE INDEX IF NOT EXISTS idx_print_requests_teacher ON print_requests(teacher_id);

-- Ticket categories
CREATE TABLE IF NOT EXISTS ticket_categories (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'CircleHelp',
  color TEXT NOT NULL DEFAULT '#64748b',
  requires_room INTEGER NOT NULL DEFAULT 1,
  requires_speedtest INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  category_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  photos TEXT NOT NULL DEFAULT '[]',
  speedtest_result TEXT,
  ping_result TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  escalated_at TEXT,
  escalated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TEXT,
  resolution_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category_id);

-- Ticket comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- WiFi measurements
CREATE TABLE IF NOT EXISTS wifi_measurements (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  measured_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  signal_strength_dbm INTEGER NOT NULL,
  download_mbps REAL NOT NULL DEFAULT 0,
  upload_mbps REAL NOT NULL DEFAULT 0,
  ping_ms REAL NOT NULL DEFAULT 0,
  jitter_ms REAL NOT NULL DEFAULT 0,
  packet_loss_pct REAL NOT NULL DEFAULT 0,
  is_outage INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wifi_room ON wifi_measurements(room_id);
CREATE INDEX IF NOT EXISTS idx_wifi_created ON wifi_measurements(created_at DESC);

-- FAQs
CREATE TABLE IF NOT EXISTS faqs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  device_category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  video_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'auditorium',
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  organizer_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  stage_plan TEXT NOT NULL DEFAULT '{}',
  equipment_plan TEXT NOT NULL DEFAULT '[]',
  rehearsal_schedule TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

-- Event tasks
CREATE TABLE IF NOT EXISTS event_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  due_at TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Damage reports
CREATE TABLE IF NOT EXISTS damage_reports (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reported_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inventory_number TEXT,
  serial_number TEXT,
  description TEXT NOT NULL,
  photos TEXT NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL DEFAULT 'minor',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_damage_device ON damage_reports(device_id);

-- Repair records
CREATE TABLE IF NOT EXISTS repair_records (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  damage_report_id TEXT REFERENCES damage_reports(id) ON DELETE SET NULL,
  reported_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issue_description TEXT NOT NULL,
  repair_status TEXT NOT NULL DEFAULT 'intake',
  intake_form_data TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  resolution TEXT,
  cost REAL NOT NULL DEFAULT 0,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_repair_device ON repair_records(device_id);

-- Inventory audits
CREATE TABLE IF NOT EXISTS inventory_audits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  expected_count INTEGER NOT NULL DEFAULT 0,
  actual_count INTEGER NOT NULL DEFAULT 0,
  missing_count INTEGER NOT NULL DEFAULT 0,
  unexpected_count INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'none',
  risk_notes TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventory audit items
CREATE TABLE IF NOT EXISTS inventory_audit_items (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES inventory_audits(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  inventory_number TEXT,
  expected_status TEXT,
  actual_status TEXT,
  item_status TEXT NOT NULL DEFAULT 'missing',
  scanned_at TEXT,
  scanned_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Device notes
CREATE TABLE IF NOT EXISTS device_notes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_read INTEGER NOT NULL DEFAULT 0,
  entity_type TEXT,
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`;

// Helper to generate UUIDs
export function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Seed data SQL (uses fixed UUIDs for reference data)
export const SEED_SQL = `
INSERT OR IGNORE INTO ticket_categories (id, key, name, description, icon, color, requires_room, requires_speedtest, is_enabled, sort_order) VALUES
  ('${uuid()}', 'technical_problem', 'Technical Problem', 'A device or system is not working correctly', 'Wrench', '#ef4444', 1, 0, 1, 1),
  ('${uuid()}', 'technical_question', 'Technical Question', 'Ask for help or guidance with technology', 'CircleHelp', '#3b82f6', 0, 0, 1, 2),
  ('${uuid()}', 'wifi_issue', 'Wi-Fi Issue', 'Network connectivity or speed problems', 'Wifi', '#f59e0b', 1, 1, 1, 3),
  ('${uuid()}', 'room_building', 'Room / Building Issue', 'Problems with a room or building infrastructure', 'Building2', '#8b5cf6', 1, 0, 1, 4),
  ('${uuid()}', 'auditorium_event', 'Auditorium / Event Request', 'Request technical support for an event or auditorium', 'Mic2', '#10b981', 1, 0, 1, 5);

INSERT OR IGNORE INTO lending_periods (id, name, duration_minutes, is_custom, sort_order) VALUES
  ('${uuid()}', 'Single Lesson', 45, 0, 1),
  ('${uuid()}', 'Double Lesson', 90, 0, 2),
  ('${uuid()}', 'Half Day', 240, 0, 3),
  ('${uuid()}', 'Full Day', 480, 0, 4);

INSERT OR IGNORE INTO break_periods (id, name, start_time, end_time, day_of_week, is_active) VALUES
  ('${uuid()}', 'Morning Break', '09:25', '09:40', 0, 1),
  ('${uuid()}', 'Big Break', '10:55', '11:15', 0, 1),
  ('${uuid()}', 'Lunch Break', '12:30', '13:15', 0, 1),
  ('${uuid()}', 'Afternoon Break', '14:35', '14:50', 0, 1);

INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
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
  ('ai_suggestions_enabled', 'true', 'Enable AI workflow optimization suggestions');

INSERT OR IGNORE INTO filament_catalog (id, material, color, color_hex, is_available, sort_order) VALUES
  ('${uuid()}', 'PLA', 'White', '#f8fafc', 1, 1),
  ('${uuid()}', 'PLA', 'Black', '#0f172a', 1, 2),
  ('${uuid()}', 'PLA', 'Red', '#ef4444', 1, 3),
  ('${uuid()}', 'PLA', 'Blue', '#3b82f6', 1, 4),
  ('${uuid()}', 'PLA', 'Green', '#22c55e', 1, 5),
  ('${uuid()}', 'PLA', 'Yellow', '#eab308', 1, 6),
  ('${uuid()}', 'PLA', 'Orange', '#f97316', 1, 7),
  ('${uuid()}', 'PLA', 'Grey', '#94a3b8', 1, 8),
  ('${uuid()}', 'PETG', 'Black', '#1e293b', 1, 9),
  ('${uuid()}', 'PETG', 'Clear', '#e2e8f0', 1, 10),
  ('${uuid()}', 'ABS', 'White', '#f1f5f9', 1, 11),
  ('${uuid()}', 'ABS', 'Black', '#0f172a', 1, 12);

INSERT OR IGNORE INTO inventory_categories (id, name, description, icon, color, sort_order) VALUES
  ('${uuid()}', 'Projectors', 'Beamers and projection equipment', 'Projector', '#6366f1', 1),
  ('${uuid()}', 'Adapters', 'Video and power adapters', 'Cable', '#06b6d4', 2),
  ('${uuid()}', 'Laptops', 'Portable computers', 'Laptop', '#0ea5e9', 3),
  ('${uuid()}', 'Cameras', 'Photo and video cameras', 'Camera', '#f59e0b', 4),
  ('${uuid()}', 'Audio', 'Speakers, microphones and audio gear', 'Speaker', '#ec4899', 5),
  ('${uuid()}', '3D Printers', '3D printing equipment', 'Printer3d', '#22c55e', 6),
  ('${uuid()}', 'Tablets', 'Tablets and mobile devices', 'Tablet', '#8b5cf6', 7),
  ('${uuid()}', 'Cables', 'Extension and connection cables', 'Cable', '#64748b', 8),
  ('${uuid()}', 'Presentation Kits', 'Bundled presentation equipment', 'Presentation', '#14b8a6', 9),
  ('${uuid()}', 'Measurement', 'Measurement and testing devices', 'Ruler', '#f97316', 10),
  ('${uuid()}', 'Networking', 'Network equipment and routers', 'Router', '#3b82f6', 11),
  ('${uuid()}', 'Other', 'Miscellaneous equipment', 'Package', '#94a3b8', 99);
`;
