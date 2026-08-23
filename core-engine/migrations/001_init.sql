CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('manual', 'outlook_email', 'calendar_event')),
  source_ref_id TEXT,
  email_snapshot JSONB,
  importance BOOLEAN,
  urgency BOOLEAN,
  suggested_importance BOOLEAN,
  suggested_urgency BOOLEAN,
  deadline TIMESTAMPTZ,
  scheduled_date TIMESTAMPTZ,
  calendar_event_provider TEXT,
  calendar_event_external_id TEXT,
  promotion_override TIMESTAMPTZ,
  scheduling_removed BOOLEAN NOT NULL DEFAULT FALSE,
  snoozed_until TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('Open', 'Scheduled', 'Delegated', 'Completed', 'Archived', 'Deleted')),
  assignee TEXT,
  follow_up_date TIMESTAMPTZ,
  delegate_status TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

-- Invariant 3 / CE-DEC-012: the (source, source_ref_id) claim is permanent, including
-- past deletion. The row is retained (status just becomes 'Deleted'), so a plain
-- partial unique index — not a soft-delete-aware one — is exactly correct here.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_source_dedupe_idx ON tasks (source, source_ref_id) WHERE source_ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_events (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id),
  event_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS task_events_task_id_idx ON task_events (task_id, occurred_at);
