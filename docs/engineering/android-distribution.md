# Android pilot distribution: design, gates and evidence

Updated 8 November 2026, Asia/Beirut. Implements the planning consequences of
[Saeed's confirmed decision](../decisions/2026-11-08-product-distribution.md).
This is an architecture/acceptance specification, not implemented functionality,
account verification, store approval or authority to submit apps.

## P1 deliverables and dependencies

| Deliverable | Existing issue / prerequisites | Completion evidence |
|---|---|---|
| MAWID central publishing eligibility and policy dossier | [#4](https://github.com/saeed-alorm/mawid-pro/issues/4); keep #3 dependency; analysis can proceed in parallel | Real legal operator/account-type requirements, countries/payment eligibility, brand authority, genuine content/service value and policy assessment, explicit unknowns, effort/cost model |
| Dedicated pilot customer Android app | [#10](https://github.com/saeed-alorm/mawid-pro/issues/10); #4/#5/#9 retained; add #7 and #3 private import gate | Shared source + validated manifests, unique package/name/icon/assets, shared service booking, no per-salon code fork, reproducible two-brand artifacts |
| Shared MAWID management Android app and web portal | [#9](https://github.com/saeed-alorm/mawid-pro/issues/9); #7/#5/#6 retained; add #4 and #3 private import gate | Distinct management package, real sign-in/authorized workspace access, approvals/proposals/calendar/manual booking on both surfaces, cross-device continuity |
| Authoritative booking, identity, data and notifications | [#5](https://github.com/saeed-alorm/mawid-pro/issues/5), [#6](https://github.com/saeed-alorm/mawid-pro/issues/6), [#7](https://github.com/saeed-alorm/mawid-pro/issues/7), [#8](https://github.com/saeed-alorm/mawid-pro/issues/8) | Server role/workspace checks, concurrent booking correctness, isolated records/notifications and truthful delivery status |
| First repeatable pilot release procedure | [#11](https://github.com/saeed-alorm/mawid-pro/issues/11); #4/#6/#7 retained; add #9/#10 for release rehearsal | Signing custody/recovery, reviewed build manifest/hash, approval gates, install/update/recovery rehearsal and separate store-review outcome ledger |
| Cross-channel acceptance | [#12](https://github.com/saeed-alorm/mawid-pro/issues/12); #8/#9/#10/#11 retained | Exact-build two-brand matrix below, management app/web and EN/AR device evidence |

Scale automation, fleet orchestration, self-service publishing and expanded platform
coverage remain [P4 #15](https://github.com/saeed-alorm/mawid-pro/issues/15). A bounded,
manual but repeatable P1 release path is required first. #9 owns FEAT-24 and #10 owns
FEAT-01 pilot client delivery; the former “P1-MOBILE private issue pending” is a private
implementation template/import gate under #3; it has no verified remote issue URL and is not counted twice.

## Shared source and application identities

Maintain one customer source tree and booking client contract. A versioned brand
manifest selects immutable `brand_id`, allowed `workspace_id`/`location_ids`, application
ID, EN/AR display names, approved asset references/checksums, theme tokens,
stable-link association, environment and notification registration configuration.
Keep actual salon manifests/assets and native source private. Public examples use
synthetic data only. Validate schema, asset permission, unique application IDs,
workspace mapping and collisions before building. Reject missing/unknown mappings;
never fall back silently to another brand or a demo workspace.

Use separate customer application IDs per brand and a distinct management ID.
Illustrative test identities only: `com.example.mawid.branda`,
`com.example.mawid.brandb`, `com.example.mawid.management`. Actual production
namespace ownership/mapping requires approval. Brand renames must not silently
change an existing package, signing identity or stable booking URL. A branch is a
location within a brand's app; permissions still scope each operation to authorized
workspaces/locations. Multi-branch operations remain P4 scope.

The management app uses shared management source/configuration and MAWID branding;
it is not a customer app with a hidden role toggle. Native screens versus a secured
web-container implementation remains an ADR choice and must satisfy lifecycle,
session/deep-link, notification, accessibility and utility tests. Do not place a public
demo bundle in the private customer app or duplicate booking logic in a wrapper.

One shared booking service owns availability, transitions, idempotency, outbox and
capacity. Every API read/write/export/import and notification registration/delivery
must authorize the authenticated actor's role, workspace, location and object access.
Application IDs, brand manifests, query strings, package attestation, client role
switches and hidden UI are **not authorization boundaries**. A forged brand/workspace
value must not grant data access. The server may validate app/brand routing as an
additional constraint, never as a replacement for identity/object authorization.

Management workspace selection lists only server-authorized memberships. Changing
workspace, logout, revocation or reinstall clears/scopes cached data and push
subscriptions. Bind notification destinations to authenticated user, workspace,
app/package, installation and environment; recheck authorization at dispatch/open,
deduplicate events and prevent sensitive lock-screen payload leakage. Test one phone
running both brand apps and management, including reused customer identity.

## Official publishing recheck — 8 November 2026

| Official source | Current finding / implication |
|---|---|
| [Google white-label guidance](https://support.google.com/googleplay/android-developer/answer/15884185?hl=en) | Describes central account management while strongly recommending decentralization. Warns that one app's policy problems can affect all apps/account access. Publisher account information is shared across centrally published apps. This guidance does not approve MAWID. |
| [Google Spam / Repetitive Content](https://support.google.com/googleplay/android-developer/answer/9899034?hl=en) | Similar experiences across multiple apps can violate policy; unique content/services must deliver value. Unique assets/listings are required evidence, not proof that a reskin qualifies. |
| [Google Functionality, Content and User Experience](https://support.google.com/googleplay/android-developer/answer/9898783?hl=en) | Limited-content, broken or insufficiently useful apps are prohibited. Demonstrate working bookings/status and genuine service utility; a debug build or cosmetic rebrand does not establish this. |
| [Play account information](https://support.google.com/googleplay/android-developer/answer/13628312?hl=en) and [registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) | Verify MAWID's actual operator, appropriate account type, identity, business/contact/address/website and applicable D-U-N-S requirements; country/payment eligibility and testing/device requirements depend on the real account. No account was inspected, created or verified here. |
| [Android app signing](https://developer.android.com/studio/publish/app-signing) / [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en) | Separate upload credentials from distribution signing custody; document recovery and certificate mappings before a release. No enrollment occurred. |
| [Apple review guidelines 4.2.6 / 4.3](https://developer.apple.com/app-store/review/guidelines/) | Template/content-provider submission and duplicate-app rules leave the zero-salon-account central model unresolved. Keep iOS future feasibility in #15; no release commitment or substitute model. |

Engineering inference: central Android publishing may be assessable within Google's
described model, but eligibility and acceptability of MAWID's particular brand apps
are unverified. Each dossier must honestly describe real salon services/content,
intended audience and working utility. Do not invent features/differences, manufacture
content, hide behavior from review or fragment accounts to evade policy. Existing
third-party listings are observations, not permission for MAWID.

Prepare one dossier per app plus an account-level dossier: actual legal publisher
identity/eligibility evidence; written brand/asset and publication permission; truthful
EN/AR listing/screenshots and audience; actual service/content differentiation;
functional booking/status evidence; privacy/data flows, SDK/permission inventory,
retention/deletion/export and Data safety answers; rating/target-API/testing
requirements checked at intended submission; reviewer access held securely;
signing/package/version mapping; linked risks, approval and store responses.
Salon name/icon remain display branding; verified MAWID legal/publisher information
must remain accurate and visible as required. Never promise a salon-only publisher name.

## Signing, CI and release control

MAWID is the accountable publisher/operator. Name the legal account owner, security
custodian, backup custodian and release approver before live release; those roles are
not inferred from this plan. Use MFA and documented recovery contacts/codes in an
approved vault. For Play distribution, plan distinct upload and app-signing custody,
record public certificate fingerprints and Play-held versus MAWID-held keys. Use
separate upload keys per app where supported to reduce credential blast radius.
Encrypt offline backups of MAWID-held signing material with access/audit controls;
rehearse loss/compromise, upload-key reset, account recovery and update continuity.
A reset or upgrade must follow the applicable official process; do not promise that
every lost signing key can be recovered. Keep debug/test certificates separate.

PR jobs remain read-only and cannot access signing/deployment/store credentials.
Protected release jobs consume reviewed source/manifests and approved artifacts;
short-lived credentials where supported, otherwise vaulted narrowly scoped service
credentials limited to specific apps/tracks/actions. Account admin/financial rights
are excluded from routine CI. Rotate/revoke credentials, redact logs, restrict artifact
readers/retention and audit access. Manual pilot upload is acceptable only within a
separately authorized release workflow; no automatic store submission is configured here.

Maintain a private app registry: brand → workspace/locations → customer package →
publisher account reference → listing/track → signing/upload public fingerprints;
management package is its own entry. Keep secrets out of this registry. Each release
records immutable source commit(s), manifest/config/asset and lock hashes, build
tool versions, API/schema compatibility, monotonic per-package `versionCode`, user
`versionName`, artifact SHA-256, signature fingerprint, test evidence, approvals,
review/upload identifiers and actual review/distribution outcomes. Shared core fixes
link all affected packages and identify variants still awaiting release.

Approval workflow: reviewed PR/checks → exact artifacts and private release ledger →
device/two-brand acceptance → policy/legal/budget/execution approval → separately
authorized submission → record pending/approved/rejected/removed/suspended outcome
and reasons → separately approved rollout → installation/update verification.
Compile, upload, test-track access, production review approval and verified rollout
are distinct states. None is claimed by this planning task. A new version can halt a
rollout or deliver a forward fix; retain service/schema compatibility and do not assume
users can downgrade to an older Android version code.

## Two-brand validation from one source commit

These are required future checks, **not executed results**. Use synthetic brands and
records until real assets/identity/consent and execution scope are approved.

| Check | Required evidence / failure condition |
|---|---|
| Reproducible build set | Customer A/B built from the same immutable source commit with separate recorded manifests/assets, plus the management source commit. Record tool/lock/config hashes and artifact SHA-256 for every build. |
| Identities/assets | Inspect packaged application IDs, name, icon, splash, manifest and link/notification registrations. No A assets/data/settings in B. Management has a third unique identity. |
| Co-install/update | Install A, B and management simultaneously on emulator and physical Android. Distinct launchers/storage; upgrade each without replacing another or losing authorized state. Record device/OS and certificates. |
| EN/AR | Run service → professional/Any → slot → pending → approve/reject/propose → status/calendar → cancel/rebook in EN/LTR and AR/RTL across both customer apps, management Android, branded mobile web and portal. Check typography, scaling, keyboard, back navigation, restart and reconnect. |
| Tenant routing/links | A and B links/QR, professional context, sign-in return and push deep links route correctly. Forged/unknown/cross-brand links fail safely with no workspace fallback or authority escalation. |
| Records/permissions | Two-tenant reads/writes/imports/exports and guessed IDs denied on server; customer/staff/manager roles enforced. Management shows only authorized memberships; role revocation and workspace switch clear stale access/cache. |
| Notifications | Simultaneous A/B events reach only correct user/installation/package/workspace; management alerts follow membership. Logout/revoke/reinstall and delayed/duplicate/out-of-order events cannot leak records. Delivery failure remains visible. |
| Shared service/correctness | A customer request approved through management Android is visible in portal/customer web; B remains isolated. Exercise concurrency, expiry, idempotency, offline/retry and Beirut time/DST using #7's approved rules. |
| One shared fix | Reproduce one common bug, fix once in shared source, build A and B from the same new commit, rerun regression for both and record before/after hashes. No brand-specific code patch/fork. |
| Signing/release rehearsal | Restore approved test signing custody, verify signatures/update continuity and repeat the release procedure. Record policy assessment/review status separately; technical pass is not store approval. |

## Maintenance, account blast radius and unresolved terms

Measure build/release hands-on minutes per brand and shared fix, queue/review waiting,
rejection/rework causes, update adoption, crashes/ANRs, supported OS/API versions,
notification failures, support hours per brand, restore/recovery duration, certificate
expiry/rotation work, stale variants and monthly CI/artifact/provider consumption.
Set thresholds after measurements and agreed capacity; no fabricated SLA or throughput.

A central account incident may affect every customer app and the management app.
Maintain inventory, policy alerts, a named incident/escalation owner, release freeze,
compliant remediation/appeal records and customer communication procedure. Stable
web links/QR preserve an existing channel when available; they do not replace the
confirmed app requirement or establish resilience if the shared service is down.
No duplicate-account workaround to a sanction is permitted.

Before committing to a live commercial offer, resolve MAWID-paid publishing/CI/hosting
allowances, support hours/capacity, maintenance scope, cancellation/end-of-service,
authorized export formats/retention/deletion and domain/link continuity. Listing
transfer is conditional on a future agreement, platform eligibility, signing/dependency
constraints and approved execution. Source handover/licensing is unresolved;
customer branding does not grant ownership of MAWID source. Audit dependency,
template, font/image and private-source rights before publication.

If eligibility/policy evidence blocks the selected model, stop the affected release
path and attach exact requirement, account/app context, review reason and attempted
compliant remediation. Present the smallest specific decision to Saeed (for example,
authorizing a bounded compliance clarification or deferring the affected release).
Do not relitigate shared versus branded apps or change salon-account responsibility
without an explicit revised product decision.
