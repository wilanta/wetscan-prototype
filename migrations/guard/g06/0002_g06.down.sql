DO $$
DECLARE
  retained integer := 0;
BEGIN
  SELECT
    (SELECT count(*) FROM guard.g06_canvas_overlays) +
    (SELECT count(*) FROM guard.g06_outbox) +
    (SELECT count(*) FROM guard.g06_delivery_attempts) +
    (SELECT count(*) FROM guard.g06_intelligence_sync) +
    (SELECT count(*) FROM guard.g06_reports) +
    (SELECT count(*) FROM guard.g06_audit)
  INTO retained;

  IF retained > 0 THEN
    RAISE EXCEPTION 'Refusing to drop guard.g06 tables while % retained row(s) exist', retained
      USING ERRCODE = '22000';
  END IF;
END $$;

REVOKE ALL ON FUNCTION guard.g06_pending_deliveries(integer) FROM wetscan_guard_worker;
DROP FUNCTION IF EXISTS guard.g06_pending_deliveries(integer);

DROP TABLE IF EXISTS guard.g06_audit;
DROP TABLE IF EXISTS guard.g06_reports;
DROP TABLE IF EXISTS guard.g06_intelligence_sync;
DROP TABLE IF EXISTS guard.g06_delivery_attempts;
DROP TABLE IF EXISTS guard.g06_outbox;
DROP TABLE IF EXISTS guard.g06_canvas_overlays;
DROP TABLE IF EXISTS guard.g06_schema_migrations;
