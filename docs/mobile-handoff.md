# Private Android source dependency

This section records the original handoff assessment; see the continuation below for recovered working source and new build evidence.

This first section records the original handoff assessment; see the continuation below for the recovered source/build.

The supplied 7 November 2026 handoff contains 90 mobile source/assets files and no
Git history. Its archive SHA-256 is
`b8154953c3ae6f0e9d36ce0af08a630c0c36d315c766e78deb27f9e161b9147a`.
A fresh scan found no credential/private-key signatures, APKs, keystores or local
machine configuration in the imported selection. That scan does not establish
salon asset permission or full source provenance.

No authoritative mobile repository was found among accessible repositories.
`saeed-alorm/mawid-mobile` is the authorized private target, not yet created by this
connection. The provided source, provenance, Linux setup, ignores and mobile CI are
prepared separately for private import. Never commit that source/bundle or its
provisional salon assets in this public repository.

The private generated web variant uses a native bridge and a different local store
from public Pages. Its README references `npm run build:android:platinum`, but the
actual public default branch has no such command/source. The supplied package also
does not identify the exact generating web commit. The historical public commit
must not be substituted for that unknown provenance.

The prepared private import retains the variant and file hashes, removes only the
bounded reporting function with a reproducible input/output hash check, and keeps
general console error handling. It includes guarded build/sync scripts requiring a
clean private source checkout, exact 40-character commit, private build command,
manifest, namespace and bridge. Public Pages output is rejected. Full regeneration
from source is still blocked until the private web source/history is supplied.

Toolchain established from `.metadata`, the official Flutter tag and Gradle files:
Flutter 3.41.6 at `db50e20168db8fee486b9abf32fc912de3bc5b6a`, Dart 3.11.4,
Java 17, Gradle 8.14, AGP 8.11.1, Kotlin 2.2.20, NDK 28.2.13676358.
SDK 36/minimum 24 derive from that Flutter revision. Node 24.22.1/npm 11.9.0
match the validated web setup. Signing material remains external. Private debug
APKs are test artifacts only, with optional one-day CI retention.

## Continuation: source supplement received 7 November

The original missing-source gate above is historical. The new 195-file working
snapshot was hash-verified and ported privately as a documented delta against PR17
commit 16ca565831a67588dc1df9967b6740f44b757f99. New private source at 050cc1dd…
was committed before build; bundle commit 67d5af0… records exact generating inputs
and output hashes. The historical generator stays unknown. See current readiness
for test/compile results; private GitHub import remains pending account capability.
