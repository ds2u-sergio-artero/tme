import { Task } from './task.js';

export type Quadrant = 'Unclassified' | 'Do' | 'Schedule' | 'Delegate' | 'Eliminate';

export function isAutoPromoted(task: Task, now: Date): boolean {
  if (task.importance !== true || task.urgency !== false) return false;
  if (task.deadline === null) return false;
  if (task.deadline.getTime() >= now.getTime()) return false;
  if (task.promotionOverride !== null && task.promotionOverride.getTime() === task.deadline.getTime()) {
    return false;
  }
  return true;
}

export function effectiveQuadrant(task: Task, now: Date): Quadrant {
  if (task.importance === null || task.urgency === null) return 'Unclassified';
  if (task.importance && task.urgency) return 'Do';
  if (!task.importance && task.urgency) return 'Delegate';
  if (!task.importance && !task.urgency) return 'Eliminate';
  return isAutoPromoted(task, now) ? 'Do' : 'Schedule';
}
