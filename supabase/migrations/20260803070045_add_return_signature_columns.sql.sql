-- Add return signature support to lending_loans so a device return can be
-- confirmed with a digital signature (mirrors the checkout signature_data /
-- signature_name columns).
ALTER TABLE lending_loans
  ADD COLUMN IF NOT EXISTS return_signature_data text,
  ADD COLUMN IF NOT EXISTS return_signature_name text;
