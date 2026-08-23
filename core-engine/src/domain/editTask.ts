import { Task } from './task.js';

export function setDeadline(task: Task, deadline: Date | null, now: Date): Task {
  const oldTime = task.deadline ? task.deadline.getTime() : null;
  const newTime = deadline ? deadline.getTime() : null;
  const changed = oldTime !== newTime;
  return {
    ...task,
    deadline,
    promotionOverride: changed ? null : task.promotionOverride,
    updatedAt: now,
  };
}
