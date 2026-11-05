-- Retired V1 design. V2 preserves session epochs and audit evidence.
DO $$ BEGIN RAISE EXCEPTION 'V1 rollback retired; use reviewed rollback-operational.sql with the security bridge'; END $$;
