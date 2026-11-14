CREATE FUNCTION mawid_core.validate_import(w uuid,l uuid,k text,rows jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE r jsonb; allowed text[]; seen text[]:=ARRAY[]::text[]; key text; BEGIN
 IF NOT mawid_core.has_role(w,l,ARRAY['manager']) OR (k='customers' AND NOT mawid_core.has_role(w,NULL,ARRAY['manager'])) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(rows)<>'array' OR jsonb_array_length(rows) NOT BETWEEN 1 AND 1000 OR octet_length(rows::text)>5242880 THEN RAISE EXCEPTION 'INVALID_IMPORT'; END IF;
 allowed:=CASE k WHEN 'customers' THEN ARRAY['external_key','display_name','contact'] WHEN 'professionals' THEN ARRAY['external_key','display_name'] WHEN 'services' THEN ARRAY['external_key','name','duration_minutes','buffer_before','buffer_after'] WHEN 'openings' THEN ARRAY['external_key','weekday','opens','closes'] ELSE NULL END;
 IF allowed IS NULL THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
 IF jsonb_typeof(r)<>'object' THEN RAISE EXCEPTION 'INVALID_ROW'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(r) e WHERE NOT e.key=ANY(allowed) OR jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'INVALID_COLUMNS_OR_TYPES'; END IF;
 key:=r->>'external_key';
 IF key IS NULL OR key<>lower(btrim(key)) OR length(key) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_KEY'; END IF;
 IF key=ANY(seen) THEN RAISE EXCEPTION 'DUPLICATE_ROW'; END IF; seen:=array_append(seen,key);
 IF k='customers' THEN
 IF length(coalesce(r->>'display_name','')) NOT BETWEEN 1 AND 120 OR length(coalesce(r->>'contact',''))>200 THEN RAISE EXCEPTION 'INVALID_CUSTOMER'; END IF;
 IF EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=w AND external_key=key) THEN RAISE EXCEPTION 'EXISTING_RECORD'; END IF;
 ELSIF k='professionals' THEN
 IF length(coalesce(r->>'display_name','')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_PROFESSIONAL'; END IF;
 IF EXISTS(SELECT 1 FROM mawid_core.professionals WHERE workspace_id=w AND location_id=l AND external_key=key) THEN RAISE EXCEPTION 'EXISTING_RECORD'; END IF;
 ELSIF k='services' THEN
 IF length(coalesce(r->>'name','')) NOT BETWEEN 1 AND 120 OR coalesce(r->>'duration_minutes','') !~ '^[0-9]{1,4}$' OR (r->>'duration_minutes')::integer NOT BETWEEN 1 AND 1440 OR coalesce(r->>'buffer_before','0') !~ '^[0-9]{1,4}$' OR coalesce(r->>'buffer_after','0') !~ '^[0-9]{1,4}$' OR coalesce(r->>'buffer_before','0')::integer>1440 OR coalesce(r->>'buffer_after','0')::integer>1440 THEN RAISE EXCEPTION 'INVALID_SERVICE'; END IF;
 IF EXISTS(SELECT 1 FROM mawid_core.services WHERE workspace_id=w AND location_id=l AND external_key=key) THEN RAISE EXCEPTION 'EXISTING_RECORD'; END IF;
 ELSE
 IF coalesce(r->>'weekday','') !~ '^[0-6]$' OR coalesce(r->>'opens','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR coalesce(r->>'closes','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (r->>'closes')::time <= (r->>'opens')::time THEN RAISE EXCEPTION 'INVALID_OPENING'; END IF;
 IF EXISTS(SELECT 1 FROM mawid_core.opening_intervals WHERE workspace_id=w AND location_id=l AND external_key=key) THEN RAISE EXCEPTION 'EXISTING_RECORD'; END IF;
 END IF; END LOOP; END $$;
CREATE FUNCTION mawid_core.preview_import(w uuid,l uuid,k text,file_sha256 text,rows jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v bigint; id uuid; BEGIN
 PERFORM mawid_core.validate_import(w,l,k,rows);
 SELECT configuration_version INTO STRICT v FROM mawid_core.organizations WHERE workspace_id=w;
 IF NOT EXISTS(SELECT 1 FROM mawid_core.locations WHERE workspace_id=w AND location_id=l) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 INSERT INTO mawid_core.import_jobs(workspace_id,location_id,actor_id,kind,file_hash,payload_hash,configuration_version,staged_rows,row_count) VALUES(w,l,mawid_core.actor(),k,file_sha256,encode(sha256(convert_to(rows::text,'UTF8')),'hex'),v,rows,jsonb_array_length(rows)) RETURNING job_id INTO id; RETURN id; END $$;
CREATE FUNCTION mawid_core.confirm_import(w uuid,id uuid,file_sha256 text,confirmed boolean) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE j mawid_core.import_jobs; r jsonb; v bigint; BEGIN
 -- Serialize configuration changes before locking the preview; all calls use this order.
 SELECT configuration_version INTO v FROM mawid_core.organizations WHERE workspace_id=w FOR UPDATE;
 SELECT * INTO j FROM mawid_core.import_jobs WHERE workspace_id=w AND job_id=id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONFIRMATION_REQUIRED'; END IF;
 IF j.status='committed' THEN RAISE EXCEPTION 'ALREADY_COMMITTED'; END IF;
 IF j.expires_at<=clock_timestamp() OR j.status<>'previewed' THEN RAISE EXCEPTION 'PREVIEW_EXPIRED'; END IF;
 IF j.file_hash<>file_sha256 OR j.configuration_version<>v OR j.payload_hash<>encode(sha256(convert_to(j.staged_rows::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'STALE_PREVIEW'; END IF;
 PERFORM mawid_core.validate_import(w,j.location_id,j.kind,j.staged_rows);
 FOR r IN SELECT value FROM jsonb_array_elements(j.staged_rows) LOOP
 CASE j.kind
 WHEN 'customers' THEN INSERT INTO mawid_core.customer_profiles(workspace_id,external_key,display_name,contact) VALUES(w,r->>'external_key',r->>'display_name',nullif(r->>'contact',''));
 WHEN 'professionals' THEN INSERT INTO mawid_core.professionals(workspace_id,location_id,external_key,display_name) VALUES(w,j.location_id,r->>'external_key',r->>'display_name');
 WHEN 'services' THEN INSERT INTO mawid_core.services(workspace_id,location_id,external_key,name,duration_minutes,buffer_before,buffer_after) VALUES(w,j.location_id,r->>'external_key',r->>'name',(r->>'duration_minutes')::integer,coalesce(r->>'buffer_before','0')::integer,coalesce(r->>'buffer_after','0')::integer);
 WHEN 'openings' THEN INSERT INTO mawid_core.opening_intervals(workspace_id,location_id,external_key,weekday,opens,closes) VALUES(w,j.location_id,r->>'external_key',(r->>'weekday')::integer,(r->>'opens')::time,(r->>'closes')::time);
 END CASE; END LOOP;
 INSERT INTO mawid_core.transfer_audit(workspace_id,job_id,actor_id,action,row_count) VALUES(w,id,mawid_core.actor(),'import_committed',j.row_count);
 UPDATE mawid_core.import_jobs SET status='committed',staged_rows=NULL WHERE workspace_id=w AND job_id=id;
 RETURN j.row_count; END $$;
CREATE FUNCTION mawid_core.request_export(w uuid,l uuid,c uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE id uuid; BEGIN
 IF (c IS NOT NULL AND NOT mawid_core.owns_customer(w,c)) OR (c IS NULL AND NOT mawid_core.has_role(w,l,ARRAY['manager'])) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 INSERT INTO mawid_core.export_jobs(workspace_id,location_id,customer_id,actor_id) VALUES(w,CASE WHEN c IS NULL THEN l ELSE NULL END,c,mawid_core.actor()) RETURNING job_id INTO id; RETURN id; END $$;
CREATE FUNCTION mawid_core.download_export(w uuid,id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE j mawid_core.export_jobs; result jsonb; BEGIN
 SELECT * INTO j FROM mawid_core.export_jobs WHERE workspace_id=w AND job_id=id;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF j.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_EXPIRED'; END IF;
 -- Project explicit fields only: never membership, provider bindings, credentials, or another customer's profile.
 SELECT jsonb_build_object('contract_version',1,'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('customer_id',p.customer_id,'display_name',p.display_name,'contact',p.contact)) FROM mawid_core.customer_profiles p WHERE p.workspace_id=w AND (j.customer_id IS NULL OR p.customer_id=j.customer_id)),'[]'::jsonb),'bookings',coalesce((SELECT jsonb_agg(jsonb_build_object('booking_id',b.booking_id,'customer_id',b.customer_id,'location_id',b.location_id,'requested_start',b.requested_start,'assigned_start',b.assigned_start,'state',b.state,'version',b.version,'cancelled_at',b.cancelled_at)) FROM mawid_core.bookings b WHERE b.workspace_id=w AND (j.location_id IS NULL OR b.location_id=j.location_id) AND (j.customer_id IS NULL OR b.customer_id=j.customer_id)),'[]'::jsonb)) INTO result; RETURN result; END $$;
GRANT EXECUTE ON FUNCTION mawid_core.validate_import(uuid,uuid,text,jsonb),mawid_core.preview_import(uuid,uuid,text,text,jsonb),mawid_core.confirm_import(uuid,uuid,text,boolean),mawid_core.request_export(uuid,uuid,uuid),mawid_core.download_export(uuid,uuid) TO mawid_local_actor;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mawid_core FROM PUBLIC;
