-- REVIEW ARTIFACT ONLY. No hosted execution is authorized by this file.
-- Preserve the approved #5 Supabase-managed Auth boundary. This scoped function
-- comes from the local staging permission adapter; no auth.* grants/policies.
CREATE OR REPLACE FUNCTION mawid_core.staging_auth_session()
RETURNS TABLE(session_id uuid,subject uuid,created_at timestamptz,updated_at timestamptz,
  not_after timestamptz,banned_until timestamptz,deleted_at timestamptz,email_confirmed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.id,s.user_id,s.created_at,s.updated_at,s.not_after,u.banned_until,u.deleted_at,u.email_confirmed_at
  FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
  JOIN mawid_core.identity_bindings b ON b.subject=s.user_id
  WHERE s.id=NULLIF(current_setting('mawid.verified_session',true),'')::uuid
    AND s.user_id=NULLIF(current_setting('mawid.verified_subject',true),'')::uuid
    AND b.issuer=current_setting('mawid.verified_issuer',true) AND b.revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION mawid_core.staging_auth_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mawid_core.staging_auth_session() TO mawid_staging_session;
-- Existing #5 actor/session roles and distinct login credentials are prerequisites.
-- Inspect collisions, ownership, PUBLIC exposure and Auth RLS before applying.
CREATE ROLE mawid_staging_booking NOLOGIN;
GRANT mawid_local_booking TO mawid_staging_booking;
CREATE ROLE mawid_staging_notify NOLOGIN;
GRANT mawid_local_notify TO mawid_staging_notify;
-- Only a separately authorized write rehearsal may enable actor transactions:
-- ALTER ROLE mawid_staging_actor SET default_transaction_read_only TO off;
-- Session reader remains read-only, no Auth table grants or actor/worker roles.
-- All logins: no superuser/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION, no schema/table
-- ownership or PUBLIC extras. Only the trusted operator provisions identity bindings.
