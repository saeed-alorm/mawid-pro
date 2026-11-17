# Issue #5 — Email OTP and the verified identity boundary

16 November 2026. Tracks [#5](https://github.com/saeed-alorm/mawid-pro/issues/5),
FEAT-26 and FEAT-47, within the approved [P1 architecture](p1-architecture-decision-2026-11-14.md).

## Shop permissions follow-up

Saeed confirmed that the deployed MAWID staging page accepted a Gmail code,
displayed **Email verified**, and returned to sign-in after sign-out. The
permissions follow-up exercises the shared HTTP API with a disposable database.

- PostgreSQL stores bindings keyed by the trusted issuer and verified Auth
  subject. The ID binding and the currently active Auth session are read through
  a separate selected-column login. Staff grants and customer profiles are
  resolved through the bound actor ID.
- A single low-privilege application login uses transaction-local identity.
  Existing row-level policies and booking/notification checks apply current
  shop memberships, location grants and customer ownership. The application
  login has read-only access to identity bindings and staff memberships.
- `GET /v1/workspaces` lists current staff grants, including the workspace name,
  the location ID (`null` for a shop-wide grant) and explicit roles. Customers
  get an empty staff workspace list. Neither email nor editable metadata can
  attach a profile or grant a staff role.
- `test:identity` runs the HTTP matrix through the pooled server role.
  `test:identity-email` also uses real Supabase Auth and tests staff and customers
  across two shops, different roles for the same staff account, revoked grants
  and identity bindings, and reset of identity on a reused connection.

The hosted staging Worker still serves the sign-in check. Applying database
grants and migrations in hosted staging, staff invitations and recovery,
connecting booking clients and two-device acceptance remain outstanding.

## Decisions and scope

Saeed selected **Email OTP for first-pilot customer sign-in** on 16 November:
customers need an email address; SMS is not the selected sign-in channel.
Use Sign up for a first account and Sign in for returning access. Email ownership
verification does not establish a customer-profile binding or staff membership.

The implementation candidate uses Supabase Auth alongside the already approved
Supabase PostgreSQL/shared booking core. This branch starts with a disposable local
Auth instance and SMTP catcher, never a hosted project or an email delivery service.
No paid provider, real employee/customer account, hosted configuration or release is
created. The existing development interface and fixture issuer remain development-only.

## Server contract

- Verify signature, fixed issuer/audience, algorithm, issued-at, expiry and required
  subject/session claims before resolving an application actor. Accept ES256/RS256;
  reject unsigned, symmetric, anonymous and privileged service-role credentials.
  JWKS configuration comes from the server, never token headers or a request URL.
- Resolve immutable issuer + subject + session ID against current server state.
  An email address, user-editable metadata, package/brand manifest or client role
  cannot select an actor or grant a membership. Profile imports do not claim accounts.
- Return an opaque in-process handle. A copied object, database username or handle
  from another verifier cannot select a database principal. Recheck session and
  binding state when acquiring a connection and before committing data operations.
- Keep existing live membership/customer checks in the shared core and RLS. Roles
  remain additive: manager does not implicitly grant admin. Location assignment,
  customer ownership and saved import/export-job ownership continue to apply.
- Recheck sessions after booking/notification lock waits and before worker commits.
  Logout must deny later uses of an unexpired JWT, not merely stop refresh.
- Missing/invalid/revoked sessions return the same 401. Session-store/key-service
  failures fail closed with a redacted retryable 503. Cross-shop and unknown-object
  responses retain uniform 404 behavior. Do not emit tokens, codes or contact data
  to application logs, persisted retry journals or verification evidence.

## Email, recovery and staff setup

Customer signup and returning access use an emailed, single-use numeric code.
Returning access after losing a device uses a fresh verified code; it must restore
the existing identity, never create a replacement profile or gain another person's
history through matching contact text. Email changes/loss of mailbox access need
a separate verified recovery procedure; booking staff cannot silently rebind an actor.

Staff use individual identities. An authenticated email alone grants no management
access. Trusted invitations/bootstrap must record explicit salon/location/role grants;
an ordinary customer or uninvited account cannot self-enroll as staff. Real employee
account setup remains deferred. Invitation creation/acceptance, initial-owner custody,
lost-email recovery and the production actor-binding adapter are remaining work.

The local proof uses 5-minute access tokens, 15-minute maximum/inactivity windows,
5-minute codes and a 5-second resend window to keep tests bounded. Its deliberately
high fixture-wide provider rate limits are **test settings**, not pilot abuse controls.
Pilot resend/attempt limits, account/IP limits, session maximum/inactivity policy,
security-event retention and SMTP delivery configuration still need implementation
and review. The verifier requires explicit bounded session policies; provider defaults
cannot silently create indefinite application sessions.

## Verification boundaries and remaining acceptance

`test:identity` checks the cryptographic/session boundary and reruns the complete
existing HTTP permission matrix with signed fictional identities. `test:identity-email`
uses real, pinned Supabase Auth plus a numeric-code mail template and local SMTP
catcher, connected to the existing disposable data/booking/notification fixture.
Published service ports are loopback-only on a dedicated Docker bridge. Auth
health checks use the published loopback port; an internal Docker network blocked
that forwarding on both Docker Desktop and the GitHub runner. SMTP routes only
to the local catcher, which has no outbound mail delivery.
Generated signing keys, mail contents and tokens remain transient.

The Auth metadata reader has its own nonprivileged login, selected-column grants
and two fixture-only SELECT policies. Every lookup sets the verified subject and
session with transaction-local settings, and RLS limits the lookup to that pair.
Outside that transaction the reader sees no users or sessions. It has no booking,
notification or actor-role membership, password/code grants, superuser/BYPASSRLS
privilege or SECURITY DEFINER workaround. Auth's RLS stays enabled. These local
fixture policies are not a migration to apply to a hosted Auth schema.

The local verifier permits at most five seconds of issuer clock skew; it still
rejects an expired access token and rechecks the clock after a session lookup.
This accounts for the observed Windows/Docker clock difference without extending
the access-token deadline.

The first-slice proof used test-owned subject mappings and per-actor database
logins. The follow-up above replaces those on the verified path with persisted
bindings and a shared application login. Test grants remain fictional. Hosted
identity binding, staff provisioning and revocation ordering across live service
boundaries still need verification.

Before closing #5: persist and verify the production actor/session mapping; implement
staff invitations and recovery, distributed verification/resend/attempt limits and
approved session policy; integrate customer web/Android and management sessions;
fence actor/workspace caches and uncertain retries; revoke notification destinations;
test all booking/notification/import/export variants and A/B customer co-installation;
record actual versioned two-device/build acceptance. Pilot use stays blocked.

References: [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts),
[sessions and immediate sign-out checks](https://supabase.com/docs/guides/auth/sessions),
[Email OTP templates](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[official local Auth configuration](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml).

## First-slice result and review

The local proof passed **33 token/session unit checks, 282 signed-identity HTTP
permission checks and 16 real Auth/Email OTP integration checks**, including
resend suppression, consumed/expired codes, recovery of the existing identity,
independent sessions, refresh/logout, provider restart, unchanged role boundaries
and revocation during booking and notification lock waits. The session reader
was verified with RLS and a nonprivileged metadata role.

The broader regression passed: locked installation, data API/auth/booking/notification/
maintenance/migration/CSV suites, 61 database foundation checks, 26 application tests,
strict types, normal and Pages builds, Pages artifact/toolchain verification and
two browser tests. Lint has zero errors and the same 11 existing warnings. The
initial resend-status assertion and two formatting errors were corrected; the
relevant final reruns passed. The [regression record](../../database/identity-regression-verification.json)
preserves the initial outcomes, targeted reruns, source hashes and assistant
self-review. It is not a maintainer approval, production permission proof or release.

The merge-chain follow-ups are now in main: [public #26](https://github.com/saeed-alorm/mawid-pro/pull/26)
and [private #5](https://github.com/saeed-alorm/mawid-mobile/pull/5). This issue #5
branch starts at public main `d400d98`; private main is `e4ba9a9`.

The first GitHub run passed web checks and exposed the internal-network forwarding
failure in the Auth proof. The dedicated bridge fix passed all 16 local provider
checks again; the regression record preserves that first CI outcome. Current CI
is tracked on the PR, independently from local verification.
