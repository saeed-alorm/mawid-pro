# MAWID-owned Android publishing — feasibility dossier

14 November 2026, Asia/Beirut. Supports [#4](https://github.com/saeed-alorm/mawid-pro/issues/4) and preserves [the selected distribution model](../decisions/2026-11-08-product-distribution.md). This is completed documentary analysis with a conditional conclusion, not verified MAWID eligibility, legal advice, account approval or submission authority. No account, payment, APK change or store upload occurred.

## Finding and blocker

Google describes centralized white-label publishing, but recommends decentralization and warns of account-wide consequences. Therefore central MAWID publishing is a route to assess, not a blanket prohibition and not pre-approval of multiple salon apps. Shared code and different branding do not prove repetitive-content compliance. The selected zero-salon-store-account direction is retained; no silent switch to a shared customer app, salon accounts or duplicate publisher accounts.

Actual operator/account eligibility and genuine per-brand utility/rights evidence remain unresolved. The owner supplied a dated 9 November report that no legal registration or Play Console account existed; no later registration is assumed. Legal/operator documents and named pilot details stay private. Until an eligible operator path and sufficient rights/utility assessment are approved, #4's publishing criterion remains conditional and cannot be checked complete. Actual store review belongs to a later separately authorized release; it cannot be promised by architecture approval.

## Official sources rechecked 14 November

| Source | Finding and MAWID action |
|---|---|
| [Country eligibility](https://support.google.com/googleplay/android-developer/answer/9306917?hl=en) | Lebanon is listed for developer registration. Location eligibility does not verify this operator, identity or payment method. |
| [Account type](https://support.google.com/googleplay/android-developer/answer/13634885?hl=en) | Google directs business/professional use toward organization accounts. Recommend the truthful organization/operator route; do not choose personal status to bypass business verification. |
| [Required account information](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en) | Organization/legal and payments-profile details, contacts, website and applicable D-U-N-S verification must align. Direct D-U-N-S application is free; actual operator evidence is missing. Do not invent registration or an exemption. |
| [White-label guidance](https://support.google.com/googleplay/android-developer/answer/15884185?hl=en) | Central account operation is described, with strong preference for decentralized accounts and shared account/publisher risk. Record the selected central model's incident/blast-radius acceptance explicitly. |
| [Repetitive content](https://support.google.com/googleplay/android-developer/answer/9899034?hl=en) | Genuine unique services/content and user value must distinguish apps. Cosmetic names/icons or invented differences cannot establish compliance. |
| [Functionality/utility](https://support.google.com/googleplay/android-developer/answer/9898783?hl=en) | Demonstrate a stable useful booking/status/cancellation experience; static/broken/limited apps are unacceptable. Current demo functionality does not prove a live per-brand service. |
| [Registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) | $25 one-time fee and verification/testing requirements are separate from build success. No payment or enrollment approved. Recheck account-specific testing/device requirements at intended release. |
| [Play signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en) | Distinguish app-signing and upload keys, fingerprint registration and recovery/reset procedures. Existing debug signing is not release custody. |

## Required private account/app dossier

Account: real operator/legal authority, country/payment/account-type evidence, organization/website/contact verification route, D-U-N-S or officially accepted alternative where applicable, budget authority, security/backup custodians, MFA/recovery references in vault, account-wide policy risk acceptance. No passwords, IDs or recovery codes in GitHub issues.

Per brand: written asset and publication authority, real services/staff/catalog and intended audience, permission for website/WebView content if relevant, meaningful useful booking/status/cancellation flows, honest EN/AR listing/screenshots, privacy/data-flow and SDK/permission inventory, deletion/export/retention policy, reviewer access process, current rating/target API/testing checklist, and package/manifest/signing registry. Brand display name never replaces required truthful publisher identity. A fictional second brand is a technical acceptance fixture, never a candidate listing or fabricated customer.

Record evidence location, owner, date, approving person and unresolved condition for each field. Existing unapproved prototype art or inferred manager consent is insufficient. No substantive utility/sign-off claim is made until the real workflow review happens. A successful first app review would not guarantee later variants.

## Bounded manual P1 release procedure (design only)

1. Approve account/operator, rights/utility/policy dossier, one-time/recurring budget and release authority. If eligibility fails, stop dependent publishing work and ask for the smallest decision tied to exact evidence; preserve the product direction until changed explicitly.
2. Build synthetic customer A/B from one immutable source with distinct manifests/packages; management app has its own identity. Record source/lock/asset/config hashes, tool versions, monotonic per-package versionCode, versionName, artifact SHA-256 and public certificate fingerprint. Do not produce new artifacts in this task.
3. Review exact-build EN/AR, install/update, management Android+portal, shared-fix rebuild, server/record/cache/link/push isolation, offline/retry and capacity checks per [Android acceptance](android-distribution.md). Imported/merged debug source alone is insufficient.
4. Name upload-key, account and backup custodians. Keep keys encrypted in approved custody and out of PR jobs; test approved key/account recovery and update continuity separately. Use read-only PR checks and a separately authorized release process. Public fingerprints and secret references are registry data, not keys.
5. Obtain release approval after policy/privacy/Data safety/deletion/reviewer-access/target API/testing checks on the intended account. Manual reviewed upload is acceptable for the first pilot only after separate authorization. Record track/upload/review references and outcomes, including rejection reasons.
6. Separately approve rollout, verify install/update on actual devices and record support/rollback/forward-fix plan. Do not assume Android downgrade works or that upload equals review approval. Account incident procedure freezes release, inventories affected apps, follows compliant remediation/appeal, not evasion, and communicates through existing authorized channels.

Approval of this procedure does not execute it. Signing/release ownership and incident support remain decisions. Bounded initial publishing feasibility stays P1; automation and iOS remain later. Source licensing, commercial cancellation/export, conditional listing transfers and source handover need explicit terms; no automatic transfer promised.

## Closure evidence still needed

Saeed must identify the real operator route, approve the evidence-based conditional assessment and central-account risk, and record the genuine rights/utility/workflow review and exact unresolved eligibility conditions. If those remain unavailable, leave #4 open with this blocker. No new account or store submission is necessary merely to document a truthful conditional decision; unresolved facts cannot be converted to a passed eligibility check by approving the document.
