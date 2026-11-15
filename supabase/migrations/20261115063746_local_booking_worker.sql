-- Fictional local server worker only. Never grant this group to HTTP actors.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_booking') THEN
  CREATE ROLE mawid_local_booking NOLOGIN;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_booking' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN
  RAISE EXCEPTION 'UNSAFE_BOOKING_GROUP';
 END IF;
END $$;
GRANT USAGE ON SCHEMA mawid_core TO mawid_local_booking;
GRANT SELECT ON mawid_core.organizations,mawid_core.locations,mawid_core.memberships,mawid_core.customer_profiles,mawid_core.services,mawid_core.professionals,mawid_core.eligibility,mawid_core.opening_intervals,mawid_core.schedule_exceptions,mawid_core.professional_intervals TO mawid_local_booking;
GRANT UPDATE ON mawid_core.organizations,mawid_core.memberships,mawid_core.customer_profiles TO mawid_local_booking;
GRANT SELECT,INSERT,UPDATE,DELETE ON mawid_core.bookings,mawid_core.allocations TO mawid_local_booking;
GRANT SELECT,INSERT ON mawid_core.booking_events,mawid_core.outbox,mawid_core.operation_references,mawid_core.idempotency_records TO mawid_local_booking;
GRANT EXECUTE ON FUNCTION mawid_core.allocation_consistent() TO mawid_local_booking;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','locations','memberships','customer_profiles','services','professionals','eligibility','opening_intervals','schedule_exceptions','professional_intervals','bookings','allocations','booking_events','outbox','operation_references','idempotency_records'] LOOP
  EXECUTE format('CREATE POLICY local_booking_worker ON mawid_core.%I TO mawid_local_booking USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
