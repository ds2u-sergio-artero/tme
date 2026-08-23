import { Task } from './task.js';
import { DomainError } from './errors.js';

export function classify(task: Task, importance: boolean, urgency: boolean, now: Date): Task {
  return { ...task, importance, urgency, updatedAt: now };
}

export function recordSuggestion(task: Task, importance: boolean, urgency: boolean, now: Date): Task {
  return { ...task, suggestedImportance: importance, suggestedUrgency: urgency, updatedAt: now };
}

export function approveSuggestion(task: Task, now: Date): Task {
  if (task.suggestedImportance === null || task.suggestedUrgency === null) {
    throw new DomainError('Task has no pending suggestion to approve');
  }
  const classified = classify(task, task.suggestedImportance, task.suggestedUrgency, now);
  return { ...classified, suggestedImportance: null, suggestedUrgency: null };
}

export function rejectSuggestion(task: Task, now: Date): Task {
  return { ...task, suggestedImportance: null, suggestedUrgency: null, updatedAt: now };
}
