Title: Deliver local booking-event notifications through real FCM

Committed booking events previously stopped at the outbox. The local worker now
creates an authorized in-app inbox, encrypts device registrations and sends generic
EN/AR updates through FCM HTTP v1 using external ADC credentials. Bounded retries,
fenced leases, token invalidation and idempotent processing persist independently
of the booking transaction; push failure cannot undo a booking.

Registration, dispatch and opening reauthorize the synthetic actor and its
workspace/location/booking access. Opening fetches current booking state. Package,
brand and token values never grant workspace access. After-hours request pushes
wait for the next configured opening; overdue remains staff-only metadata with
no extra push or reminder. Simulated transport remains explicit for tests.

Refs #8. Real authentication (#5), full client integration/device acceptance (#7)
and the broader multi-brand acceptance matrix remain open. No production hosting,
billing upgrade, merge or store release is included.

Validation: 9 notification policy/provider/scheduler tests and 13 PostgreSQL
integration checks pass, including a database/worker restart, duplicate processing,
timeout, bounded failure, token refresh/invalidity and revocation. The private
Android build and operator/device evidence are linked in the notification
engineering record; Console delivery and booking-event delivery are separate.
On the exact private `0.3.1+4` APK on BBB100_2/API 27, the operator confirmed a
background request notification opening Pending version 1, followed by a
foreground confirmation update opening Confirmed version 2. Both authorized
opens were persisted by the server; the sanitized live evidence records exact
runtime commits and APK hash. The temporary server was stopped after testing.
All 16 pinned-toolchain installation/regression commands, 61 isolated schema
checks and 5 Python tests passed locally. Lint retains 11 existing warnings and
zero errors. Exact counts and scope are in `database/notification-regression-verification.json`.
No remote CI result is claimed.

Self-review: inspected tenant/object authorization, private credential/token paths,
the separate booking/delivery transactions and retry/crash semantics. FCM acceptance
is explicitly distinct from device delivery; exactly-once alerts are not promised.
