import { Pool } from 'pg';
import { TaskEvent, EventType } from '../../domain/taskEvent.js';
import { TaskEventRepository } from '../../ports/TaskEventRepository.js';

interface TaskEventRow {
  id: string;
  task_id: string;
  event_type: EventType;
  old_value: unknown;
  new_value: unknown;
  occurred_at: Date;
}

function fromRow(row: TaskEventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    eventType: row.event_type,
    oldValue: row.old_value,
    newValue: row.new_value,
    occurredAt: row.occurred_at,
  };
}

export class PgTaskEventRepository implements TaskEventRepository {
  constructor(private pool: Pool) {}

  async append(event: TaskEvent): Promise<void> {
    await this.pool.query(
      'INSERT INTO task_events (id, task_id, event_type, old_value, new_value, occurred_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        event.id,
        event.taskId,
        event.eventType,
        event.oldValue === null ? null : JSON.stringify(event.oldValue),
        event.newValue === null ? null : JSON.stringify(event.newValue),
        event.occurredAt,
      ]
    );
  }

  async findByTaskId(taskId: string): Promise<TaskEvent[]> {
    const result = await this.pool.query<TaskEventRow>(
      'SELECT * FROM task_events WHERE task_id = $1 ORDER BY occurred_at ASC, id ASC',
      [taskId]
    );
    return result.rows.map(fromRow);
  }
}
