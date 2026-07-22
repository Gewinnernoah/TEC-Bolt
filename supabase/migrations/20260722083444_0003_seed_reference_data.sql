/*
# Seed reference data — ticket categories, lending periods, settings, filament

## Purpose
Populates lookup tables with sensible defaults so the platform is immediately usable.

## Inserts
1. ticket_categories — five required support categories.
2. lending_periods — single/double lesson, half/full day.
3. break_periods — example break windows.
4. system_settings — default configuration (JSONB values).
5. filament_catalog — common filament colors/materials.
6. inventory_categories — common device categories.
*/

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
  ('org_name', '"School TEC Hub"'::jsonb, 'Organization / school name'),
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
