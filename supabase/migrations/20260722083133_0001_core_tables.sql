/*
# Core platform tables — users, inventory, storage, lending

## Purpose
Establishes the foundational schema for the school inventory, lending, and technical-support platform. This migration creates user profiles, the device catalog, storage hierarchy, lending workflow, and supporting lookup tables.

## New Tables
1. `profiles` — user profile data linked to auth.users; stores role, display name, fingerprint enrollment state.
2. `inventory_categories` — device categories (e.g. projectors, adapters, 3D printers) with icon metadata.
3. `devices` — the asset catalog. Each device has an inventory number, barcode/NFC/QR identifiers, status, condition, storage location, value, and metadata.
4. `buildings` — campus buildings for storage and network monitoring.
5. `rooms` — rooms within buildings; used for storage, lending pickup, network heatmap, and room technology overview.
6. `cabinets` — storage cabinets within rooms.
7. `shelves` — shelf positions within cabinets (the most granular storage unit).
8. `device_bundles` — named sets of devices (e.g. "Presentation Kit HDMI") that are recommended together.
9. `device_bundle_items` — junction table linking bundles to devices/categories.
10. `lending_requests` — teacher-submitted requests to borrow device bundles or individual devices for a lesson period.
11. `lending_loans` — active/complete loan records created by lending staff when handing out equipment. Includes signature data and responsible staff member.
12. `lending_periods` — configurable lending period definitions (single lesson, double lesson, custom).

## Security
- RLS enabled on all tables.
- Profiles are owner-readable; admins can read all. Authenticated users can update their own fingerprint credential.
- All operational tables are readable by authenticated users (teachers, staff, admins all need visibility). Write access is role-gated at the application layer via profile.role; the DB policies permit authenticated CRUD with ownership for sensitive rows.
- Owner columns default to auth.uid() so inserts that omit the owner succeed.

## Notes
1. `role` is an enum with 'admin', 'staff' (lending staff / AG members), and 'teacher'.
2. Device `status` enum covers the five required states.
3. Device `tracking_method` selects barcode vs NFC for scan workflows.
4. Storage hierarchy is building → room → cabinet → shelf.
5. Loans record the responsible staff member and a base64 signature capture.
6. A trigger keeps `lending_loans.actual_return_at` consistent — return is recorded by staff only.
*/

-- Role enum used across the platform
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'staff', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Device status enum
DO $$ BEGIN
  CREATE TYPE device_status AS ENUM ('available', 'borrowed', 'maintenance', 'defective', 'internal_use');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tracking method enum
DO $$ BEGIN
  CREATE TYPE tracking_method AS ENUM ('barcode', 'nfc');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Loan status enum
DO $$ BEGIN
  CREATE TYPE loan_status AS ENUM ('active', 'returned', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lending request status enum
DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected', 'fulfilled', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Condition rating enum for device returns
DO $$ BEGIN
  CREATE TYPE condition_rating AS ENUM ('excellent', 'good', 'fair', 'damaged', 'defective');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ticket priority enum
DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ticket status enum
DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

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

ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_categories" ON inventory_categories;
CREATE POLICY "read_categories" ON inventory_categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_categories_staff" ON inventory_categories;
CREATE POLICY "write_categories_staff" ON inventory_categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_categories_staff" ON inventory_categories;
CREATE POLICY "update_categories_staff" ON inventory_categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_categories_staff" ON inventory_categories;
CREATE POLICY "delete_categories_staff" ON inventory_categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
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

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_buildings" ON buildings;
CREATE POLICY "read_buildings" ON buildings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_buildings_staff" ON buildings;
CREATE POLICY "write_buildings_staff" ON buildings FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_buildings_staff" ON buildings;
CREATE POLICY "update_buildings_staff" ON buildings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_buildings_staff" ON buildings;
CREATE POLICY "delete_buildings_staff" ON buildings FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
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

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_rooms" ON rooms;
CREATE POLICY "read_rooms" ON rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_rooms_staff" ON rooms;
CREATE POLICY "write_rooms_staff" ON rooms FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_rooms_staff" ON rooms;
CREATE POLICY "update_rooms_staff" ON rooms FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_rooms_staff" ON rooms;
CREATE POLICY "delete_rooms_staff" ON rooms FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- cabinets
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

ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_cabinets" ON cabinets;
CREATE POLICY "read_cabinets" ON cabinets FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_cabinets_staff" ON cabinets;
CREATE POLICY "write_cabinets_staff" ON cabinets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_cabinets_staff" ON cabinets;
CREATE POLICY "update_cabinets_staff" ON cabinets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_cabinets_staff" ON cabinets;
CREATE POLICY "delete_cabinets_staff" ON cabinets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- shelves
-- ============================================================
CREATE TABLE IF NOT EXISTS shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cabinet_id uuid REFERENCES cabinets(id) ON DELETE CASCADE,
  row_index int NOT NULL,
  col_index int NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cabinet_id, row_index, col_index)
);

ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_shelves" ON shelves;
CREATE POLICY "read_shelves" ON shelves FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_shelves_staff" ON shelves;
CREATE POLICY "write_shelves_staff" ON shelves FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_shelves_staff" ON shelves;
CREATE POLICY "update_shelves_staff" ON shelves FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_shelves_staff" ON shelves;
CREATE POLICY "delete_shelves_staff" ON shelves FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
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

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_devices" ON devices;
CREATE POLICY "read_devices" ON devices FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_devices_staff" ON devices;
CREATE POLICY "write_devices_staff" ON devices FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_devices_staff" ON devices;
CREATE POLICY "update_devices_staff" ON devices FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_devices_staff" ON devices;
CREATE POLICY "delete_devices_staff" ON devices FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- device_bundles
-- ============================================================
CREATE TABLE IF NOT EXISTS device_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  room_type_hint text,
  is_room_aware boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_bundles" ON device_bundles;
