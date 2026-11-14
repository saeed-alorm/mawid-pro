# Dummy roles for local development

Saeed authorized continuing development with fictional roles while real users are
unavailable. The local API runner now enables the existing authorization fixtures
and issues nine server-owned sessions, including location manager and professional.
The role selection workflow is documented in `database/README.md`. An owner can
exercise shop operations with the existing manager fixture; no role grants changed.

The runner's smoke check now covers the expanded three-profile fixture, customer
and professional booking reads, and cross-workspace denial. Sessions remain
short-lived, temporary-file-only, and issued outside HTTP. The Pages demo has no
connection to these tokens. This enables local #7 development; #5 remains open.

Verification on Windows with Node 24.22.1/npm 11.9.0:

- Locked `npm ci` completed using the existing cache.
- Local runner `--check` passed, including cleanup.
- All 282 authorization checks and 22 application tests passed.
- Strict types, normal/Pages builds, Pages artifact/toolchain checks and both
  browser tests passed.
- Lint passed with the same 11 existing warnings. The initial Windows checkout
  had CRLF formatter failures; local LF normalization resolved them without
  modifying formatter rules or adding unrelated source changes.

Assistant self-review checked the expanded fixture count, allowlisted session
issuance, location/workspace rejection, expiry/cleanup preservation and focused
diff. This is not a maintainer approval or real-authentication acceptance. No
booking mutations, production accounts, deployment or release are included.
