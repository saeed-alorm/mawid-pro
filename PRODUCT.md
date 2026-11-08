# MAWID product direction

Distribution decision **confirmed by Saeed on 8 November 2026 (Asia/Beirut)**.
Source: Saeed's direct instruction in the MAWID engineering-plan update conversation,
beginning “Update the existing MAWID engineering plan to reflect Saeed's confirmed
product distribution decision dated 8 November 2026.” No separate accompanying
decision file or updated PRODUCT.md was supplied or found in the accessible sources.
This record captures that instruction; it does not claim access to an earlier transcript.

| Surface | Confirmed direction |
|---|---|
| Customer Android | Dedicated salon-branded app with salon name/icon, its own listing and unique application identity. Working assumption: one app per salon brand; branches can share that brand's app. |
| Publishing operations | MAWID owns/operates the accounts and handles publishing, releases, updates and maintenance. Zero salon involvement in registering, paying for or operating developer/store accounts is a firm requirement. |
| Management | One shared MAWID management Android app **and** a web management portal, both required from the first pilot. Owners/staff sign in to their server-authorized workspace. |
| Shared foundation | Shared customer source/configuration, shared booking core, no independent code fork per salon. Separate management application identity. |
| Web and workflows | Preserve branded mobile web, stable links/QR, manual approval, bilingual EN/LTR and AR/RTL and other agreed product decisions. |
| Platform | Android first. iOS is future feasibility work, with no committed release. |

Earlier recommendations for a shared MAWID customer app or salon-owned publishing
accounts were **not adopted**. Do not silently substitute them or ask for the same
distribution choice again. This decision supersedes older package recommendations;
historical facts and test evidence remain historical.

Salon display branding does not replace MAWID's real verified publisher/legal identity.
Client onboarding may request approved assets, brand permissions and business facts;
it must not require the salon to create, fund or operate a store account. MAWID-borne
cash costs require a separately approved budget. No purchase/account enrollment,
infrastructure deployment or store submission is authorized by this document.

The decision confirms product intent, **not** legal/account eligibility, policy
feasibility, a selected implementation stack or store approval. If evidence blocks the
selected model, record it and ask only for the smallest necessary exception or scope
decision before dependent implementation. No automatic listing transfer or source
handover is approved. Commercial terms, cancellation/exports, conditional transfers,
support capacity and source licensing remain unresolved.

See the [decision record](docs/decisions/2026-11-08-product-distribution.md),
[P1 architecture](docs/engineering/p1-architecture-analysis.md),
[distribution design and acceptance](docs/engineering/android-distribution.md) and
[traceability](docs/engineering/feature-index.md). The current application remains a
fictional local prototype: [prototype specification](docs/prototype-spec.md).
