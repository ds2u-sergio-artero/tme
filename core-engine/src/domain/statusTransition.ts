import { Task, Status } from './task.js';
import { DomainError } from './errors.js';

const TRANSITIONS: Record<Status, Status[]> = {
  Open: ['Scheduled', 'Delegated', 'Completed', 'Archived', 'Deleted'],
  Scheduled: ['Open', 'Delegated', 'Completed', 'Archived', 'Deleted'],
  Delegated: ['Completed', 'Archived', 'Deleted'],
  Completed: ['Archived', 'Deleted'],
  Archived: ['Open', 'Deleted'],
  Deleted: [],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionStatus(task: Task, to: Status, now: Date): Task {
  if (!canTransition(task.status, to)) {
    throw new DomainError(`Illegal status transition: ${task.status} -> ${to}`);
  }
  return { ...task, status: to, updatedAt: now };
}
