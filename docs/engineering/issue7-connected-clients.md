# Authoritative development booking clients

This branch depends on `codex/issue8-fcm-outbox` / draft PR #24. The private Android
companion depends on private `codex/issue8-android-fcm` / draft PR #3. No merge or
pilot readiness is implied. Real authentication #5 remains separate.

The existing core now exposes authorized, bounded `GET booking-core/view` and
`GET booking-core/slots` reads. View paginates bookings with `after` and returns
the current actor's roles/customer bindings, catalogs and server versions.
Customer-directory names are limited to customers themselves and managers/admins;
professionals do not receive that directory. Slots enumerate a seven-day,
30-minute engineering picker through the existing availability validator. This
picker is advisory; all mutations continue to revalidate atomically in the core.
The picker window is an implementation bound, not an approved salon policy.

Public customer booking/history and management routes can use an explicitly
enabled development interface. Start the disposable `npm run data:local` fixture,
then start Vite with both `VITE_MAWID_LOCAL_BOOKING=true` and
`MAWID_LOCAL_API_ORIGIN=http://127.0.0.1:PORT`. A loopback-only, development-only
proxy sends authenticated requests to that fixture. Import a separately issued
single-actor development-session JSON through the file control. Tokens stay in
memory, outside URLs, browser storage and source. The importer never chooses an
actor. Production/Pages builds have no enabled fixture interface or proxy.

The interface supports requests, explicit manager assignment, admin approval,
rejection/proposals, customer acceptance/withdrawal/cancellation, fresh requests
after terminal states and staff-entered appointments. Its in-app notification
inbox shows delivery status independently of current booking state. Opening a
notification reauthorizes and refreshes the booking; push payloads cannot mutate it.

The native companion connects the actual Flutter booking screens through the same
API. Neither client inserts optimistic bookings. Uncertain POSTs persist their
exact UUID/body/version before transport and offer explicit retry; a different
intent cannot replace an unresolved one. Refresh/reconnect/revocation fence cached
records. Tenant/brand/package configuration never grants authority.

Retry journals are isolated by authorized actor/workspace/location. Authorization
failure or session expiry retains uncertain intent for reauthorization and exact
replay; it does not create a replacement UUID. The web journal uses sessionStorage;
the native lab uses app-private cache. Storage eviction, reinstall/upgrade and
production session reconciliation are not established by these development tests.

Approved timing is unchanged: immediately persist closed-hours requests, delay
their initial staff notification until the next opening, count 15 opening minutes
for a staff-only overdue warning, and leave pending non-reserving. No overdue
push or recurring reminder is introduced.

`npm run test:booking-clients` runs the actual development forms in independent
headless Playwright clients against disposable PostgreSQL and explicit simulated
notification transport. All seven scenarios pass, including independent customer,
manager and admin interfaces, acknowledgement loss, offline retry, stale conflict,
after-hours deferral and revocation. Source hashes and exact results are in
`database/booking-client-verification.json`.

The full 16-command local regression suite passed. After the final retry fix,
the nine affected checks passed, including 26 web tests and a successful rerun of
the seven connected scenarios after a transient local proxy 502. The separate
regression record preserves that distinction. Native analysis and 13 Flutter
tests pass; the final `com.mawid.demo` debug APK is `0.4.1+6`, source
`2e39276d1e5a0d1095435d3b7bd3770809c3c62f`, SHA-256
`ce18a65d455254394067a5d6ca2f29afec5e03596943ca3e33b12b1ff519b467`.

The earlier native artifact demonstrated actual customer request → native staff
approval → customer state/in-app notification opening. The final APK created an
actual physical Pending v1 request and staff inbox entries. These device records
are private. New-APK physical FCM delivery/opening and terminated-process acceptance
remain pending; emulator FCM registration reports `AUTHENTICATION_FAILED` despite
observed API35 permission denial/restoration. No device delivery is inferred from
the simulated tests or provider acceptance. #7 remains open, and #5 remains a
prerequisite before pilot use. No merge or release is included.
