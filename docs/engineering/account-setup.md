# Remaining account operations

Current connector capability is narrower than the owner's repository permissions:
it can write source/PRs/issues but cannot create repositories, labels, milestones,
Projects or administer settings. Branch protection returned 403 (integration scope),
webhook inspection is unsupported, the profile omits the current plan, and the
fallback browser is signed out. Do not infer GitHub Free/Pro or disconnection.

`scripts/github-setup.py` is an idempotent, schema-informed gh/API continuation for
those missing operations. Syntax and local manifest checks were run; its account
mutations have **not** been live-tested in this environment. It preserves edited
issue bodies and existing status, detects duplicates, leaves unrelated labels and
branch controls alone, and refuses public mobile imports. Inspect existing mobile
history before import. It never merges, force-pushes, changes visibility, buys
services or configures billing.

On a machine with GitHub CLI already authenticated as `saeed-alorm` and authorized
repository/Projects administration, from the reviewed web checkout:

```sh
python3 scripts/github-setup.py audit
# Review the inventory: reuse authoritative mobile history if one is discovered.
python3 scripts/github-setup.py mobile-import --bundle /absolute/path/mawid-mobile-readiness.git.bundle
python3 scripts/github-setup.py metadata
# Only after the actual web-checks has succeeded for this exact PR commit:
python3 scripts/github-setup.py protect --sha EXACT_CHECKED_40_CHARACTER_WEB_COMMIT
```

The metadata command reconciles type:task/decision/epic/bug, priority:critical/high/
normal and phase:P0–P5 labels, P0–P5 milestones without due dates, the 15 scoped issue
records (including the private mobile issue), links and one **MAWID Engineering**
Project. New items start Backlog. It preserves existing item statuses. An existing
Project with a different lifecycle requires reviewed reconciliation instead of an
overwrite. Required lifecycle: Backlog → Ready → In progress → Review → Ready to
release → Done. Keep Project private when it contains private mobile issue metadata;
review access before linking a private repository. Do not create a Notion mirror.

Protection requires an actual successful check named `web-checks` (or `mobile-checks`
for mobile), zero required independent approvals, strict current-base checks and
resolved conversations. It retains admin recovery and does not overwrite unrelated
existing protection. Private plan support is inspected before enforcement; if
unsupported, maintain manual PR/check/self-review discipline and document the exact
missing setting. No paid upgrade is authorized.

Before enabling private mobile CI, inspect Settings → Billing and licensing →
Usage and Budgets. Retain included allowance and a hard stop on paid Actions usage.
The prepared mobile workflow has no scheduled or duplicate push/PR runs, uses one
Linux job, no cache upload and optional one-day test-artifact retention. Once the
account is verified, enable its existing workflow gate explicitly:

```sh
gh variable set MAWID_PRIVATE_CI_ENABLED --repo saeed-alorm/mawid-mobile --body true
```

This does not itself configure a billing hard stop. Do not run it until the prior
inspection is complete. Review actual CI results; skipped checks are not passes.

## Builder authorization audit

Repository cleanup does not disconnect account integrations. Inspect GitHub Settings
→ Applications → Authorized OAuth Apps and Installed GitHub Apps for a verified
Lovable-only authorization. Review the repository list/scope before revoking it;
preserve unrelated apps. Inspect mawid-pro Settings → Webhooks and remove only a
confirmed Lovable-only hook. Also disconnect the matching project/account GitHub
connection within Lovable settings if it remains active. Record what was present,
what was removed and when, without tokens or webhook secrets. No such account
removal has been verified or performed in this task.

Official API/reference sources used for the continuation:
- https://docs.github.com/en/graphql/reference/projects
- https://docs.github.com/en/rest/branches/branch-protection
- https://docs.github.com/en/billing/reference/product-usage-included
- https://docs.github.com/en/billing/concepts/budgets-and-alerts
