-- Local fictional implementation of the 16 November workflow decisions.
-- Bindings are populated by trusted setup only, never by an employee or client claim.
CREATE TABLE mawid_core.professional_bindings (
  workspace_id uuid NOT NULL,
  location_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY(workspace_id,location_id,actor_id,professional_id),
  FOREIGN KEY(workspace_id,location_id,professional_id)
    REFERENCES mawid_core.professionals(workspace_id,location_id,professional_id)
);
ALTER TABLE mawid_core.professional_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.professional_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY own_professional_binding ON mawid_core.professional_bindings
  FOR SELECT TO mawid_local_actor USING(actor_id=mawid_core.actor());
CREATE POLICY professional_binding_worker ON mawid_core.professional_bindings
  FOR SELECT TO mawid_local_booking,mawid_local_notify USING(true);
GRANT SELECT ON mawid_core.professional_bindings TO mawid_local_actor,mawid_local_booking,mawid_local_notify;
-- Row locks use UPDATE's USING policy, but never its WITH CHECK condition.
-- Allow the trusted worker to lock mappings while rejecting every actual write.
GRANT UPDATE(revoked_at) ON mawid_core.professional_bindings TO mawid_local_booking;
CREATE POLICY professional_binding_lock ON mawid_core.professional_bindings
  FOR UPDATE TO mawid_local_booking USING(true) WITH CHECK(false);

CREATE FUNCTION mawid_core.owns_professional(w uuid,l uuid,p uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT mawid_core.has_role(w,l,ARRAY['professional']) AND EXISTS(
    SELECT 1 FROM mawid_core.professional_bindings b
    WHERE b.workspace_id=w AND b.location_id=l AND b.professional_id=p
      AND b.actor_id=mawid_core.actor() AND b.revoked_at IS NULL
  )
$$;
REVOKE ALL ON FUNCTION mawid_core.owns_professional(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mawid_core.owns_professional(uuid,uuid,uuid) TO mawid_local_actor;
ALTER POLICY scoped_booking ON mawid_core.bookings USING(
  mawid_core.has_role(workspace_id,location_id,ARRAY['admin','manager'])
  OR mawid_core.owns_customer(workspace_id,customer_id)
  OR mawid_core.owns_professional(workspace_id,location_id,coalesce(assigned_professional_id,requested_professional_id))
);

-- Derived warning under the new rule; booking/event history is preserved.
-- Only customer cancellations before start and strictly inside 60 minutes qualify.
CREATE OR REPLACE FUNCTION mawid_core.cancellation_count(w uuid,c uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT count(*) FROM mawid_core.bookings
  WHERE workspace_id=w AND customer_id=c AND state='cancelled' AND cancellation_actor='customer'
    AND cancelled_at>statement_timestamp()-interval '90 days' AND cancelled_at<=statement_timestamp()
    AND assigned_start>cancelled_at AND assigned_start<cancelled_at+interval '60 minutes'
    AND mawid_core.has_role(w,location_id,ARRAY['admin','manager'])
$$;
