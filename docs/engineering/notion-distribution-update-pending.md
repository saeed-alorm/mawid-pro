# Pending Notion update — not saved

Prepared 8 November 2026, Asia/Beirut. Notion search returned no MAWID records;
the known [MAWID HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea)
returned `object_not_found` (404). No decision/feature/HQ page was created or edited.
The user-supplied direct app.notion.com HQ link was also retried on 8 November and returned the same 404; the connected Notion workspace could not access this target.
Do not create a substitute HQ in another workspace. Apply the following exact content
under the existing HQ decisions area once access is available; use real page IDs.

## Decision page content to save

**Title:** Product distribution — confirmed 8 November 2026

**Status:** Confirmed product direction. Technical feasibility and store outcomes unverified.

**Confirmed date:** 8 November 2026 (Asia/Beirut).

**Decision owner:** Saeed.

**Source:** Saeed's direct instruction in the MAWID engineering-plan update conversation
on 8 November 2026, beginning “Update the existing MAWID engineering plan to reflect
Saeed's confirmed product distribution decision dated 8 November 2026.” The instruction
states this is an agreed direction from the latest conversation. No earlier transcript
or separate accompanying decision/PRODUCT file was independently retrieved.

| Requirement | Confirmed direction |
|---|---|
| Customer Android | Dedicated salon-branded customer app: salon name/icon, separate listing and application identity. |
| Publishing operations | MAWID owns/operates the publishing accounts and handles publishing, releases, updates and maintenance. Zero salon involvement in registering, paying for or operating developer/store accounts. |
| Management from pilot one | One shared MAWID management Android app plus a web management portal; owners/staff sign in to their authorized workspace. |
| Shared foundation | Shared source/configuration and booking core, no independent code fork per salon. Preserve branded mobile web, stable links/QR, manual approval, EN/AR/RTL and other agreed decisions. |
| Platforms | Android first. iOS is future feasibility, not a committed release. Shared-MAWID-customer-app and salon-owned-publishing recommendations were not adopted. |
| Brand/branch assumption | One customer app per salon brand; branches can share it. Full multi-branch operations remain P4. |

This decision takes precedence over older setup recommendations without altering
historical facts or proving policy eligibility. Separate salon display branding from
MAWID's real verified legal/publisher identity. Onboarding can request asset/brand
permission and business facts, but cannot depend on salon store-account work.
MAWID cash costs need approved budget. No paid enrollment, store submission,
infrastructure deployment, listing transfer or source handover is approved here.

## Engineering impact to append to the existing plan

| Existing record | Exact scope update |
|---|---|
| [P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4) | Scope customer Android, shared management Android and portal explicitly. Put central Android legal/account eligibility, official repetitive-content/utility assessment, account-wide consequences and first repeatable pilot release path in P1. Stack/provider/capacity/budget decisions remain open. |
| [P1-WEB #9](https://github.com/saeed-alorm/mawid-pro/issues/9) / FEAT-24 | Require shared management Android plus portal from first pilot, distinct management package and server workspace/role permissions. Reuse existing staff-workspace issue; no new management issue. |
| [P1-BRAND #10](https://github.com/saeed-alorm/mawid-pro/issues/10) / FEAT-01 | Track pilot customer Android/shared source integration and brand manifests/packages, plus existing stable links/QR. Private P1-MOBILE template/import gate remains under #3, without a fabricated private issue URL. |
| [P1-IDENTITY #5](https://github.com/saeed-alorm/mawid-pro/issues/5) / [P1-NOTIFY #8](https://github.com/saeed-alorm/mawid-pro/issues/8) | Server permissions and user/workspace/package/installation notification isolation; client configuration is not authorization. |
| [P1-OPS #11](https://github.com/saeed-alorm/mawid-pro/issues/11) | Signing custody/recovery, least-privilege CI, private app registry, versions/build hashes, approvals, separate review outcomes, maintenance and account incident procedure. |
| [P1-ACCEPT #12](https://github.com/saeed-alorm/mawid-pro/issues/12) | Two customer brands built from one source commit, distinct assets/identities, co-installation, EN/AR, routing, isolated records/notifications and one shared fix rebuilt for both; management Android and portal included. These validations remain unrun. |
| [P4 #15](https://github.com/saeed-alorm/mawid-pro/issues/15) | Fleet automation/scale and future iOS feasibility. Initial Android publishing feasibility is not deferred. Apple 4.2.6/4.3 leave the central zero-salon-account template model unresolved. |

Preliminary revised effort: baseline **55–92 focused engineer-days / 330–552 hours**;
with 25–35% uncertainty rounded outward **69–125 days / 414–750 hours**.
One day = 6 focused hours. Estimate includes bounded pilot release preparation,
shared management Android and two-brand validation; excludes external review waits,
unbounded compliance rework, iOS and fleet automation. Saeed capacity/rate/estimate
validation and cash ceiling remain open; there is no delivery date or approved cash
budget. Google currently lists a US$25 one-time registration fee if a new eligible
account is needed; no purchase/enrollment is authorized. Other costs require real
vendor/account and maintenance measurements.

Official Google guidance describes central white-label accounts but warns about
account-wide consequences and strongly recommends decentralization. That is policy
evidence, not an adopted MAWID distribution alternative. Repetitive-content and utility
rules still apply; cosmetic branding/package identity alone does not prove eligibility.
Do not fabricate differentiation, evade rules using fragmented accounts, or interpret
a build/test upload as store approval. If concrete evidence blocks the selected model,
present the smallest necessary decision before affected implementation.

Keep commercial pricing/allowances, cancellation/export/retention terms, conditional
transfers, source licensing and support capacity unresolved and visible. No automatic
listing transfer/source handover follows from this decision.

Engineering records:

- [PR17 — open, not merged](https://github.com/saeed-alorm/mawid-pro/pull/17)
- [Product direction](https://github.com/saeed-alorm/mawid-pro/blob/codex/github-readiness-2026-11-07/PRODUCT.md)
- [Decision record](https://github.com/saeed-alorm/mawid-pro/blob/codex/github-readiness-2026-11-07/docs/decisions/2026-11-08-product-distribution.md)
- [Architecture and revised estimate](https://github.com/saeed-alorm/mawid-pro/blob/codex/github-readiness-2026-11-07/docs/engineering/p1-architecture-analysis.md)
- [Android design, official policy sources and validation](https://github.com/saeed-alorm/mawid-pro/blob/codex/github-readiness-2026-11-07/docs/engineering/android-distribution.md)
- [FEAT traceability](https://github.com/saeed-alorm/mawid-pro/blob/codex/github-readiness-2026-11-07/docs/engineering/feature-index.md)

Immediate next engineering task: #4's MAWID-owned account/policy dossier and
brand/package/server-authorization contract with synthetic A/B fixtures, alongside
booking capacity decisions and estimate validation. This task does not authorize
account creation, store submission or deployment.

## Reciprocal updates after access returns

1. Fetch existing HQ, decision area and real FEAT-01/FEAT-24/plan records; preserve
   previous decisions and dated evidence. Create this decision only if no matching
   confirmed 8 November decision already exists; otherwise update that record.
2. Add its actual URL/date/source to HQ and the existing plan; update FEAT-01 and
   FEAT-24 scope and links using the table above. Keep engineering status in GitHub.
3. Add actual Notion decision/feature URLs back to PRODUCT, decision/architecture/
   traceability docs and affected GitHub issues through a reviewed PR. Link those
   GitHub records from Notion. Do not guess IDs, dates, page properties or assignees.
4. Verify saved content/links, then mark this pending packet applied with real page
   URLs. Until then it remains **not saved in Notion**.
