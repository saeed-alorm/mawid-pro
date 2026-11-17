-- One delayed action per booking event, using the original outbox and delivery leases.
ALTER TABLE mawid_core.outbox
  ADD COLUMN scheduled_kind text CHECK(scheduled_kind IN ('pending_reminder','review_invitation')),
  ADD COLUMN scheduled_due_at timestamptz,
  ADD COLUMN scheduled_processed_at timestamptz,
  ADD CHECK((scheduled_kind IS NULL)=(scheduled_due_at IS NULL)),
  ADD CHECK(scheduled_processed_at IS NULL OR scheduled_due_at IS NOT NULL);
CREATE INDEX outbox_scheduled_due ON mawid_core.outbox(scheduled_due_at,workspace_id,event_id)
  WHERE scheduled_due_at IS NOT NULL AND scheduled_processed_at IS NULL;

ALTER TABLE mawid_core.notification_inbox
  ADD COLUMN kind text NOT NULL DEFAULT 'booking'
    CHECK(kind IN ('booking','pending_reminder','review_invitation')),
  DROP CONSTRAINT notification_inbox_workspace_id_event_id_actor_id_key,
  ADD UNIQUE(workspace_id,event_id,actor_id,kind);

GRANT SELECT ON mawid_core.visit_segments TO mawid_local_notify;
CREATE POLICY visit_segment_notification_read ON mawid_core.visit_segments
  FOR SELECT TO mawid_local_notify USING(true);
