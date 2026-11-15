-- Gated runner refuses ANY S03 rows and locks dependencies first. No force or cascading deletion.
DROP TABLE sentinel.detection_evidence;
DROP TABLE sentinel.detection_suppressed_evidence;
DROP TABLE sentinel.detection_evaluations;
DROP TABLE sentinel.detection_cooldowns;
DROP TABLE sentinel.detection_alerts;
DROP TABLE sentinel.detection_audit;
ALTER TABLE sentinel.detection_rules DROP CONSTRAINT detection_current_version;
DROP TABLE sentinel.detection_rule_versions;
DROP TABLE sentinel.detection_rules;
DROP INDEX sentinel.telemetry_detection_window;
