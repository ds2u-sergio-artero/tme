import { Task } from './task.js';
import { transitionStatus } from './statusTransition.js';

export function applyEventCancelled(task: Task, now: Date): Task {
  const next = task.status === 'Scheduled' ? transitionStatus(task, 'Open', now) : task;
  return {
    ...next,
    scheduledDate: null,
    calendarEventRef: null,
    schedulingRemoved: true,
    updatedAt: now,
  };
}
