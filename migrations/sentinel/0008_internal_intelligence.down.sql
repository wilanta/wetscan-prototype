-- The runner refuses this down migration when any Intelligence table holds rows (see applyMigrations).
DROP TABLE sentinel.intel_audit;
DROP TABLE sentinel.intel_candidate_cases;
DROP TABLE sentinel.intel_candidates;
DROP TABLE sentinel.intel_case_evidence;
DROP TABLE sentinel.intel_cases;
