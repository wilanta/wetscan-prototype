-- Gated runner refuses ANY S04 rows and locks dependencies first. No force or cascading deletion.
DROP TABLE sentinel.incident_timeline_evidence;
DROP TABLE sentinel.incident_timeline;
DROP TABLE sentinel.incident_evidence;
DROP TABLE sentinel.incident_alerts;
DROP TABLE sentinel.incidents;
