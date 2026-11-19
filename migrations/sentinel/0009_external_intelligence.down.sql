-- The runner refuses this down migration when any catalog, run, inventory or advisory-sync job row exists (see applyMigrations). The three seeded ext_sources rows are the only data it may discard.
DROP TABLE sentinel.ext_inventory_items;
DROP TABLE sentinel.ext_inventory_snapshots;
DROP TABLE sentinel.ext_history;
DROP TABLE sentinel.ext_affected;
DROP TABLE sentinel.ext_advisories;
DROP TABLE sentinel.ext_runs;
DROP TABLE sentinel.ext_sources;
