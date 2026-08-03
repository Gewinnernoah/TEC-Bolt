/*
# Erweiterung der Datenbank: Neue Spalten und Tabellen

## Änderungen:

### 1. Neue Spalten
- `devices.operating_system` (text, nullable) — Betriebssystem von Geräten
- `profiles.must_change_password` (boolean, default false) — erzwingt Passwortwechsel beim nächsten Login
- `repair_records.maintenance_started_at` (timestamptz, nullable) — Startzeitpunkt für Wartungs-Alerts
- `print_requests.bambu_job_id` (text, nullable) — Bambu Lab Job-ID für Farm-Integration
- `print_requests.bambu_printer_id` (text, nullable) — Bambu Lab Drucker-ID
- `tickets.attachments` (jsonb, default '[]') — zusätzliche Anhänge (PDFs etc.)

### 2. Neue Tabellen
- `repair_comments` — Kommentare zu Reparaturen/Schadensberichten (mit Autor)
- `holidays` — Ferien und Feiertage für Ausleihsperren
- `faq_articles` — FAQ-Artikel mit Kategorie und 3D-Druck-Flag (vereinheitlicht)

### 3. Rollen-Erweiterung
- `profiles.role` enum wird um 'student' erweitert

### 4. Sicherheit
- RLS auf allen neuen Tabellen aktiviert
- Policies für authenticated CRUD auf neuen Tabellen
*/

-- 1a. devices.operating_system
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'devices' AND column_name = 'operating_system'
  ) THEN
    ALTER TABLE devices ADD COLUMN operating_system text;
  END IF;
END $$;

-- 1b. profiles.must_change_password
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE profiles ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 1c. repair_records.maintenance_started_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'repair_records' AND column_name = 'maintenance_started_at'
  ) THEN
    ALTER TABLE repair_records ADD COLUMN maintenance_started_at timestamptz;
  END IF;
END $$;

-- 1d. print_requests.bambu_job_id + bambu_printer_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'print_requests' AND column_name = 'bambu_job_id'
  ) THEN
    ALTER TABLE print_requests ADD COLUMN bambu_job_id text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'print_requests' AND column_name = 'bambu_printer_id'
  ) THEN
    ALTER TABLE print_requests ADD COLUMN bambu_printer_id text;
  END IF;
END $$;

-- 1e. tickets.attachments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tickets' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE tickets ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 2a. repair_comments
CREATE TABLE IF NOT EXISTS repair_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id uuid NOT NULL REFERENCES repair_records(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE repair_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_repair_comments" ON repair_comments;
CREATE POLICY "select_repair_comments" ON repair_comments FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_repair_comments" ON repair_comments;
CREATE POLICY "insert_repair_comments" ON repair_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS "update_repair_comments" ON repair_comments;
CREATE POLICY "update_repair_comments" ON repair_comments FOR UPDATE
  TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS "delete_repair_comments" ON repair_comments;
CREATE POLICY "delete_repair_comments" ON repair_comments FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

-- 2b. holidays
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  type text NOT NULL DEFAULT 'vacation' CHECK (type IN ('vacation', 'holiday', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_holidays" ON holidays;
CREATE POLICY "select_holidays" ON holidays FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_holidays" ON holidays;
CREATE POLICY "insert_holidays" ON holidays FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_holidays" ON holidays;
CREATE POLICY "update_holidays" ON holidays FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_holidays" ON holidays;
CREATE POLICY "delete_holidays" ON holidays FOR DELETE
  TO authenticated USING (true);

-- 2c. faq_articles — vereinheitlichte FAQ-Tabelle mit 3D-Druck-Integration
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
ALTER TABLE faq_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_faq_articles" ON faq_articles;
CREATE POLICY "select_faq_articles" ON faq_articles FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_faq_articles" ON faq_articles;
CREATE POLICY "insert_faq_articles" ON faq_articles FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_faq_articles" ON faq_articles;
CREATE POLICY "update_faq_articles" ON faq_articles FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_faq_articles" ON faq_articles;
CREATE POLICY "delete_faq_articles" ON faq_articles FOR DELETE
  TO authenticated USING (true);

-- 3. Rollen-Erweiterung: student zur profiles.role enum hinzufügen
-- profiles.role ist ein enum mit typ 'user_role'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'student'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'student';
  END IF;
END $$;

-- 4. Standardräume eintragen, falls noch keine vorhanden
INSERT INTO rooms (name, room_number, floor, room_type, capacity)
SELECT * FROM (VALUES
  ('Audimax', 'A-001', 0, 'auditorium', 300),
  ('Computerraum 1', 'B-101', 1, 'computer_lab', 30),
  ('Computerraum 2', 'B-102', 1, 'computer_lab', 30),
  ('Medienraum', 'B-103', 1, 'media_room', 25),
  ('Physik-Labor', 'C-201', 2, 'laboratory', 20),
  ('Chemie-Labor', 'C-202', 2, 'laboratory', 20),
  ('Lehrerzimmer', 'D-301', 3, 'office', 15),
  ('Bibliothek', 'E-001', 0, 'library', 50),
  ('3D-Druck-Werkstatt', 'F-001', 0, 'workshop', 12),
  ('Tonstudio', 'G-001', 0, 'studio', 10)
) AS v(name, room_number, floor, room_type, capacity)
WHERE NOT EXISTS (SELECT 1 FROM rooms LIMIT 1);

-- 5. Standard-Gebäude eintragen, falls noch keine vorhanden
INSERT INTO buildings (name, code, floors)
SELECT * FROM (VALUES
  ('Hauptgebäude', 'HG', 4),
  ('Nebengebäude', 'NG', 2)
) AS v(name, code, floors)
WHERE NOT EXISTS (SELECT 1 FROM buildings LIMIT 1);

-- 6. FAQ-Artikel aus alter faqs-Tabelle migrieren (falls Daten vorhanden)
INSERT INTO faq_articles (question, answer, category, is_3d_print, sort_order)
SELECT
  f.title,
  f.content,
  COALESCE(f.category, 'general'),
  (f.device_category_id IS NOT NULL OR f.device_id IS NOT NULL),
  f.sort_order
FROM faqs f
WHERE NOT EXISTS (SELECT 1 FROM faq_articles LIMIT 1)
ON CONFLICT DO NOTHING;
