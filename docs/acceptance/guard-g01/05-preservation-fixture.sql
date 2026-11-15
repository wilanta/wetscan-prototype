BEGIN;
DO $target$ BEGIN IF current_database()<>'wetscan_s01_test_guardg01' OR current_user<>'postgres' OR inet_server_port() IS DISTINCT FROM 5432 OR NOT COALESCE(inet_server_addr() IN('127.0.0.1'::inet,'::1'::inet),false) OR current_setting('server_version_num')::int<>180006 OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM 'wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f' OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'wetscan_guard_migrator' THEN RAISE EXCEPTION 'guard_g01_target_denied'; END IF; END $target$;
-- Synthetic fixture ONLY in the NEW G01 database. No historical Sentinel database is connected.
INSERT INTO sentinel.project_bindings(mode,workspace_id,project_id,repository_id,actor_id)
VALUES('live','guard-g01-preservation','github-123','123','guard-g01-fixture');
INSERT INTO sentinel.telemetry_sources(mode,workspace_id,project_id,source_id,name,environment,origin,retention_days,rate_limit)
VALUES('live','guard-g01-preservation','github-123','11111111-1111-4111-8111-111111111111','G01 preservation fixture','local','controlled_test',7,60);
INSERT INTO sentinel.telemetry_events(mode,workspace_id,project_id,source_id,event_id,kind,severity,occurred_at,fingerprint,event)
VALUES('live','guard-g01-preservation','github-123','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','http.request','info',clock_timestamp(),repeat('a',64),'{}');
INSERT INTO sentinel.detection_rules(mode,workspace_id,project_id,rule_id,current_version,seed_key)
VALUES('live','guard-g01-preservation','github-123','33333333-3333-4333-8333-333333333333',1,'guard-g01-preservation');
INSERT INTO sentinel.detection_rule_versions(mode,workspace_id,project_id,rule_id,version,schema_version,status,definition,actor_id)
VALUES('live','guard-g01-preservation','github-123','33333333-3333-4333-8333-333333333333',1,1,'DRAFT','{"schemaVersion":1}','guard-g01-fixture');
INSERT INTO sentinel.detection_audit(mode,workspace_id,project_id,rule_id,version,action,actor_id)
VALUES('live','guard-g01-preservation','github-123','33333333-3333-4333-8333-333333333333',1,'create','guard-g01-fixture');
INSERT INTO platform.jobs(module,mode,workspace_id,project_id,job_id,kind,subject_ref,idempotency_key,fingerprint,state,max_attempts,available_at,finished_at)
VALUES('sentinel','live','guard-g01-preservation','github-123','guard-g01-sentinel-preserved','guard-g01.fixture','synthetic','guard-g01-preserved',repeat('b',64),'completed',1,clock_timestamp(),clock_timestamp());
COMMIT;
