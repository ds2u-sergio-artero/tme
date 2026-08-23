import { Task, Status } from '../domain/task.js';
import { transitionStatus } from '../domain/statusTransition.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';
import { DomainError } from '../domain/errors.js';

export interface LifecycleDeps {
  taskRepo: TaskRepository;
  eventRepo: TaskEventRepository;
  clock: Clock;
}

async function moveTo(deps: LifecycleDeps, taskId: string, to: Status): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = transitionStatus(task, to, now);
  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
  return updated;
}

export function completeTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
  return moveTo(deps, taskId, 'Completed');
}

export function archiveTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
  return moveTo(deps, taskId, 'Archived');
}

export async function restoreTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);

  // Guard: restore only works on Archived tasks
  if (task.status !== 'Archived') {
    throw new DomainError(`Cannot restore task with status ${task.status} — only Archived tasks can be restored`);
  }

  const updated = transitionStatus(task, 'Open', now);
  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
  return updated;
}

export function deleteTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
  return moveTo(deps, taskId, 'Deleted');
}
