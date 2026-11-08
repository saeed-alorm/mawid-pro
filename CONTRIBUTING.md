# Contributing

1. Confirm product intent/acceptance in [Notion HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea). Use its real feature page if available; do not fabricate links.
2. Create/reuse a GitHub engineering issue with unchanged FEAT IDs, outcome, scope, acceptance, dependency links, unresolved decisions and verification. Keep business/pilot/CRM tasks in Notion.
3. Use a short-lived branch (`codex/` for agent work) from the actual default branch. Never force-push or rewrite published history. Do not merge another engineer's work without review.
4. Open a focused PR referencing the issue. Run README checks; inspect the diff and record Saeed's self-review. Independent approvals are not required while he is the sole engineer.
5. Merge only after actual checks pass. Maintainer reviews/merges readiness PRs. Deployments are separate from PR validation; never expose secrets to untrusted PR code.
6. Produce a versioned test build, record exact source commits and provenance, and verify it on the target platform. Follow [release evidence](docs/engineering/release-evidence.md).

The Engineering Project owns status: **Backlog → Ready → In progress → Review →
Ready to release → Done**. Ready requires satisfied dependencies and approved
implementation decisions. A decision spike can be Ready to resolve decisions,
but this does not authorize implementation of an unapproved architecture.
A merge is not proof of a released fix or resolved customer ticket. Keep issues
open until their release/verification acceptance passes, or link a separate
release-verification issue. Never add parallel status labels or an editable
Notion engineering board.

Keep signed credentials, real customer data and private demo assets out of this
public repo. No production deployments, database provisioning, app publishing,
repository visibility/ownership changes or paid usage belong to readiness work.
Do not weaken test assertions or TypeScript strictness to obtain green checks.

Until branch controls are actually verified/enforced, follow the same PR/check
and recorded self-review discipline manually. Account limitations and exact
remaining settings are in `docs/github-readiness.md`.
