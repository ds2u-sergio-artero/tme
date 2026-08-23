import { Task, Status } from './task.js';
import { DomainError } from './errors.js';

const SNOOZABLE_STATUSES: Status[] = ['Open', 'Scheduled', 'Delegated'];

export function snoozeTask(task: Task, until: Date, now: Date): Task {
  if (!SNOOZABLE_STATUSES.includes(task.status)) {
    throw new DomainError(`Cannot snooze a task with status ${task.status}`);
  }
  return { ...task, snoozedUntil: until, updatedAt: now };
}

export function unsnoozeTask(task: Task, now: Date): Task {
  return { ...task, snoozedUntil: null, updatedAt: now };
}

export function isSnoozed(task: Task, now: Date): boolean {
  return task.snoozedUntil !== null && task.snoozedUntil.getTime() > now.getTime();
}
