-- The existing booking row is the visit header. Its ID, version, history and
-- operation references continue to identify the whole visit.
ALTER TABLE mawid_core.bookings
  ADD COLUMN segment_count smallint NOT NULL DEFAULT 1 CHECK(segment_count BETWEEN 1 AND 8);

CREATE TABLE mawid_core.visit_segments (
  workspace_id uuid NOT NULL,
  location_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  position smallint NOT NULL CHECK(position BETWEEN 1 AND 8),
  service_id uuid NOT NULL,
  requested_professional_id uuid,
  assigned_professional_id uuid,
  requested_start timestamptz NOT NULL,
  requested_end timestamptz NOT NULL,
  assigned_start timestamptz,
  assigned_end timestamptz,
  buffer_before_seconds numeric NOT NULL CHECK(buffer_before_seconds>=0),
  buffer_after_seconds numeric NOT NULL CHECK(buffer_after_seconds>=0),
  CHECK (isfinite(requested_start) AND isfinite(requested_end) AND requested_end>requested_start),
  CHECK ((assigned_start IS NULL AND assigned_end IS NULL)
    OR (assigned_start IS NOT NULL
      AND assigned_end IS NOT NULL AND isfinite(assigned_start) AND isfinite(assigned_end)
      AND assigned_end>assigned_start)),
  PRIMARY KEY(workspace_id,location_id,booking_id,position),
  FOREIGN KEY(workspace_id,location_id,booking_id) REFERENCES mawid_core.bookings ON DELETE CASCADE,
  FOREIGN KEY(workspace_id,location_id,service_id) REFERENCES mawid_core.services,
  FOREIGN KEY(workspace_id,location_id,requested_professional_id) REFERENCES mawid_core.professionals,
  FOREIGN KEY(workspace_id,location_id,assigned_professional_id) REFERENCES mawid_core.professionals
);

INSERT INTO mawid_core.visit_segments
SELECT b.workspace_id,b.location_id,b.booking_id,1,b.service_id,b.requested_professional_id,
  b.assigned_professional_id,b.requested_start,b.requested_end,b.assigned_start,b.assigned_end,
  coalesce(extract(epoch FROM b.assigned_start-lower(a.period)),s.buffer_before*60),
  coalesce(extract(epoch FROM upper(a.period)-b.assigned_end),s.buffer_after*60)
FROM mawid_core.bookings b
JOIN mawid_core.services s USING(workspace_id,location_id,service_id)
LEFT JOIN mawid_core.allocations a USING(workspace_id,location_id,booking_id);

ALTER TABLE mawid_core.allocations
  DROP CONSTRAINT allocations_workspace_id_location_id_booking_id_key,
  ADD COLUMN segment_position smallint NOT NULL DEFAULT 1,
  ADD UNIQUE(workspace_id,location_id,booking_id,segment_position),
  ADD FOREIGN KEY(workspace_id,location_id,booking_id,segment_position)
    REFERENCES mawid_core.visit_segments DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE mawid_core.visit_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.visit_segments FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON mawid_core.visit_segments TO mawid_local_booking;
GRANT SELECT ON mawid_core.visit_segments TO mawid_local_maintenance,mawid_local_actor;
CREATE POLICY visit_segment_worker ON mawid_core.visit_segments
  TO mawid_local_booking USING(true) WITH CHECK(true);
CREATE POLICY visit_segment_maintenance ON mawid_core.visit_segments
  FOR SELECT TO mawid_local_maintenance USING(true);
CREATE POLICY visit_segment_actor ON mawid_core.visit_segments
  FOR SELECT TO mawid_local_actor USING(
    mawid_core.owns_professional(workspace_id,location_id,
      coalesce(assigned_professional_id,requested_professional_id))
    OR EXISTS (
      SELECT 1 FROM mawid_core.bookings b
      WHERE (b.workspace_id,b.location_id,b.booking_id)=
        (visit_segments.workspace_id,visit_segments.location_id,visit_segments.booking_id)
        AND (mawid_core.has_role(b.workspace_id,b.location_id,ARRAY['admin','manager'])
          OR mawid_core.owns_customer(b.workspace_id,b.customer_id))
    )
  );
