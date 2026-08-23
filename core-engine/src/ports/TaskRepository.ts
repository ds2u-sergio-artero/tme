import { Task, Source, CalendarEventRef } from '../domain/task.js';

export interface TaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  findBySource(source: Source, sourceRefId: string): Promise<Task | null>;
  findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null>;
  findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]>;
  findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]>;
}
