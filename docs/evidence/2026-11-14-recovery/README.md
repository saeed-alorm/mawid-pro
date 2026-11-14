# Supabase-source fixture recovered locally — evidence record

14 November 2026, Asia/Beirut. Refs [#4](https://github.com/saeed-alorm/mawid-pro/issues/4). Source cloud checks were performed earlier in this chat through Supabase MCP. Owner-supplied desktop evidence records a subsequent actual export/restore. This continuation checked that evidence for internal consistency; it did not rerun recovery and did not receive the binary archive. The archive hash is therefore recorded from supplied evidence, not recomputed here.

## Verified desktop result, with provenance

The owner used PostgreSQL 17.12 pg_dump against the isolated Supabase-source schema with existing credentials entered locally through hidden prompts and TLS verification. This was a schema-scoped schema-and-data custom-format archive, not a DDL-only dump or row copy. The original archive remains on the owner's computer; it is excluded from Git. [Archive inventory](archive-list.txt) identifies PostgreSQL 17.11 source and pg_dump 17.12. The supplied handoff ZIP hash is 3f4355d8a76754ba4342fc7304f396929674706ea152b702e45873a618d6d38f (computed during this continuation).

[Local result](local-restore-evidence.json) records restore into a fresh PostgreSQL 17.12 Ubuntu/WSL cluster: TCP disabled, private 0700 Unix socket directory, no source connection during restore, then cluster stopped/deleted. Docker retrieval stalled on the desktop; Docker was not the successful destination. Earlier cloud Docker tool availability was a separate probe.

| Check | Supplied result |
|---|---|
| Archive SHA-256 | ae33a1ac3f8908268d5dc2ae0dd8a3f8c08faa7cc3d22c059cd104b73b840e80 |
| Restored data SHA-256 | ded080396cc81ea3120f4218f2eb1b802a29bafb00d21e70a2e1df4c13ec968c |
| Data | 6 bookings; 2 fictional tenants; each has one pending, one confirmed, one cancelled |
| Structure | All 7 constraint definitions and 3 index definitions match [source evidence](source-evidence.json) exactly |
| Security metadata | RLS enabled and forced; 0 policies/functions/foreign keys |
| Negative mutations | Invalid duration/status/version and duplicate tenant retry key rejected; checksum matched again afterwards |
| Restore execution | 0.113s excluding setup/download/validation; not a production RTO |

The [strict SQL](verify-restored-strict.sql) fails on count/hash/inventory/RLS mismatch and tests rejection paths. The supplied native runner separately compared full constraint/index definitions and group counts and ran strict verification again after negative tests; its source is retained in private desktop evidence. Static reconciliation here confirmed source/restored row counts, canonical hash, groups and all constraint/index definitions. It is not a new execution attestation or independent archive rehash.

Canonical data hash: booking_id sorted, pipe-separated booking/tenant/location/professional IDs, whole UTC epoch start/end, status, version and idempotency key; LF between rows, no trailing LF; UTF-8 SHA-256. Binary archive hash is separate.

## Source isolation and preservation

Migration 20261114073424_mawid_issue_4_isolated_recovery_fixture created only mawid_recovery_rehearsal_4 and six fictional bookings, without auth references. MCP source checks verified denied schema/table privileges and actual read denials under anon, authenticated and service_role; RLS forced with no policies/functions. Owner inspected Data API as enabled with public and graphql_public exposed; that remains owner-reported configuration, not an independently captured live API probe. No exposure setting changed. Existing auth/session/storage aggregate counts matched before/after in the source inspection; counts alone do not establish byte-for-byte or configuration identity. Raw identity/session data, endpoint credentials and nonfixture counts are omitted from this public evidence.

No functions exist. Future functions require explicit execution revokes; a schema-level default revoke cannot remove PostgreSQL's global PUBLIC EXECUTE default. Global defaults were left unchanged. The source security advisor's no-policy notice is intentional default-deny; unrelated Auth settings were not changed.

## Latest handoff reconciliation

The replacement ZIP has SHA-256 ddaecc2ca42a7ede2e2ee492512a798cfc8569c4708a5e36b3c498dfa84ea69e. Its source/restored JSON, archive inventory and strict verification SQL are byte-identical to the earlier handoff. No conflicting recovery evidence was found; no repeat was justified. Later booking policy decisions supersede historical pending-expiry/desk-close assertions, not this six-row portability result.

## Meaning and remaining gaps

This is a passed isolated schema/data portability recovery from an exported artifact. Owners/ACLs were intentionally excluded for portability; restored local role isolation was not reproduced. It does not prove full Auth/session/configuration or Storage binary recovery, managed backups/PITR, off-device encrypted retention, provider-outage recovery, production concurrency, tenant security in the future live API or store approval. A prior reported Neon same-project restore is separate evidence and not a cross-host pass.

Do not rerun this test without a concrete discrepancy or a changed recovery requirement. Full approved recovery scope, retention destination, owner and RPO/RTO remain decisions in [operations/exit](../../engineering/p1-operations-and-exit-2026-11-14.md). No real employee account, Twilio, paid service or APK change was part of restoration or this documentation continuation.
