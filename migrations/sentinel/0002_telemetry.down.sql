-- Runner must refuse ANY S02 rows before reversing. Does not touch S01 objects.
DROP TABLE sentinel.telemetry_events;
DROP TABLE sentinel.telemetry_batches;
DROP TABLE sentinel.telemetry_credentials;
DROP TABLE sentinel.telemetry_sources;
