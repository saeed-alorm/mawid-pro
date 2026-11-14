# Pilot live-data retention — approved

Confirmed by Saeed on 14 November 2026 in the issue #4 continuation: “approve”, responding to the proposed retention policy.

- Keep booking and cancellation history for **12 months**, then delete or anonymize identifying details.
- The cancellation flag still counts qualifying events over the separately approved **rolling 90 days**, per salon. Twelve-month history retention does not extend that counting window.
- Handle customer deletion requests separately. Preserve only records required by a documented legal obligation; do not invent such an obligation or treat this approval as a legal exemption.
- Seven-day daily-backup retention remains separate from live-data retention. Backup restoration must account for prior approved deletion/anonymization actions before making restored data available.

This is an approved pilot operating policy, **not a verified Lebanese legal requirement**. Exact anonymization fields, deletion-request handling, authorization/audit and backup reconciliation belong in the implementation design and legal review where needed. The approval does not execute deletion, configure jobs, change hosted data or establish compliance.

Customer export rights, assisted-import limits and remaining internal-contract defaults are separate unresolved points. Refs [issue #4](https://github.com/saeed-alorm/mawid-pro/issues/4). Preserve the approved stack, booking rules and recovery evidence; no recovery test is repeated.
