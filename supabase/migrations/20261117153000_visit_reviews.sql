CREATE TABLE mawid_core.visit_reviews (
  workspace_id uuid NOT NULL,
  location_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  score smallint NOT NULL CHECK(score BETWEEN 1 AND 5),
  feedback text CHECK(length(feedback)<=1000),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(workspace_id,location_id,booking_id,professional_id),
  FOREIGN KEY(workspace_id,location_id,booking_id) REFERENCES mawid_core.bookings ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,location_id,professional_id) REFERENCES mawid_core.professionals
);
CREATE INDEX visit_review_professional ON mawid_core.visit_reviews(workspace_id,location_id,professional_id);
ALTER TABLE mawid_core.visit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.visit_reviews FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON mawid_core.visit_reviews TO mawid_local_booking;
CREATE POLICY review_booking ON mawid_core.visit_reviews TO mawid_local_booking
  USING(true) WITH CHECK(true);
GRANT SELECT(workspace_id,location_id,booking_id,feedback), UPDATE(feedback)
  ON mawid_core.visit_reviews TO mawid_local_maintenance;
CREATE POLICY review_maintenance_select ON mawid_core.visit_reviews
  FOR SELECT TO mawid_local_maintenance USING(true);
CREATE POLICY review_maintenance_erase ON mawid_core.visit_reviews
  FOR UPDATE TO mawid_local_maintenance USING(true) WITH CHECK(feedback IS NULL);

CREATE FUNCTION mawid_core.scrub_review_feedback() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE mawid_core.visit_reviews r SET feedback=NULL
  FROM mawid_core.bookings b
  WHERE (r.workspace_id,r.location_id,r.booking_id)=(b.workspace_id,b.location_id,b.booking_id)
    AND b.workspace_id=NEW.workspace_id AND b.customer_id=NEW.customer_id AND r.feedback IS NOT NULL;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION mawid_core.scrub_review_feedback() FROM PUBLIC;
CREATE TRIGGER erase_review_feedback AFTER UPDATE OF anonymized_at ON mawid_core.customer_profiles
  FOR EACH ROW WHEN (NEW.anonymized_at IS NOT NULL AND NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at)
  EXECUTE FUNCTION mawid_core.scrub_review_feedback();

-- The notification worker needs only the existence of an active identity binding.
GRANT SELECT(actor_id,revoked_at) ON mawid_core.identity_bindings TO mawid_local_notify;
CREATE POLICY notify_verified_binding ON mawid_core.identity_bindings FOR SELECT
  TO mawid_local_notify USING(revoked_at IS NULL);
