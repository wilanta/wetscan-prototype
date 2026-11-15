# Current execution status - 2026-11-15T21:03:07.884524+07:00

The historical preparation below is retained for audit, not an instruction to rerun. Approved provisioning/resume completed and verified. PostgreSQL14+11 real checks PASS; initial/final isolated observer hashes match45e7cfe2...1095d with differences[]. Docker6/6 real synthetic control probes PASS; all owned containers removed. Fixtures/evidence retained. No external Sentinel DB or secret inspected. Worker/Auth plan remains NOT APPROVED; see WORKER_AUTH_PLAN.md and ../../GUARD_G01_FINAL_ACCEPTANCE.md. Do not execute expired SQL or erase markers. Canonical Guard migration hash remainsb63e1e...5869d.

---

# G01 PostgreSQL resume ? explicit new approval required

Observed error supplied by owner: original07 line30 `new row violates row-level security policy for table "module_limits"`. SQL01?06 succeeded and are retained. A second original-launcher attempt was safely rejected before SQL by its evidence-overwrite guard.

Target remains localhost:5432/wetscan_s01_test_guardg01, owner wetscan_guard_migrator, marker wetscan-s01:aa8b15a6-7ed3-4f19-81f0-07d9759ec62f, PostgreSQL18.6. Guard migration source/hash is UNCHANGED: b63e1e8568babcf8d7811fe0fa735ecbec11ade64df19bdea78deb030a85869d. Original approved bundle e6f3b28cd49ac8c875a20b034338645dc4e14a8f81036e200f453f0337a05f01 remains intact for audit.

**Resume bundle SHA256: fab43564e7c93293fa7d1149b7da980a33e7a526974e53e46772d98c695a3bfb** ([resume-manifest.json](resume-manifest.json)). This is a different executable artifact approval, not a new database or reset.

1.11 read-only preflight verifies exact target/marker/operator, original07 rollback (no Guard budget/schema/policies/grants), expected platform ledger count. SQL08 additionally verifies all three exact checksums.
2.10 repeats ONLY the rolled-back additive Guard platform extension. Policy/grant creation runs as wetscan_migrator; the single `INSERT ('guard',1)` runs as existing approved postgres bootstrap operator, then returns to wetscan_migrator. No RLS disable, bypass grant, owner INSERT policy, Sentinel budget update, or schema weakening.
3.08 unchanged Guard schema migration + ledger;09 unchanged read-only scope checks;12 verifies Guard budget1 and preserved Sentinel budget2, FORCE RLS, role flags/no membership;06 read-only observer after schema.

No role/database/baseline/fixture creation repeats. No down, DROP, reset, fixture deletion, Sentinel database connection or credential inspection. Transactions rollback their own failed schema steps; preserve partially committed approved steps and evidence. Do not automatically rerun on error. Window only until19.59WIB15November2026, within original approval. Original07 must actually have rolled back; preflight refuses otherwise.

After explicit approval, owner runs normal protected login:

```powershell
cd C:\laragon\www\wetscan-2\wetscan-guard-g01-s03-candidate
node tests/guard/g01/postgres-resume-launcher.mjs --execute
```

The agent does not read or capture the password. Logs are new non-secret files under ignored.local/sentinel/guard-g01-unblock. Compare original06-before to post-resume06. Later app/worker acceptance still requires manually provisioned distinct role passwords and existing guarded purpose permits. No permission to inspect existing secrets follows from this resume.
