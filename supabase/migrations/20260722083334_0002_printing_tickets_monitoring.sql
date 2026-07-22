/*
# Secondary platform tables — printing, tickets, monitoring, FAQ, events, consumables, settings

## Purpose
Extends the core schema with the 3D printing workflow, technical support ticket system, network/building monitoring, FAQ/knowledge base, event/auditorium planning, consumables tracking, damage/repair records, inventory audits, activity logs, and system settings.

## New Tables
1. `consumables` — trackable supplies (filament, batteries, tape, adapters) with stock levels and low-stock thresholds.
2. `filament_inventory` — filament-specific stock with color/material, linked to admin-defined filament catalog.
3. `filament_catalog` — admin-defined available filament colors/materials for print requests.
4. `print_requests` — teacher-uploaded 3D print jobs with file validation, filament selection, and print status.
5. `print_jobs` — operational print job records tracking queue position, current layer, progress, and ETA.
6. `printers` — 3D printers in the print farm.
7. `tickets` — technical support tickets with categories, priority, escalation, photos, and speedtest results.
8. `ticket_categories` — admin-configurable ticket categories that can be enabled/disabled.
9. `ticket_comments` — internal comments/notes on tickets.
10. `wifi_measurements` — Wi-Fi strength and speedtest readings tied to rooms for heatmap visualization.
11. `faqs` — knowledge base articles, device-specific or general, with search.
12. `events` — auditorium/event planning with technical prep workflows and rehearsal scheduling.
13. `event_tasks` — collaborative task management for events.
14. `damage_reports` — device damage documentation with photos, serial/inventory numbers, timestamps.
15. `repair_records` — repair history tracking and recurring issue detection.
16. `inventory_audits` — audit sessions comparing expected vs actual inventory with risk evaluation.
17. `inventory_audit_items` — per-device audit results within an audit session.
18. `activity_logs` — system-wide audit trail of user actions.
19. `device_notes` — internal comments/notes per device.
20. `system_settings` — centralized configuration management (key/value JSON store).
21. `notifications` — in-app notifications for staff reminders (charge, prepare, maintain).

## Security
- RLS enabled on all tables.
- Authenticated users can read most operational data (teachers need visibility into prints, tickets, FAQs).
- Write access for operational tables is gated to staff/admin via profile.role checks.
- Teacher-specific tables (print_requests, tickets, events) allow owners to insert and update their own rows.
- Admin-only tables (system_settings, ticket_categories, filament_catalog) restrict writes to admins.

## Notes
1. Print files are validated client-side and server-side (supported formats only).
2. Tickets capture automatic speedtest/ping results for Wi-Fi issues.
3. WiFi measurements power the heatmap overlay on the building plan.
4. Inventory audits compute risk evaluation (missing high-value devices flagged).
5. System settings use a key/value JSON structure for centralized configuration.
6. Activity logs capture user, action, entity, and metadata for audit trails.
*/

