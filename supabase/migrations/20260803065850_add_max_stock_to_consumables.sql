/*
# Add max_stock column to consumables table

1. Modified Tables
- `consumables`
  - New column `max_stock` (numeric, NOT NULL, default 0) — the maximum capacity
    for this consumable. Used by the UI to show a "Voll" (full) status badge only
    when `current_stock >= max_stock`, instead of the previous incorrect logic
    that treated any non-low stock as "full".

2. Security
- No RLS or policy changes. The existing policies on `consumables` are unchanged.

3. Important Notes
- `max_stock` defaults to 0 so the migration is non-breaking for existing rows.
  The UI treats a max_stock of 0 as "no maximum defined" and therefore never
  shows the "Voll" badge for legacy consumables until a maximum is set.
- This is additive only; no data is lost or transformed.
*/

ALTER TABLE consumables
  ADD COLUMN IF NOT EXISTS max_stock numeric NOT NULL DEFAULT 0;
