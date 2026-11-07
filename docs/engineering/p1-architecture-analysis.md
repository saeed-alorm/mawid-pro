# P1 architecture and feasibility analysis — draft for decisions

Prepared 7 November 2026, Asia/Beirut. Analysis started for [P1-ARCH #4](https://github.com/saeed-alorm/mawid-pro/issues/4); this is not an approved ADR, implementation commitment, spending authorization or deployment plan.

Saeed (`saeed-alorm`) leads engineering. Rabeeh/Rabih Bou Diab is a partner: this document requests his input without assigning him a product role or GitHub identity. Product intent/decisions belong in [Notion HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea); engineering evidence remains in GitHub. No feature-level Notion link has been verified.

The existing dependency on [ENG-SETUP #3](https://github.com/saeed-alorm/mawid-pro/issues/3) is preserved. The user's continuation instruction authorizes analysis now, in parallel with readiness. Emulator/physical acceptance and optional account enforcement do not block this decision work. Implementation still requires the relevant architecture, capacity, budget and permission decisions; this analysis does not close any readiness or P1 acceptance gate.

## Confirmed scope and open assumptions

Android is prioritized, retaining branded mobile web, stable shop/professional links and QR, and the staff workspace. All channels must ultimately use one booking core. Initial approval is manual. The present demos use local data and simulated identity; their bridge is not a production API. Three pilot shops and two paid discussions are targets, not customers or revenue evidence. iOS timing, member/regular auto-approval eligibility, mass publishing, payments/POS/commerce and inventory are outside initial commitments.

For sizing only, use the following deliberately revisable workload. None is observed demand:

| Input | Illustrative planning case | Evidence needed |
|---|---:|---|
| Shops / professionals | 3 / 12 total | Pilot discovery; selected shops are unconfirmed |
| Bookings | 30 per shop per day × 30 days = 2,700/month | Requests, approvals, walk-ins, durations and no-shows measured separately |
| Customer journeys | 3 browsing journeys per booking; 20 dynamic reads/journey = 162,000 reads/month | Instrument the actual future flow; exclude static assets |
| Staff refresh | 12 sessions × 8 hours × 26 days, polling every 30 sec = 299,520 calls/month | Active sessions, required freshness, hidden-tab/backoff behavior |
| Aggregate API traffic | About 500,000 calls/month, rounded scenario | Benchmark complete authorization/query path; API calls are not database rows scanned |
| Mutation pressure | Scenario: 10 writes/minute at a busy instant, including simultaneous requests for one slot | Parallel race tests matter more than average request volume |
| Storage / egress | Scenario ceilings: 1 GB booking/event data; 5 GB monthly transfer | Retention, indexes, logs, export size, images and backups measured separately |

Polling can dominate even a small pilot. Compare bounded polling with event-driven refresh after defining freshness; neither client refresh nor realtime delivery can be the authority for accepting a booking. Test Lebanon mobile-network latency and reconnect behavior against the actual selected region. No region/residency decision is made here.

## Alternatives to evaluate

The client decision and service/storage decision are separate. Retaining Flutter native customer screens plus an embedded staff web view may reduce initial rewrite, but creates session, lifecycle and bridge compatibility work. Flutter-native customer plus independently hosted responsive React staff/customer web keeps the channels explicit, but requires maintaining equivalent behavior in both clients. Both can meet Android priority with one service contract. Do not use client architecture to duplicate booking rules or assume the existing WebView bridge is a trusted authorization boundary.

| Service/storage route | Value to test | Cost/operating trade-off | Approval experiment |
|---|---|---|---|
| A. Managed Postgres/Auth/functions, e.g. Supabase | One transactional relational store and managed identity can reduce initial integration work; booking writes still pass through a domain transaction, not arbitrary client table updates | Provider-specific auth/function coupling; tenant policies and privileged server paths require negative tests; restore/export and cost limits must be checked | Prove tenant isolation, concurrent slot acceptance, retry semantics, identity/provider flow and recoverable export in an isolated, separately authorized experiment |
| B. Explicit API service + managed Postgres, e.g. Render | Clear domain boundary, portable service code, conventional transaction/outbox worker choices; identity provider can be selected separately | More components, patches, jobs, connection management and monitoring; cheap instance size does not prove sufficient capacity | Benchmark the same contract/race/isolation suite; measure cold/steady latency, memory, connection use and restore procedure |
| C. Worker API + serverless SQLite, e.g. Cloudflare Workers/D1 | Low fixed platform cost and usage-based scaling; alternative to committing Postgres before testing needs | Different transaction/constraint semantics; identity is separate; Any-professional allocation and atomic multi-step rules need a feasibility proof; provider-specific query/billing model | Demonstrate all invariants under parallel requests before shortlisting; reject if workarounds compromise correctness or maintainability |

**Working recommendation, awaiting decision:** evaluate A and B first against one common contract and race suite; compare C only if its lower fixed bill justifies the extra correctness/portability investigation. This is engineering judgment, not approval of Flutter + React, Postgres, managed hosting, a provider, or any infrastructure creation. The retained Nitro build target in PR17 is compatibility evidence only.

## Hosting cost model — USD/month, before tax

Official list prices were retrieved on 7 November 2026. These are planning inputs, not quotes or approved purchases. Account eligibility, actual billing setup, regional availability and provider terms must be checked at selection. Do not add paid plans merely to satisfy a checklist.

| Candidate configuration | List-price subtotal to compare | What the subtotal leaves out |
|---|---:|---|
| A: Supabase Pro, one included Micro project | $25 | Messaging/phone verification, domain, independent backup/restore, optional monitoring and overages |
| A: same organization with one additional Micro staging project | Approximately $35 total ($25 + $10 additional project), before extra usage | Separate environment does not mean additional free compute credits per project |
| B: one Render 512 MB API + smallest paid 256 MB Postgres | $7 + $6 = $13 | This is a price floor, not a validated production/pilot sizing; identity and async notification processing remain to be designed |
| B: API + 1 GB Postgres; optional separate small worker | $7 + $19 = $26; with $7 worker, $33 | Separate staging may add another stack; workspace tier/features, transfer, disk and auth are separate |
| C: Workers Paid + D1 within included usage | $5 platform floor | Identity, notifications, object storage/backup, observability and any above-included use; no inference of equivalent transaction capabilities |

Supabase publishes a $25 Pro floor, one included project, $10/month compute credits covering one Micro, and extra projects from $10. Its free offering includes 500 MB database and may pause after a week of inactivity; free eligibility does not establish pilot reliability. [Pricing](https://supabase.com/pricing). Its Spend Cap excludes compute and several opt-in items, so it is **not an all-cost hard cap**. [Cost-control scope](https://supabase.com/docs/guides/platform/cost-control).

Render's current pricing distinguishes workspace subscription, service compute and metered usage. The API and database inputs above come from the official pricing tables; the 1 GB database is a sizing alternative, not a chosen requirement. [Pricing](https://render.com/pricing). Free web instances spin down and free Postgres expires after 30 days, so this analysis does not use them as dependable live-core assumptions. [Free-instance limitations](https://render.com/docs/free).

Workers Paid has a $5 monthly minimum with request/CPU inclusions and overage rates; D1 bills rows scanned/written and storage. At the illustrative traffic, cost still depends on measured CPU and query plans, not API-call count alone. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). CPU limits reduce one risk but do not constitute an account-wide cash cap.

Use this model rather than treating the subtotal as total cost:

`Monthly cash = hosting + extra environments + database/storage/egress overages + identity verification + transactional messaging/retries + domain/12 + independent backup + monitoring + build/artifact usage + tax/FX.`

`Monthly operating effort = deployment/patching + onboarding/import + support + incident/recovery drills + billing review.`

Budget GitHub private CI separately from product hosting; inspect the actual included allowance and retain a paid-usage hard stop. No paid CI was approved. Domains, notification channels and service vendors remain unselected. Existing free allowances or marketing credits are not contracted reliability.

**Messaging sensitivity, not a provider quote:** 2 notification attempts per booking × 2,700 × 1.10 retry factor = 5,940; plus 800 verification attempts × 1.20 = 960; total 6,900 illustrative billed-attempt equivalents. At invented sensitivity rates of $0.01 / $0.05 / $0.10, variable cost would be $69 / $345 / $690. Actual SMS segments, verification fees, failed-attempt charging, Lebanon routing/sender approval and WhatsApp template categories may change the units and price. Obtain an explicit Lebanon-capable provider quote before choosing real phone identity or a transactional channel. This example shows why messaging/support can dominate a $5–$35 hosting floor.

Set a total cash ceiling and a separate incident reserve before provisioning. For each chosen supplier, record alert thresholds, genuine stop controls, the action taken at the ceiling, and which costs cannot be hard-capped. Service denial at a cap must be an explicit operational trade-off, not an accidental customer experience.

## Booking invariants and decision questions

The shared service—not localStorage, a client lock, a realtime stream or a WebView bridge—must authorize and serialize state changes. These are proposed invariants for review, not implemented architecture:

| Decision | Choices to resolve | Required race/failure test |
|---|---|---|
| Pending capacity | Hold a real staff resource until expiry; or accept non-reserving requests with explicit customer wording and revalidate at approval | Two customers request the same interval; prove the permitted number of approvals and truthful pending state |
| Any professional | Tentatively allocate an internal eligible professional, or maintain an explicitly defined pool/capacity policy | Concurrent Any plus named-professional requests; different service qualifications and absences must not oversell the eligible set |
| Proposed time | Hold old slot, new slot, both temporarily, or neither; define who accepts and expiry | Two customers accept the same alternative; acceptance/expiry/cancellation race; old capacity released atomically |
| Holds and expiry | Duration, renewal, staff override, customer notice and cleanup responsibility | Expiry must be checked inside the authoritative transaction, not trusted to a delayed cleanup job |
| Approval/cancellation | Who can transition each state; cutoffs; cancellation vs reschedule/rebook; completion/no-show ownership | Reject stale versions and invalid/duplicate terminal transitions with useful conflicts |
| Availability | Service duration/buffers, slot granularity, working hours, breaks, absence, staff qualification and overrides | Appointment crosses a break/closing; schedule changes between availability read and submit |
| Time | UTC instants plus IANA `Asia/Beirut`; local recurring working hours; explicit DST-gap/fold input policy | Midnight, DST nonexistent/ambiguous local times, timezone offset changes and reconnect from a device in another zone |

Proposed transaction boundary: identify tenant/actor, enforce permission, validate version/idempotency, expire/re-evaluate relevant holds, reserve/release the actual capacity, persist state/event and notification outbox, then commit. No provider network call should be necessary inside that transaction. A failed notification does not undo a committed appointment; failure must be visible and retryable. Same idempotency key plus same payload returns the recorded outcome; reuse with a different payload must fail. Scope keys to tenant/actor/operation and define retention rather than assuming a global key.

If Postgres is chosen, evaluate range/exclusion constraints for overlapping assigned resources and transaction isolation/locking with bounded retries. A simplistic uniqueness check on start time misses duration overlaps, and an unassigned Any record does not reserve an eligible professional. If serverless SQLite is chosen, prove equivalent atomic conditional writes/batches rather than porting Postgres assumptions. These are candidate mechanisms; no schema/provider is selected. [Postgres constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

For tenant isolation, test every read, mutation, export and privileged server operation with two tenants and guessed IDs. Managed row policies can add defense, but an unrestricted service credential or unscoped server query can bypass client-facing assumptions; never ship privileged credentials to a client. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Organization and location should be modeled separately for future expansion; operating multiple branches remains later scope.

## Contract and evidence to draft before implementation

Specify tenant/location identifiers, customer/staff role/session semantics, service/staff identifiers, local schedule versus instant representation, transition/version model, idempotency scope, permission and conflict errors, pagination and minimal event schema. Define customer polling/update behavior and the supported API/bridge version boundary. Keep demo mode conspicuous and separate from live identity. Do not expose a public external Booking API merely because P1 needs an internal contract.

The architecture decision should attach evidence from synthetic concurrent-request tests, tenant-isolation tests, Beirut-time fixtures, API-client contract tests, notification timeout/retry simulations, backup/export/restore and a cost worksheet. Benchmarks need representative durations/resources and approved policy; 2,700 bookings/month alone cannot validate correctness or capacity. A physical/emulator rehearsal is later target-build evidence and does not prevent drafting these alternatives now.

## Effort ranges for estimation discussion

Engineer-day means **6 focused engineering hours**, excluding meetings, blocked approvals and recurring support. Ranges assume one shared service, one transactional notification channel, synthetic fixtures, existing demo/client reuse, no payment/iOS/store publishing, and an approved scope. These are preliminary engineering estimates, not dates, commitments or a statement of Saeed's available capacity.

| Existing work package | Focused engineer-days |
|---|---:|
| [#4 Architecture, cost/policy ADR and targeted feasibility](https://github.com/saeed-alorm/mawid-pro/issues/4) | 2–4 |
| [#5 Real identity and permission matrix](https://github.com/saeed-alorm/mawid-pro/issues/5) | 4–7 |
| [#6 Persistent data, isolation, migration/import](https://github.com/saeed-alorm/mawid-pro/issues/6) | 4–7 |
| [#7 Availability, transitions, concurrency/idempotency](https://github.com/saeed-alorm/mawid-pro/issues/7) | 7–12 |
| [#8 Notification channel, outbox/failures](https://github.com/saeed-alorm/mawid-pro/issues/8) | 4–7 |
| P1-MOBILE shared-service integration (private issue pending import) | 6–10 |
| [#9 Mobile web/staff integration](https://github.com/saeed-alorm/mawid-pro/issues/9) | 5–8 |
| [#10 Controlled branding/stable links/QR](https://github.com/saeed-alorm/mawid-pro/issues/10) | 3–5 |
| [#11 Deployment, monitoring, restore/rollback preparation](https://github.com/saeed-alorm/mawid-pro/issues/11) | 4–7 |
| [#12 Bilingual cross-channel acceptance/defect correction](https://github.com/saeed-alorm/mawid-pro/issues/12) | 5–9 |
| **Baseline effort sum** | **44–76 days / 264–456 hours** |
| **Planning envelope with 25–35% uncertainty** | **55–103 days / approximately 330–618 hours** |

Do not add contingency twice when refining work packages. Available focused hours/week `H` would turn the envelope into roughly `330/H` to `618/H` weeks, **plus external waiting and support**; `H` is presently unknown. The total is not a delivery date. Baseline work is not fully parallelizable: identity/data/booking contract decisions constrain client/notification acceptance. Re-estimate after the feasibility spike and pilot workflow discovery; explicit native redesign or source repair can widen the range.

## Decision requests for Saeed and Rabeeh

| Request | Decision/evidence sought | Who can resolve it |
|---|---|---|
| Budget and capacity | Cash ceiling, reserve, available focused hours/week and review trigger; no new date inferred from 6 November | Saeed/Rabeeh discussion; name the person authorized to approve spending |
| Approval/capacity policy | Pending/Any/proposed holds, expiry, assignment, cutoffs and override rules, tested against a representative shop day | Saeed/Rabeeh with actual shop workflow input; product acceptance owner remains to be named |
| Architecture shortlist | Authorize A/B comparison and whether C merits a bounded feasibility investigation; choose after evidence | Saeed engineering recommendation; agreed decision authority to be recorded |
| Identity/notification | Real customer verification method, staff onboarding/recovery, one Lebanon-capable channel/fallback, provider quote and consent/retention requirements | Named commercial/product decision owner plus Saeed technical evaluation; do not infer Rabeeh's role |
| Operating responsibility | Alert/backup/restore/support owner, realistic support hours, recovery objective and release/rollback authority | Explicitly assign before a live trial; not automatically Saeed's unlimited on-call responsibility |
| Pilot gate | Confirm whether any shop has actually committed, asset permissions, two-device acceptance owner and paid-discussion evidence | Business/pilot owner to be assigned in Notion |

Next step for #4: review the planning assumptions and the five most consequential policy choices (pending capacity, Any assignment, proposal holds, expiry, cancellation cutoffs), record decisions/owners, then approve a bounded feasibility experiment and cost ceiling. No deployment, schema provisioning, provider subscription or production identity switch is authorized by this draft.