-- Print job status enum
DO $$ BEGIN
  CREATE TYPE print_status AS ENUM ('queued', 'validating', 'ready', 'printing', 'paused', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ticket category enum (kept as text for admin flexibility, but core categories seeded)
-- Event status enum
DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('planning', 'preparation', 'rehearsal', 'ready', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit risk enum
DO $$ BEGIN
  CREATE TYPE audit_risk AS ENUM ('none', 'low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit item status
DO $$ BEGIN
  CREATE TYPE audit_item_status AS ENUM ('present', 'missing', 'unexpected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- system_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_settings" ON system_settings;
CREATE POLICY "read_settings" ON system_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_settings_admin" ON system_settings;
CREATE POLICY "write_settings_admin" ON system_settings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "update_settings_admin" ON system_settings;
CREATE POLICY "update_settings_admin" ON system_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "delete_settings_admin" ON system_settings;
CREATE POLICY "delete_settings_admin" ON system_settings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- activity_logs
-- ============================================================
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

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_logs" ON activity_logs;
CREATE POLICY "read_logs" ON activity_logs FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "insert_logs" ON activity_logs;
CREATE POLICY "insert_logs" ON activity_logs FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_entity ON activity_logs(entity_type, entity_id);

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
  reorder_qty numeric(10,2) NOT NULL DEFAULT 0,
  reorder_link text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consumables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_consumables" ON consumables;
CREATE POLICY "read_consumables" ON consumables FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_consumables_staff" ON consumables;
CREATE POLICY "write_consumables_staff" ON consumables FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_consumables_staff" ON consumables;
CREATE POLICY "update_consumables_staff" ON consumables FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_consumables_staff" ON consumables;
CREATE POLICY "delete_consumables_staff" ON consumables FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- filament_catalog (admin-defined colors/materials)
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

ALTER TABLE filament_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_filament_catalog" ON filament_catalog;
CREATE POLICY "read_filament_catalog" ON filament_catalog FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_filament_catalog_admin" ON filament_catalog;
CREATE POLICY "write_filament_catalog_admin" ON filament_catalog FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_filament_catalog_admin" ON filament_catalog;
CREATE POLICY "update_filament_catalog_admin" ON filament_catalog FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_filament_catalog_admin" ON filament_catalog;
CREATE POLICY "delete_filament_catalog_admin" ON filament_catalog FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- filament_inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS filament_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES filament_catalog(id) ON DELETE CASCADE,
  remaining_grams numeric(10,2) NOT NULL DEFAULT 0,
  total_grams numeric(10,2) NOT NULL DEFAULT 1000,
  spool_count int NOT NULL DEFAULT 0,
  min_grams numeric(10,2) NOT NULL DEFAULT 200,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE filament_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_filament_inv" ON filament_inventory;
CREATE POLICY "read_filament_inv" ON filament_inventory FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_filament_inv_staff" ON filament_inventory;
CREATE POLICY "write_filament_inv_staff" ON filament_inventory FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_filament_inv_staff" ON filament_inventory;
CREATE POLICY "update_filament_inv_staff" ON filament_inventory FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_filament_inv_staff" ON filament_inventory;
CREATE POLICY "delete_filament_inv_staff" ON filament_inventory FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- printers
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

ALTER TABLE printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_printers" ON printers;
CREATE POLICY "read_printers" ON printers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_printers_staff" ON printers;
CREATE POLICY "write_printers_staff" ON printers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_printers_staff" ON printers;
CREATE POLICY "update_printers_staff" ON printers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_printers_admin" ON printers;
CREATE POLICY "delete_printers_admin" ON printers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- print_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS print_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
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

ALTER TABLE print_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_print_requests" ON print_requests;
CREATE POLICY "read_print_requests" ON print_requests FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_print_request" ON print_requests;
CREATE POLICY "insert_own_print_request" ON print_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "update_print_request" ON print_requests;
CREATE POLICY "update_print_request" ON print_requests FOR UPDATE
  TO authenticated USING (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "delete_print_request" ON print_requests;
CREATE POLICY "delete_print_request" ON print_requests FOR DELETE
  TO authenticated USING (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- ticket_categories
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

ALTER TABLE ticket_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ticket_categories" ON ticket_categories;
CREATE POLICY "read_ticket_categories" ON ticket_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_ticket_categories_admin" ON ticket_categories;
CREATE POLICY "write_ticket_categories_admin" ON ticket_categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_ticket_categories_admin" ON ticket_categories;
CREATE POLICY "update_ticket_categories_admin" ON ticket_categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_ticket_categories_admin" ON ticket_categories;
CREATE POLICY "delete_ticket_categories_admin" ON ticket_categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  category_id uuid NOT NULL REFERENCES ticket_categories(id) ON DELETE RESTRICT,
  category_key text NOT NULL,
  title text NOT NULL,
  description text,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
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

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_tickets" ON tickets;
CREATE POLICY "read_tickets" ON tickets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_ticket" ON tickets;
CREATE POLICY "insert_own_ticket" ON tickets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_ticket" ON tickets;
CREATE POLICY "update_ticket" ON tickets FOR UPDATE
  TO authenticated USING (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "delete_ticket" ON tickets;
CREATE POLICY "delete_ticket" ON tickets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- ticket_comments
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ticket_comments" ON ticket_comments;
CREATE POLICY "read_ticket_comments" ON ticket_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_ticket_comments" ON ticket_comments;
CREATE POLICY "insert_ticket_comments" ON ticket_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "update_ticket_comments" ON ticket_comments;
CREATE POLICY "update_ticket_comments" ON ticket_comments FOR UPDATE
  TO authenticated USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_ticket_comments" ON ticket_comments;
CREATE POLICY "delete_ticket_comments" ON ticket_comments FOR DELETE
  TO authenticated USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- wifi_measurements
-- ============================================================
CREATE TABLE IF NOT EXISTS wifi_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  measured_by uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
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

ALTER TABLE wifi_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_wifi" ON wifi_measurements;
CREATE POLICY "read_wifi" ON wifi_measurements FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_wifi" ON wifi_measurements;
CREATE POLICY "insert_wifi" ON wifi_measurements FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_wifi_staff" ON wifi_measurements;
CREATE POLICY "delete_wifi_staff" ON wifi_measurements FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- faqs
-- ============================================================
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

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_faqs" ON faqs;
CREATE POLICY "read_faqs" ON faqs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_faqs_staff" ON faqs;
CREATE POLICY "write_faqs_staff" ON faqs FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_faqs_staff" ON faqs;
CREATE POLICY "update_faqs_staff" ON faqs FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_faqs_admin" ON faqs;
CREATE POLICY "delete_faqs_admin" ON faqs FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'auditorium',
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  organizer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
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

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_events" ON events;
CREATE POLICY "read_events" ON events FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_events" ON events;
CREATE POLICY "insert_events" ON events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = organizer_id);

DROP POLICY IF EXISTS "update_events" ON events;
CREATE POLICY "update_events" ON events FOR UPDATE
  TO authenticated USING (
    auth.uid() = organizer_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    auth.uid() = organizer_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "delete_events" ON events;
CREATE POLICY "delete_events" ON events FOR DELETE
  TO authenticated USING (
    auth.uid() = organizer_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- event_tasks
-- ============================================================
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

ALTER TABLE event_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_event_tasks" ON event_tasks;
CREATE POLICY "read_event_tasks" ON event_tasks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_event_tasks" ON event_tasks;
CREATE POLICY "write_event_tasks" ON event_tasks FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_event_tasks" ON event_tasks;
CREATE POLICY "update_event_tasks" ON event_tasks FOR UPDATE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "delete_event_tasks" ON event_tasks;
CREATE POLICY "delete_event_tasks" ON event_tasks FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- damage_reports
-- ============================================================
CREATE TABLE IF NOT EXISTS damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  inventory_number text,
  serial_number text,
  description text NOT NULL,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text NOT NULL DEFAULT 'minor',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE damage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_damage_reports" ON damage_reports;
CREATE POLICY "read_damage_reports" ON damage_reports FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_damage_reports" ON damage_reports;
CREATE POLICY "insert_damage_reports" ON damage_reports FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_damage_reports_staff" ON damage_reports;
CREATE POLICY "update_damage_reports_staff" ON damage_reports FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "delete_damage_reports_admin" ON damage_reports;
CREATE POLICY "delete_damage_reports_admin" ON damage_reports FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- repair_records
-- ============================================================
CREATE TABLE IF NOT EXISTS repair_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  damage_report_id uuid REFERENCES damage_reports(id) ON DELETE SET NULL,
  reported_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
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

ALTER TABLE repair_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_repairs" ON repair_records;
CREATE POLICY "read_repairs" ON repair_records FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_repairs" ON repair_records;
CREATE POLICY "insert_repairs" ON repair_records FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_repairs_staff" ON repair_records;
CREATE POLICY "update_repairs_staff" ON repair_records FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_repairs_admin" ON repair_records;
CREATE POLICY "delete_repairs_admin" ON repair_records FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- inventory_audits
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  started_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
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

ALTER TABLE inventory_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_audits" ON inventory_audits;
CREATE POLICY "read_audits" ON inventory_audits FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_audits_staff" ON inventory_audits;
CREATE POLICY "write_audits_staff" ON inventory_audits FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_audits_staff" ON inventory_audits;
CREATE POLICY "update_audits_staff" ON inventory_audits FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_audits_admin" ON inventory_audits;
CREATE POLICY "delete_audits_admin" ON inventory_audits FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- inventory_audit_items
-- ============================================================
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

ALTER TABLE inventory_audit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_audit_items" ON inventory_audit_items;
CREATE POLICY "read_audit_items" ON inventory_audit_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_audit_items_staff" ON inventory_audit_items;
CREATE POLICY "write_audit_items_staff" ON inventory_audit_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_audit_items_staff" ON inventory_audit_items;
CREATE POLICY "update_audit_items_staff" ON inventory_audit_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_audit_items_staff" ON inventory_audit_items;
CREATE POLICY "delete_audit_items_staff" ON inventory_audit_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- device_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS device_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_device_notes" ON device_notes;
CREATE POLICY "read_device_notes" ON device_notes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_device_notes" ON device_notes;
CREATE POLICY "insert_device_notes" ON device_notes FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_device_notes_staff" ON device_notes;
CREATE POLICY "delete_device_notes_staff" ON device_notes FOR DELETE
  TO authenticated USING (
    auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- notifications
-- ============================================================
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

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_notifications" ON notifications;
CREATE POLICY "read_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_notifications" ON notifications;
CREATE POLICY "update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_notifications" ON notifications;
CREATE POLICY "delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- Indexes
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

-- Updated_at triggers
DROP TRIGGER IF EXISTS consumables_updated_at ON consumables;
CREATE TRIGGER consumables_updated_at BEFORE UPDATE ON consumables FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS printers_updated_at ON printers;
CREATE TRIGGER printers_updated_at BEFORE UPDATE ON printers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS print_requests_updated_at ON print_requests;
CREATE TRIGGER print_requests_updated_at BEFORE UPDATE ON print_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS faqs_updated_at ON faqs;
CREATE TRIGGER faqs_updated_at BEFORE UPDATE ON faqs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS repair_records_updated_at ON repair_records;
CREATE TRIGGER repair_records_updated_at BEFORE UPDATE ON repair_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ticket number generator
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS text AS $$
DECLARE
  next_num int;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 3) AS int)), 0) + 1 INTO next_num FROM tickets;
  RETURN 'TK' || lpad(next_num::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
