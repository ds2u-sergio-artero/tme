import { Task } from '../domain/task.js';
import { snoozeTask, unsnoozeTask } from '../domain/snooze.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';

export interface SnoozeDeps {
  taskRepo: TaskRepository;
  eventRepo: TaskEventRepository;
  clock: Clock;
}

export async function snoozeTaskService(deps: SnoozeDeps, taskId: string, until: Date): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = snoozeTask(task, until, now);
  await deps.taskRepo.save(updated);
  if (task.snoozedUntil?.getTime() !== until.getTime()) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'snoozed', task.snoozedUntil, until, now));
  }
  return updated;
}

export async function unsnoozeTaskService(deps: SnoozeDeps, taskId: string): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = unsnoozeTask(task, now);
  await deps.taskRepo.save(updated);
  if (task.snoozedUntil !== null) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'unsnoozed', task.snoozedUntil, null, now));
  }
  return updated;
}
