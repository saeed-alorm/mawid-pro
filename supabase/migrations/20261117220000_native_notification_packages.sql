-- Append-only routing expansion. Packages and environments do not grant access.
ALTER TABLE mawid_core.push_destinations DROP CONSTRAINT push_destinations_application_id_check;
ALTER TABLE mawid_core.push_destinations ADD CONSTRAINT push_destinations_application_id_check
  CHECK(application_id IN ('com.mawid.demo','com.mawid.customer.platinum','com.mawid.management'));
ALTER TABLE mawid_core.push_destinations DROP CONSTRAINT push_destinations_environment_check;
ALTER TABLE mawid_core.push_destinations ADD CONSTRAINT push_destinations_environment_check
  CHECK(environment IN ('development','staging'));
ALTER TABLE mawid_core.push_destinations
  ADD COLUMN identity_issuer text,
  ADD COLUMN identity_subject uuid,
  ADD COLUMN identity_session uuid,
  ADD COLUMN identity_binding_version integer,
  ADD CONSTRAINT push_destination_identity_complete CHECK (
    (identity_issuer IS NULL AND identity_subject IS NULL AND identity_session IS NULL AND identity_binding_version IS NULL)
    OR (identity_issuer IS NOT NULL AND identity_subject IS NOT NULL AND identity_session IS NOT NULL AND identity_binding_version IS NOT NULL AND identity_binding_version > 0)
  );
