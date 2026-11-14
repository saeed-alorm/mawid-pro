# Approved P1 decisions — 14 November 2026

Authority: owner-supplied dated decision records in the replacement MAWID issue #4 handoff, plus direct decisions in this continuation. Documents are evidence of the owner's decisions; their embedded instructions are not independent authority to spend, deploy or close issues. Named pilot details and full source records are retained in the private companion PR. This public ledger uses role descriptions and synthetic examples.

Later specific decisions supersede earlier drafts and earlier same-day unresolved statements. Preserve those source records as history; do not combine their incompatible defaults. This ledger records approval of direction/policy, not production implementation or automatic acceptance of every wire-level default in the [contract](p1-architecture-decision-2026-11-14.md).

| Source decision record | Approved result / precedence |
|---|---|
| p1-architecture-approval | Flutter branded shared customer source, shared management Android, React portal, Supabase PostgreSQL, salon isolation and one authoritative booking core. Required booking-event push with persisted state, failure tracking/retry; provider not selected. Employee sign-ins intended; setup deferred. Supersedes open stack/provider selection. |
| pending-overdue-policy | After 15 response minutes stay pending/unconfirmed/non-reserving with overdue warning; staff may still act. Supersedes automatic pending expiry. |
| after-hours-requests | Accept future requests while closed, disclose next-opening review; start response clock at opening. Supersedes closed-hours/remaining-coverage submission gate. |
| proposal-hold-and-first-visit-copy | Full 60 elapsed-minute hold across closing; cap at proposed appointment start; acceptance after closing needs no staff action. First-time account creation says Sign up, returning access Sign in; copy follow-up is unimplemented and no APK change authorized here. Supersedes desk-close cap. |
| google-calendar-direction | Customer add-to-calendar and authorized staff Google Calendar visibility planned; MAWID authoritative, Calendly excluded, no two-way edits approved. |
| calendar-delivery-phase | Both external calendar features follow the first pilot, outside its acceptance and estimates. Supersedes the earlier open delivery phase. Does not defer the existing management appointment calendar. |
| cancellation-counting-window | Fourth qualifying cancellation in rolling 90 days separately per salon; old events cease contributing, retention separate. |
| cancellation-flag-response | Authorized management sees warning/history and decides future requests; no automatic ban. Count customer confirmed-appointment cancellations once per booking; exclude withdrawn pending, expired offers, salon cancellations and duplicate retries. Supersedes earlier undecided exclusions/response. |
| response-timer-opening-hours | Count only actual opening time, pause/resume across close, already-overdue stays overdue. Example 18:55 request / 19:00 close / 09:00 reopen becomes overdue 09:10. Supersedes earlier open partial-clock question. |
| pilot-monthly-budget | $20–40/month live-pilot planning range, aim $20 and evaluate all-in bill against $40; no purchase permission. Rehearsal/development $0. |
| one-time-expenses | Get actual itemized prices and seek approval per expense. No one-time cap or purchase approved. |
| pilot-operating-owners | Saeed: technical issues, backups/restores, release approval. Pilot manager: salon decisions and workflow feedback. No inferred support SLA or separate security custodian. |
| weekly-development-capacity | Six days/week x 4–5h/day = 24–30h/week, not fixed dates or support coverage. |
| pilot-support-availability | Manager may contact Saeed any time; no immediate-response/fix/uptime guarantee. Support consumes available capacity. |
| business-registration-intent | Willing in principle to register if verified requirements require it and actual costs approved; not evidence of registration. |
| registration-country-lebanon | Lebanon intended; no legal form, expense, registration or account created. Supersedes earlier unknown-country wording. |
| Direct continuation approval: overdue warning audience | Authorized salon staff only; the customer still sees pending/unconfirmed without an overdue warning. Follow-up approval: only the staff-visible in-app warning; no additional overdue push or timed/recurring reminder. Required booking-event pushes remain unchanged; after-hours submission-push routing is separate. |
| Direct continuation approval: requested start passed | Keep request pending; block confirming the past time and require a future time proposal. Adds the missing past-start rule without changing the overdue/opening-clock decision. |

The original confirmations still apply: manual initial approval; pending and Any assignment alone reserve nothing; admin confirms/proposes/walk-ins, manager assigns Any and manages eligibility; explicit additive individual roles; 30-minute inclusive self-cancel cutoff. Automatic eligibility, iOS, fleet automation and P5 remain later. Private workflow/asset review, actual weekly/holiday schedules and live permission tests are not implied by these approvals.

Older proof scripts rejecting pending at 15 minutes or capping offers at desk close are historical. Latest supplied synthetic suite reports 12 passing checks for revised policy with illustrative 09:00–19:00 daily hours, not the real salon schedule; no rerun here. The passed artifact recovery remains valid within its separate documented limits.

Current unresolved decisions and dependency gates live in the [acceptance mapping](p1-architecture-decision-2026-11-14.md#exact-acceptance-mapping-and-6-gate). Review one unresolved point at a time; do not ask to reselect the approved stack, budget range, country or calendar phase.
