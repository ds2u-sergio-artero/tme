import { Task } from './task.js';
import { transitionStatus } from './statusTransition.js';

export function delegateTask(task: Task, assignee: string, followUpDate: Date, now: Date): Task {
  const transitioned = transitionStatus(task, 'Delegated', now);
  return {
    ...transitioned,
    assignee,
    followUpDate,
    scheduledDate: null,
    calendarEventRef: null,
  };
}
