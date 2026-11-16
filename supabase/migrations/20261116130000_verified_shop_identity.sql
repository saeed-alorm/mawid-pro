DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['mawid_identity_reader', 'mawid_verified_actor'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    ELSIF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name
        AND (rolcanlogin OR NOT rolinherit OR rolsuper OR rolbypassrls OR rolcreaterole
          OR rolcreatedb OR rolreplication)
    ) THEN
      RAISE EXCEPTION 'Unsafe verified identity role: %', role_name;
    END IF;
  END LOOP;
END;
$$;
GRANT mawid_local_actor, mawid_identity_reader TO mawid_verified_actor;

CREATE TABLE mawid_core.identity_bindings (
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 255),
  subject uuid NOT NULL,
  actor_id uuid NOT NULL,
  binding_version integer NOT NULL DEFAULT 1 CHECK (binding_version > 0),
  revoked_at timestamptz,
  PRIMARY KEY (issuer, subject),
  UNIQUE (issuer, actor_id)
);

ALTER TABLE mawid_core.identity_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.identity_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY verified_identity_lookup ON mawid_core.identity_bindings
  FOR SELECT TO mawid_identity_reader
  USING (
    issuer = current_setting('mawid.verified_issuer', true)
    AND subject = NULLIF(current_setting('mawid.verified_subject', true), '')::uuid
  );
GRANT USAGE ON SCHEMA mawid_core TO mawid_identity_reader;
GRANT SELECT ON mawid_core.identity_bindings TO mawid_identity_reader;

-- The verified database login is private to the server. Only this login group
-- may use transaction context. Development logins keep their fixed actor.
CREATE OR REPLACE FUNCTION mawid_core.actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF pg_has_role(session_user, 'mawid_verified_actor', 'USAGE') THEN
    RETURN (
      SELECT b.actor_id FROM mawid_core.identity_bindings b
      WHERE b.issuer = current_setting('mawid.verified_issuer', true)
        AND b.subject = NULLIF(current_setting('mawid.verified_subject', true), '')::uuid
        AND b.revoked_at IS NULL
    );
  END IF;
  RETURN (SELECT p.actor_id FROM mawid_core.principals p WHERE p.database_user = session_user);
END;
$$;
REVOKE ALL ON FUNCTION mawid_core.actor() FROM PUBLIC;
