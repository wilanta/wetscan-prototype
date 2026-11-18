-- The runner refuses this down migration when any response table holds rows (see applyMigrations).
DROP TABLE sentinel.response_audit;
DROP TABLE sentinel.response_actions;
DROP TABLE sentinel.response_targets;
