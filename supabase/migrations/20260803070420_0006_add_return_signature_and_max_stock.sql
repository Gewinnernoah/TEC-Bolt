/*
# Zusätzliche Spalten für Ausleihe und Verbrauchsmaterialien

## Änderungen:
1. `lending_loans.return_signature_data` (text, nullable) — digitale Unterschrift bei Rückgabe
2. `lending_loans.return_signature_name` (text, nullable) — Name des Unterzeichners bei Rückgabe
3. `consumables.max_stock` (numeric, default 0) — Maximalbestand für "Voll"-Anzeige
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lending_loans' AND column_name = 'return_signature_data'
  ) THEN
    ALTER TABLE lending_loans ADD COLUMN return_signature_data text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lending_loans' AND column_name = 'return_signature_name'
  ) THEN
    ALTER TABLE lending_loans ADD COLUMN return_signature_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consumables' AND column_name = 'max_stock'
  ) THEN
    ALTER TABLE consumables ADD COLUMN max_stock numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
