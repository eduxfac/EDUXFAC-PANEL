-- Retired V1 physical-retirement design; not valid for V2 contexts/functions.
DO $$ BEGIN RAISE EXCEPTION 'Physical retirement requires a separate preservation review; use rollback-operational.sql'; END $$;
