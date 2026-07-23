-- Auto-create a profile row when a new auth.users record is inserted.
-- This replaces the manual upsert in the client signUp flow, which could
-- fail silently and leave the user without a profile.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'teacher')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
