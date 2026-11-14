# Pilot export permissions — approved

Confirmed by Saeed on 14 November 2026 in the issue #4 continuation.

- Customers may export only their own profile and booking/cancellation history.
- Salon-wide exports are restricted to authorized managers, within their authorized salon/workspace and location scope. Admin status alone does not grant manager export authority.
- Exclude credentials, authentication/session tokens, password material and other customers' data from customer exports. Manager exports must not include credentials or records outside their authorized salon scope.
- Enforce these permissions on the server at request and delivery; a package ID, client workspace parameter or guessed record ID grants no access.

This is approval of scope, not implementation or evidence that live export authorization passes. Export format/delivery, audit and deletion handling remain technical design work. It does not grant source-code ownership, automatic app-listing transfer or unrestricted account/database export rights. Existing 12-month history policy, 90-day cancellation count and seven-day backup retention remain separate.

No live permissions changed, no customer data exported and no hosted configuration modified. Refs [issue #4](https://github.com/saeed-alorm/mawid-pro/issues/4).
