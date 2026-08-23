import { Task, CalendarEventRef } from '../domain/task.js';

export interface SchedulingPort {
  createEvent(task: Task): Promise<CalendarEventRef>;
}
