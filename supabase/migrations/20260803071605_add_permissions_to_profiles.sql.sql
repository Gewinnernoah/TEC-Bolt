-- Add fine-grained permissions JSONB column to profiles.
-- Stores per-user feature toggles (3D print, borrowing, inventory mgmt, etc.)
-- as a JSONB object. Defaults to NULL — the app merges with DEFAULT_PERMISSIONS
-- at read time via normalizePermissions().
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE profiles ADD COLUMN permissions jsonb;
  END IF;
END $$;

COMMENT ON COLUMN profiles.permissions IS 'Fine-grained feature permissions (JSONB). Keys: can_print_3d, can_borrow, can_manage_inventory, can_manage_events, can_view_analytics, can_create_tickets. NULL = use app defaults.';
