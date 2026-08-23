import { Pool } from 'pg';
import { Task, Source, Status, CalendarEventRef } from '../../domain/task.js';
import { TaskRepository } from '../../ports/TaskRepository.js';

interface TaskRow {
  id: string;
  title: string;
  description: string;
  source: Source;
  source_ref_id: string | null;
  email_snapshot: Record<string, unknown> | null;
  importance: boolean | null;
  urgency: boolean | null;
  suggested_importance: boolean | null;
  suggested_urgency: boolean | null;
  deadline: Date | null;
  scheduled_date: Date | null;
  calendar_event_provider: string | null;
  calendar_event_external_id: string | null;
  promotion_override: Date | null;
  scheduling_removed: boolean;
  snoozed_until: Date | null;
  status: Status;
  assignee: string | null;
  follow_up_date: Date | null;
  delegate_status: string | null;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: TaskRow): Task {
  const calendarEventRef: CalendarEventRef | null =
    row.calendar_event_provider !== null && row.calendar_event_external_id !== null
      ? { provider: row.calendar_event_provider, externalEventId: row.calendar_event_external_id }
      : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    source: row.source,
    sourceRefId: row.source_ref_id,
    emailSnapshot: row.email_snapshot,
    importance: row.importance,
    urgency: row.urgency,
    suggestedImportance: row.suggested_importance,
    suggestedUrgency: row.suggested_urgency,
    deadline: row.deadline,
    scheduledDate: row.scheduled_date,
    calendarEventRef,
    promotionOverride: row.promotion_override,
    schedulingRemoved: row.scheduling_removed,
    snoozedUntil: row.snoozed_until,
    status: row.status,
    assignee: row.assignee,
    followUpDate: row.follow_up_date,
    delegateStatus: row.delegate_status,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PgTaskRepository implements TaskRepository {
  constructor(private pool: Pool) {}

  async save(task: Task): Promise<void> {
    await this.pool.query(
      `INSERT INTO tasks (
        id, title, description, source, source_ref_id, email_snapshot,
        importance, urgency, suggested_importance, suggested_urgency,
        deadline, scheduled_date, calendar_event_provider, calendar_event_external_id,
        promotion_override, scheduling_removed, snoozed_until, status,
        assignee, follow_up_date, delegate_status, tags, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description,
        importance = EXCLUDED.importance, urgency = EXCLUDED.urgency,
        suggested_importance = EXCLUDED.suggested_importance, suggested_urgency = EXCLUDED.suggested_urgency,
        deadline = EXCLUDED.deadline, scheduled_date = EXCLUDED.scheduled_date,
        calendar_event_provider = EXCLUDED.calendar_event_provider,
        calendar_event_external_id = EXCLUDED.calendar_event_external_id,
        promotion_override = EXCLUDED.promotion_override, scheduling_removed = EXCLUDED.scheduling_removed,
        snoozed_until = EXCLUDED.snoozed_until, status = EXCLUDED.status,
        assignee = EXCLUDED.assignee, follow_up_date = EXCLUDED.follow_up_date,
        delegate_status = EXCLUDED.delegate_status, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at`,
      [
        task.id, task.title, task.description, task.source, task.sourceRefId,
        task.emailSnapshot, task.importance, task.urgency, task.suggestedImportance, task.suggestedUrgency,
        task.deadline, task.scheduledDate,
        task.calendarEventRef?.provider ?? null, task.calendarEventRef?.externalEventId ?? null,
        task.promotionOverride, task.schedulingRemoved, task.snoozedUntil, task.status,
        task.assignee, task.followUpDate, task.delegateStatus, JSON.stringify(task.tags),
        task.createdAt, task.updatedAt,
      ]
    );
  }

  async findById(id: string): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE id = $1', [id]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async findBySource(source: Source, sourceRefId: string): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      'SELECT * FROM tasks WHERE source = $1 AND source_ref_id = $2',
      [source, sourceRefId]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null> {
    const result = await this.pool.query<TaskRow>(
      'SELECT * FROM tasks WHERE calendar_event_provider = $1 AND calendar_event_external_id = $2',
      [ref.provider, ref.externalEventId]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]> {
    const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE deadline BETWEEN $1 AND $2', [from, to]);
    return result.rows.map(fromRow);
  }

  async findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]> {
    const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE follow_up_date BETWEEN $1 AND $2', [from, to]);
    return result.rows.map(fromRow);
  }
}
