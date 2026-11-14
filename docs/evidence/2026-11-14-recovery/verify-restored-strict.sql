-- Local restored database only. Any mismatch aborts with a failing exit code.
\set ON_ERROR_STOP on
DO $check$
DECLARE
    actual_hash text;
BEGIN
    SELECT encode(sha256(convert_to(string_agg(concat_ws('|',booking_id,tenant_id,
        location_id,professional_id,extract(epoch FROM starts_at)::bigint::text,
        extract(epoch FROM ends_at)::bigint::text,status,version::text,idempotency_key),
        E'\n' ORDER BY booking_id),'UTF8')),'hex')
    INTO actual_hash FROM mawid_recovery_rehearsal_4.bookings;
    IF actual_hash IS DISTINCT FROM 'ded080396cc81ea3120f4218f2eb1b802a29bafb00d21e70a2e1df4c13ec968c'
       OR (SELECT count(*) FROM mawid_recovery_rehearsal_4.bookings) <> 6 THEN
        RAISE EXCEPTION 'Restored data or row count does not match source evidence';
    END IF;
    IF (SELECT count(*) FROM pg_constraint WHERE conrelid='mawid_recovery_rehearsal_4.bookings'::regclass) <> 7
       OR (SELECT count(*) FROM pg_indexes WHERE schemaname='mawid_recovery_rehearsal_4') <> 3
       OR (SELECT count(*) FROM pg_policy WHERE polrelid='mawid_recovery_rehearsal_4.bookings'::regclass) <> 0
       OR (SELECT count(*) FROM pg_proc WHERE pronamespace='mawid_recovery_rehearsal_4'::regnamespace) <> 0
       OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
               WHERE oid='mawid_recovery_rehearsal_4.bookings'::regclass) THEN
        RAISE EXCEPTION 'Restored schema inventory or RLS flags differ from source evidence';
    END IF;

    -- Each block rolls back its attempted change on the expected constraint error.
    BEGIN
        UPDATE mawid_recovery_rehearsal_4.bookings SET ends_at=starts_at WHERE booking_id='fixture-a-1';
        RAISE EXCEPTION 'Invalid time range was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE mawid_recovery_rehearsal_4.bookings SET status='invalid' WHERE booking_id='fixture-a-1';
        RAISE EXCEPTION 'Invalid status was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE mawid_recovery_rehearsal_4.bookings SET version=0 WHERE booking_id='fixture-a-1';
        RAISE EXCEPTION 'Invalid version was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
        UPDATE mawid_recovery_rehearsal_4.bookings SET idempotency_key='fixture-request-a-1'
        WHERE booking_id='fixture-a-2';
        RAISE EXCEPTION 'Duplicate tenant retry key was accepted';
    EXCEPTION WHEN unique_violation THEN NULL; END;
END;
$check$;
\echo PASS: restored checksum, inventory, RLS flags and four constraint rejection checks