ALTER POLICY scoped_booking ON mawid_core.bookings USING(
  mawid_core.has_role(workspace_id,location_id,ARRAY['admin','manager'])
  OR mawid_core.owns_customer(workspace_id,customer_id)
  OR (segment_count=1 AND
    mawid_core.owns_professional(workspace_id,location_id,
      coalesce(assigned_professional_id,requested_professional_id)))
);

-- Legacy imports, maintenance fixtures and v1 mutations write single-service
-- headers. Keep their segment projection current within the same transaction.
CREATE FUNCTION mawid_core.sync_single_visit_segment() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.segment_count<>1 THEN RETURN NEW; END IF;
  INSERT INTO mawid_core.visit_segments
    (workspace_id,location_id,booking_id,position,service_id,requested_professional_id,
     assigned_professional_id,requested_start,requested_end,assigned_start,assigned_end,
     buffer_before_seconds,buffer_after_seconds)
  SELECT NEW.workspace_id,NEW.location_id,NEW.booking_id,1,NEW.service_id,
    NEW.requested_professional_id,NEW.assigned_professional_id,NEW.requested_start,NEW.requested_end,
    NEW.assigned_start,NEW.assigned_end,s.buffer_before*60,s.buffer_after*60
  FROM mawid_core.services s
  WHERE (s.workspace_id,s.location_id,s.service_id)=(NEW.workspace_id,NEW.location_id,NEW.service_id)
  ON CONFLICT (workspace_id,location_id,booking_id,position) DO UPDATE SET
    service_id=excluded.service_id,requested_professional_id=excluded.requested_professional_id,
    assigned_professional_id=excluded.assigned_professional_id,requested_start=excluded.requested_start,
    requested_end=excluded.requested_end,assigned_start=excluded.assigned_start,assigned_end=excluded.assigned_end;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION mawid_core.sync_single_visit_segment() FROM PUBLIC;
CREATE TRIGGER single_visit_segment AFTER INSERT OR UPDATE OF service_id,requested_professional_id,
  assigned_professional_id,requested_start,requested_end,assigned_start,assigned_end
  ON mawid_core.bookings FOR EACH ROW EXECUTE FUNCTION mawid_core.sync_single_visit_segment();

CREATE OR REPLACE FUNCTION mawid_core.allocation_consistent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE
  w uuid; l uuid; b uuid; item mawid_core.bookings;
  n integer; first_segment mawid_core.visit_segments; last_segment mawid_core.visit_segments;
