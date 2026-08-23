import { Task } from '../domain/task.js';
import { isSnoozed } from '../domain/snooze.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { Clock } from '../ports/Clock.js';

export async function deadlinesDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]> {
  const now = deps.clock.now();
  const tasks = await deps.taskRepo.findDeadlinesDueWithin(now, windowEnd);
  return tasks.filter((t: Task) => !isSnoozed(t, now));
}

export async function followUpsDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]> {
  const now = deps.clock.now();
  const tasks = await deps.taskRepo.findFollowUpsDueWithin(now, windowEnd);
  return tasks.filter((t: Task) => !isSnoozed(t, now));
}
