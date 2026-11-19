-- The runner refuses this down migration when any Ghost table holds rows (see applyMigrations).
DROP TABLE sentinel.ghost_audit;
DROP TABLE sentinel.ghost_decoys;
