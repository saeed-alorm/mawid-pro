# Pilot assisted CSV imports — approved

Confirmed by Saeed on 14 November 2026 in the issue #4 continuation.

- Only an authorized manager may initiate and confirm a CSV import, within their authorized salon/workspace and location scope.
- Require a preview, validation and duplicate detection before explicit confirmation. Do not apply an upload immediately or silently merge/overwrite duplicate records.
- Commit the confirmed import transactionally; failure rolls back its changes. Record the authorized actor, scope, result and import reference in an audit record without credentials or unnecessary personal data.
- Exclude account creation, passwords/credentials and automatic booking confirmations. Imported records must not bypass the authoritative booking workflow, eligibility/capacity checks or tenant permissions.

This approves the policy, not a live import or proof that rollback/isolation tests pass. Exact allowed record types, CSV columns, size/row limits, duplicate-resolution UX and audit/preview retention are technical details to finalize before implementation. No live permission changed, no customer data imported and no employee account created. Retention/export rules remain their separate approved decisions.

Refs [issue #4](https://github.com/saeed-alorm/mawid-pro/issues/4); implementation and verification remain under dependent #6 after #4/#5 gates are satisfied.