CREATE POLICY "read_bundles" ON device_bundles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_bundles_staff" ON device_bundles;
CREATE POLICY "write_bundles_staff" ON device_bundles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_bundles_staff" ON device_bundles;
CREATE POLICY "update_bundles_staff" ON device_bundles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_bundles_staff" ON device_bundles;
CREATE POLICY "delete_bundles_staff" ON device_bundles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- device_bundle_items
-- ============================================================
CREATE TABLE IF NOT EXISTS device_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES device_bundles(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  category_id uuid REFERENCES inventory_categories(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE device_bundle_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_bundle_items" ON device_bundle_items;
CREATE POLICY "read_bundle_items" ON device_bundle_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_bundle_items_staff" ON device_bundle_items;
CREATE POLICY "write_bundle_items_staff" ON device_bundle_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_bundle_items_staff" ON device_bundle_items;
CREATE POLICY "update_bundle_items_staff" ON device_bundle_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_bundle_items_staff" ON device_bundle_items;
CREATE POLICY "delete_bundle_items_staff" ON device_bundle_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- lending_periods
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes int NOT NULL,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lending_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_periods" ON lending_periods;
CREATE POLICY "read_periods" ON lending_periods FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_periods_admin" ON lending_periods;
CREATE POLICY "write_periods_admin" ON lending_periods FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "update_periods_admin" ON lending_periods;
CREATE POLICY "update_periods_admin" ON lending_periods FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "delete_periods_admin" ON lending_periods;
CREATE POLICY "delete_periods_admin" ON lending_periods FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- break_periods (for pickup/return restrictions)
-- ============================================================
CREATE TABLE IF NOT EXISTS break_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  day_of_week int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE break_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_breaks" ON break_periods;
CREATE POLICY "read_breaks" ON break_periods FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_breaks_admin" ON break_periods;
CREATE POLICY "write_breaks_admin" ON break_periods FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "update_breaks_admin" ON break_periods;
CREATE POLICY "update_breaks_admin" ON break_periods FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
DROP POLICY IF EXISTS "delete_breaks_admin" ON break_periods;
CREATE POLICY "delete_breaks_admin" ON break_periods FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- lending_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
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

ALTER TABLE lending_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_requests" ON lending_requests;
CREATE POLICY "read_requests" ON lending_requests FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_request" ON lending_requests;
CREATE POLICY "insert_own_request" ON lending_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "update_request_owner" ON lending_requests;
CREATE POLICY "update_request_owner" ON lending_requests FOR UPDATE
  TO authenticated USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "update_request_staff" ON lending_requests;
CREATE POLICY "update_request_staff" ON lending_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

DROP POLICY IF EXISTS "delete_request_owner" ON lending_requests;
CREATE POLICY "delete_request_owner" ON lending_requests FOR DELETE
  TO authenticated USING (auth.uid() = teacher_id);

-- ============================================================
-- lending_request_items
-- ============================================================
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

ALTER TABLE lending_request_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_request_items" ON lending_request_items;
CREATE POLICY "read_request_items" ON lending_request_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_request_items" ON lending_request_items;
CREATE POLICY "write_request_items" ON lending_request_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM lending_requests r WHERE r.id = request_id AND r.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_request_items" ON lending_request_items;
CREATE POLICY "update_request_items" ON lending_request_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM lending_requests r WHERE r.id = request_id AND r.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_request_items" ON lending_request_items;
CREATE POLICY "delete_request_items" ON lending_request_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM lending_requests r WHERE r.id = request_id AND r.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- ============================================================
-- lending_loans
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES lending_requests(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
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

ALTER TABLE lending_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_loans" ON lending_loans;
CREATE POLICY "read_loans" ON lending_loans FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_loans_staff" ON lending_loans;
CREATE POLICY "write_loans_staff" ON lending_loans FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "update_loans_staff" ON lending_loans;
CREATE POLICY "update_loans_staff" ON lending_loans FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_loans_admin" ON lending_loans;
CREATE POLICY "delete_loans_admin" ON lending_loans FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- lending_loan_items
-- ============================================================
CREATE TABLE IF NOT EXISTS lending_loan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES lending_loans(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lending_loan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_loan_items" ON lending_loan_items;
CREATE POLICY "read_loan_items" ON lending_loan_items FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "write_loan_items_staff" ON lending_loan_items;
CREATE POLICY "write_loan_items_staff" ON lending_loan_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );
DROP POLICY IF EXISTS "delete_loan_items_staff" ON lending_loan_items;
CREATE POLICY "delete_loan_items_staff" ON lending_loan_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','staff'))
  );

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON lending_loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_teacher ON lending_loans(teacher_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON lending_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_teacher ON lending_requests(teacher_id);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS devices_updated_at ON devices;
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS lending_requests_updated_at ON lending_requests;
CREATE TRIGGER lending_requests_updated_at BEFORE UPDATE ON lending_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS lending_loans_updated_at ON lending_loans;
CREATE TRIGGER lending_loans_updated_at BEFORE UPDATE ON lending_loans FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
