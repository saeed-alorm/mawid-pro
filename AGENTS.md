# Engineering instructions

Read README.md, CONTRIBUTING.md and docs/github-readiness.md before editing.
Saeed (`saeed-alorm`) leads engineering. Do not infer a partner's role/account.

- Preserve published history, unrelated changes, behavior, `/mawid-pro/` Pages base
  and SPA fallback. Work on a short-lived `codex/` branch; leave merging to review.
- Use standard Vite/React/TanStack/Tailwind/Nitro plugins exactly once. No external
  app-builder dependency, telemetry, preview hook or connection belongs in tooling.
- npm lockfile is authoritative. Use pinned Node/npm, `npm ci`, unit tests, lint,
  strict types, normal build, Pages build/artifact/toolchain checks and affected
  browser checks. Record baseline failures; do not disable checks to hide them.
- This is local fictional demo code, not a live service. Do not add backend scaffolds
  or approve architecture/hosting/storage/provider choices without the linked ADR.
- Keep private mobile source and provisional salon assets in the private repository.
  Never substitute public Pages assets for the private Android variant.
- GitHub owns engineering status/source/docs/builds; Notion owns intent/business/
  pilots/decisions/support. Use actual links; preserve FEAT-01 through FEAT-50.
- PR validation has read-only permissions and no deployment secrets. Keep deployment
  separate. No production/store release, database, paid service or force push.
- Record version/tag, exact commits, artifact hash, platform, checks and target-build
  acceptance. Merge, release and customer resolution are distinct events.
