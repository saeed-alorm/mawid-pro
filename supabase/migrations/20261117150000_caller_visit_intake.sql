ALTER TABLE mawid_core.bookings
  ADD COLUMN intake_source text CHECK(intake_source IN ('phone','whatsapp','walk-in')),
  ADD COLUMN entered_by uuid,
  ADD CHECK((intake_source IS NULL)=(entered_by IS NULL));

-- SQL grants prevent booking worker inserts from associating a profile with an identity.
GRANT INSERT(workspace_id,external_key,display_name,contact)
  ON mawid_core.customer_profiles TO mawid_local_booking;
