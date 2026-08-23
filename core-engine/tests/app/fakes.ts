import { Task, Source, Status, CalendarEventRef } from '../../src/domain/task.js';
import { TaskEvent } from '../../src/domain/taskEvent.js';
import { TaskRepository } from '../../src/ports/TaskRepository.js';
import { TaskEventRepository } from '../../src/ports/TaskEventRepository.js';
import { SchedulingPort } from '../../src/ports/SchedulingPort.js';
import { SuggestionPort, Suggestion, SuggestionContent } from '../../src/ports/SuggestionPort.js';
import { Clock } from '../../src/ports/Clock.js';

// Mirrors the status filter in PgTaskRepository's due-within queries: notification
// queries never surface tasks in a terminal status.
const ACTIVE_STATUSES: Status[] = ['Open', 'Scheduled', 'Delegated'];

export class FakeTaskRepository implements TaskRepository {
  private tasks = new Map<string, Task>();

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async findBySource(source: Source, sourceRefId: string): Promise<Task | null> {
    for (const task of this.tasks.values()) {
      if (task.source === source && task.sourceRefId === sourceRefId) return task;
    }
    return null;
  }

  async findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null> {
    for (const task of this.tasks.values()) {
      if (
        task.calendarEventRef !== null &&
        task.calendarEventRef.provider === ref.provider &&
        task.calendarEventRef.externalEventId === ref.externalEventId
      ) {
        return task;
      }
    }
    return null;
  }

  async findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      (t) =>
        t.deadline !== null &&
        t.deadline.getTime() >= from.getTime() &&
        t.deadline.getTime() <= to.getTime() &&
        ACTIVE_STATUSES.includes(t.status)
    );
  }

  async findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]> {
    return [...this.tasks.values()].filter(
      (t) =>
        t.followUpDate !== null &&
        t.followUpDate.getTime() >= from.getTime() &&
        t.followUpDate.getTime() <= to.getTime() &&
        ACTIVE_STATUSES.includes(t.status)
    );
  }
}

export class FakeTaskEventRepository implements TaskEventRepository {
  public events: TaskEvent[] = [];

  async append(event: TaskEvent): Promise<void> {
    this.events.push(event);
  }

  async findByTaskId(taskId: string): Promise<TaskEvent[]> {
    return this.events.filter((e) => e.taskId === taskId);
  }
}

export class FakeSchedulingPort implements SchedulingPort {
  public calls: Task[] = [];

  constructor(private ref: CalendarEventRef = { provider: 'google', externalEventId: 'evt-1' }) {}

  async createEvent(task: Task): Promise<CalendarEventRef> {
    this.calls.push(task);
    return this.ref;
  }
}

export class FakeSuggestionPort implements SuggestionPort {
  constructor(private suggestion: Suggestion = { importance: true, urgency: true }) {}

  async suggest(_content: SuggestionContent): Promise<Suggestion> {
    return this.suggestion;
  }
}

export class FixedClock implements Clock {
  constructor(private date: Date) {}

  now(): Date {
    return this.date;
  }
}
