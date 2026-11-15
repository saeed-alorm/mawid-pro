Title: Connect development booking clients to the authoritative booking core

The customer and staff forms previously wrote only device-local demo records.
Explicit development mode now reads authorized catalogs, availability, bookings
and versions from the existing core. Customer requests, manager assignment,
admin decisions/proposals, withdrawal, cancellation/rebooking and staff-created
appointments all use the same atomic booking operations. No second engine is added.

Uncertain submissions retain the exact operation UUID/body/version before transport
and remain visibly unconfirmed. Retry replays that intent. Definitive conflicts
refresh current state; revocation clears cached records. The inbox reports delivery
status independently of booking state. Closed-hours and overdue policies are unchanged.

Depends on draft #24; this PR deliberately targets `codex/issue8-fcm-outbox`.
The private Android companion targets `codex/issue8-android-fcm` (private draft #3).
Refs #7; do not close it. Real authentication #5 is still required before pilot use.

Validation: seven actual connected-form checks in independent local Playwright
clients with disposable PostgreSQL and explicit simulated notifications, including
request → staff inbox → assignment → confirmation → customer state/notification,
lost acknowledgement, duplicate prevention, offline retry, stale conflict,
closed-hours delivery and revoked access. All 16 local regression commands pass,
including the 23 booking scenarios, 13 notification integration checks, 26 web
tests, lint/types, normal/Pages builds and browser checks. Exact evidence is in
`database/booking-client-verification.json` and the adjacent regression record.

The private final 0.4.1+6 APK was built, signature/bundle verified and installed
on BBB100_2/API27 and the recovered API35 emulator. Its actual physical customer
form created Pending v1 and staff inbox entries. On the earlier 0.4.0+5 artifact,
actual native customer/staff forms completed Pending v1 → Confirmed v2 and the
customer's in-app notification open persisted. API35 permission denial/restoration
was observed on that earlier build. Emulator FCM registration reports
AUTHENTICATION_FAILED. Final physical FCM delivery/opening and terminated-process
acceptance remain pending USB/operator access; #7 is not accepted or closed.

After self-review, authorization failures retain uncertain retry keys and journals
are isolated by actor/workspace/location. The nine affected checks passed after
this fix; one connected-UI attempt hit a local proxy 502 before its successful
seven-scenario rerun. #7 remote CI is unrun on the dependent base.

Self-review: inspected scoped reads, customer-directory projection, server-owned
roles, mutation versions, durable retries, revoked/delayed responses, dev-only
proxy constraints and unchanged private asset/bundle boundaries. This is assistant
self-review, not maintainer approval. No merge, production deployment, store release,
paid infrastructure or private CI spend is included.
