# Product distribution decision — 8 November 2026

Status: **Confirmed product direction; technical feasibility and store outcomes unverified.**
Decision owner/source: Saeed's direct instruction in this MAWID engineering-plan
update conversation on 8 November 2026, Asia/Beirut. The instruction explicitly
identifies the direction as agreed in the latest conversation. This document does
not assert that the earlier conversation was independently retrieved.

The six confirmed distribution requirements are recorded in [PRODUCT.md](../../PRODUCT.md).
Dedicated brand customer Android apps, zero salon store-account work, and shared
management Android plus web from the first pilot are binding planning inputs.
One customer app per brand with branches sharing it is a working assumption;
it does not bring full multi-branch operations forward from P4.

## Consequences and engineering ownership

| Record | Updated responsibility |
|---|---|
| [P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4) | Include all three pilot surfaces; assess MAWID-owned Android publishing eligibility/policy and first repeatable release path now. Stack, capacity policy, budget and execution approvals remain open. |
| [P1-WEB #9](https://github.com/saeed-alorm/mawid-pro/issues/9) / FEAT-24 | Reuse the existing staff-workspace issue for the shared management Android app and web portal. Its previous scope covered staff workspace but did not explicitly require a standalone management app. Expand it rather than duplicate it. |
| [P1-BRAND #10](https://github.com/saeed-alorm/mawid-pro/issues/10) / FEAT-01 | Own pilot customer Android integration/brand manifests and distinct packages alongside existing branding/links/QR. Retain private source/import gate in #3; do not create a fictitious private issue URL. |
| [P1-OPS #11](https://github.com/saeed-alorm/mawid-pro/issues/11) | Signing/recovery, release ledger, least-privilege CI and first repeatable pilot release procedure; execution separately authorized. |
| [P1-ACCEPT #12](https://github.com/saeed-alorm/mawid-pro/issues/12) | Two customer brands from one source commit, management app plus portal, isolation and shared-fix rebuild evidence. |
| [P4 #15](https://github.com/saeed-alorm/mawid-pro/issues/15) | Fleet/scale publishing automation and future iOS feasibility work. Initial central Android feasibility is a P1 gate, not deferred to P4. |

The 14 existing engineering issues #3–#16 are reused, with their existing dependencies
and historical work preserved. No new management issue is needed. No issue is
closed/reopened and no completed implementation is invalidated by updating the plan.
PR17 remains open and unmerged; document updates are reviewed there.

## Feasibility boundary

Official Google policies/guidance were rechecked on **8 November 2026**; sources and
implications are in [Android distribution](../engineering/android-distribution.md).
Central publishing is described in Google's white-label guidance, but it is not an
eligibility promise or exemption from repetitive-content/utility rules. Branding and
unique package IDs alone do not prove unique value. No fabricated differentiation,
review-only behavior or account fragmentation is permitted.

Apple 4.2.6 and 4.3 leave zero-salon-account central template publishing unresolved.
The existing [P4 issue #15](https://github.com/saeed-alorm/mawid-pro/issues/15) tracks
future feasibility, without an iOS release or a fallback distribution model being approved.

## Pending decisions and records

MAWID legal publisher/account eligibility, genuine per-brand service/content evidence,
policy review outcomes, stack/provider, booking capacity/expiry, notification channel,
support capacity, cash ceiling and engineering capacity remain open. Commercial
cancellation/export terms, any conditional listing transfer, source handover/licensing
require separate agreement; none follows automatically from salon branding.

Initial Notion attempts returned no records / HQ 404; those failures are historical.
On 8 November 2026 the MAWID-specific connection restored access. The [confirmed Notion decision](https://www.notion.so/412f53c2a11d818cbeb7e4307356bef8)
is now saved under [MAWID HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea),
and HQ's current direction and engineering links were updated. No separate
FEAT-01/FEAT-24 pages or Decisions database were found, so their traceability is
captured in the decision and HQ without duplicating trackers.
The [prepared packet](../engineering/notion-distribution-update-pending.md) is now
marked applied; no account, release or technical acceptance outcome is implied.
