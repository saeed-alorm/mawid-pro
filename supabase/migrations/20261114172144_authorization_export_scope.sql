-- Restrict location-filtered exports to that location's booking-linked profiles.
-- Existing RLS continues to decide which profile/contact rows an actor may read.
-- Location-only managers gain no tenant-wide profile privilege from this change.
CREATE OR REPLACE FUNCTION mawid_core.download_export(w uuid, id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  j mawid_core.export_jobs;
  result jsonb;
BEGIN
  SELECT * INTO j
    FROM mawid_core.export_jobs
    WHERE workspace_id = w AND job_id = id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF j.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'EXPORT_EXPIRED';
  END IF;

  SELECT jsonb_build_object(
    'contract_version', 1,
    'profiles', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'customer_id', p.customer_id,
        'display_name', p.display_name,
        'contact', p.contact
      ))
      FROM mawid_core.customer_profiles p
      WHERE p.workspace_id = w
        AND (j.customer_id IS NULL OR p.customer_id = j.customer_id)
        AND (j.location_id IS NULL OR EXISTS (
          SELECT 1 FROM mawid_core.bookings b
          WHERE b.workspace_id = p.workspace_id
            AND b.customer_id = p.customer_id
            AND b.location_id = j.location_id
        ))
    ), '[]'::jsonb),
    'bookings', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'booking_id', b.booking_id,
        'customer_id', b.customer_id,
        'location_id', b.location_id,
        'requested_start', b.requested_start,
        'assigned_start', b.assigned_start,
        'state', b.state,
        'version', b.version,
        'cancelled_at', b.cancelled_at
      ))
      FROM mawid_core.bookings b
      WHERE b.workspace_id = w
        AND (j.location_id IS NULL OR b.location_id = j.location_id)
        AND (j.customer_id IS NULL OR b.customer_id = j.customer_id)
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION mawid_core.download_export(uuid, uuid) FROM PUBLIC;