BEGIN
  IF TG_OP='DELETE' THEN
    w:=OLD.workspace_id; l:=OLD.location_id; b:=OLD.booking_id;
  ELSE
    w:=NEW.workspace_id; l:=NEW.location_id; b:=NEW.booking_id;
  END IF;
  IF TG_OP='UPDATE' AND (w,l,b) IS DISTINCT FROM (OLD.workspace_id,OLD.location_id,OLD.booking_id) THEN
    RAISE EXCEPTION 'IMMUTABLE_VISIT_KEY';
  END IF;
  SELECT * INTO item FROM mawid_core.bookings
    WHERE workspace_id=w AND location_id=l AND booking_id=b;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM mawid_core.visit_segments
    WHERE workspace_id=w AND location_id=l AND booking_id=b AND position<=item.segment_count;
  SELECT * INTO first_segment FROM mawid_core.visit_segments
    WHERE workspace_id=w AND location_id=l AND booking_id=b AND position=1;
  SELECT * INTO last_segment FROM mawid_core.visit_segments
    WHERE workspace_id=w AND location_id=l AND booking_id=b AND position=item.segment_count;
  IF n<>item.segment_count OR EXISTS(
    SELECT 1 FROM mawid_core.visit_segments
    WHERE workspace_id=w AND location_id=l AND booking_id=b AND position>item.segment_count
  ) OR (item.requested_start,item.requested_end,item.assigned_start,item.assigned_end,
        item.service_id,item.requested_professional_id,item.assigned_professional_id)
       IS DISTINCT FROM (first_segment.requested_start,last_segment.requested_end,
        first_segment.assigned_start,last_segment.assigned_end,first_segment.service_id,
        first_segment.requested_professional_id,first_segment.assigned_professional_id)
  OR EXISTS (
    SELECT 1 FROM mawid_core.visit_segments s JOIN mawid_core.visit_segments next
      ON (next.workspace_id,next.location_id,next.booking_id,next.position)=
         (s.workspace_id,s.location_id,s.booking_id,s.position+1)
    WHERE s.workspace_id=w AND s.location_id=l AND s.booking_id=b
      AND (s.requested_end>next.requested_start OR s.assigned_end>next.assigned_start)
  ) THEN RAISE EXCEPTION 'INVALID_VISIT_SEGMENTS'; END IF;

  IF item.state IN ('confirmed','proposed') THEN
    IF EXISTS (
      SELECT 1 FROM mawid_core.visit_segments s
      LEFT JOIN mawid_core.allocations a ON (a.workspace_id,a.location_id,a.booking_id,a.segment_position)=
        (s.workspace_id,s.location_id,s.booking_id,s.position)
      WHERE s.workspace_id=w AND s.location_id=l AND s.booking_id=b
        AND (a.allocation_id IS NULL OR s.assigned_start IS NULL
          OR a.professional_id IS DISTINCT FROM s.assigned_professional_id
          OR lower(a.period)>s.assigned_start OR upper(a.period)<s.assigned_end
          OR (item.segment_count>1 AND (
            lower(a.period)>s.assigned_start-s.buffer_before_seconds*interval '1 second'
            OR upper(a.period)<s.assigned_end+s.buffer_after_seconds*interval '1 second'))
          OR (item.state='confirmed' AND a.kind<>'confirmed')
          OR (item.state='proposed' AND (a.kind<>'offer' OR a.expires_at IS DISTINCT FROM item.offer_expires_at)))
    ) THEN RAISE EXCEPTION 'ALLOCATION_REQUIRED'; END IF;
  ELSIF EXISTS (
    SELECT 1 FROM mawid_core.allocations WHERE workspace_id=w AND location_id=l AND booking_id=b
  ) THEN RAISE EXCEPTION 'NON_RESERVING_STATE'; END IF;
  RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER visit_segment_capacity AFTER INSERT OR UPDATE OR DELETE
  ON mawid_core.visit_segments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION mawid_core.allocation_consistent();

-- Retain the existing export-job and scoped profile checks for both contracts.
ALTER FUNCTION mawid_core.download_export(uuid,uuid) RENAME TO download_export_headers;
CREATE FUNCTION mawid_core.download_visit_export(w uuid,id uuid,contract integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE result jsonb; entries jsonb;
BEGIN
  IF contract NOT IN (1,2) OR contract IS NULL THEN RAISE EXCEPTION 'INVALID_EXPORT_CONTRACT'; END IF;
  result:=mawid_core.download_export_headers(w,id);
  SELECT coalesce(jsonb_agg(
    CASE WHEN contract=1 THEN item.value ELSE
      item.value || jsonb_build_object('segments',(
        SELECT coalesce(jsonb_agg(to_jsonb(s)-'workspace_id'-'location_id'-'booking_id' ORDER BY s.position),'[]')
        FROM mawid_core.visit_segments s
        WHERE (s.workspace_id,s.location_id,s.booking_id)=(b.workspace_id,b.location_id,b.booking_id)
      ))
    END ORDER BY item.ordinality
  ),'[]') INTO entries
  FROM jsonb_array_elements(result->'bookings') WITH ORDINALITY item
  JOIN mawid_core.bookings b ON b.workspace_id=w
    AND b.location_id=(item.value->>'location_id')::uuid
    AND b.booking_id=(item.value->>'booking_id')::uuid
  WHERE contract=2 OR b.segment_count=1;
  RETURN result || jsonb_build_object('contract_version',contract,'bookings',entries);
END
$$;
CREATE FUNCTION mawid_core.download_export(w uuid,id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT mawid_core.download_visit_export(w,id,1)
$$;
REVOKE ALL ON FUNCTION mawid_core.download_visit_export(uuid,uuid,integer),
  mawid_core.download_export(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mawid_core.download_visit_export(uuid,uuid,integer),
  mawid_core.download_export(uuid,uuid) TO mawid_local_actor;
