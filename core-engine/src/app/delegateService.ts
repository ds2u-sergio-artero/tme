import { Task } from '../domain/task.js';
import { delegateTask } from '../domain/delegate.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';

export async function delegateTaskService(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  taskId: string,
  assignee: string,
  followUpDate: Date
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = delegateTask(task, assignee, followUpDate, now);

  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
  return updated;
}

// No TaskEvent: the Section 6 event list is closed and has no delegate-status type (deliberate).
export async function setDelegateStatus(
  deps: { taskRepo: TaskRepository; clock: Clock },
  taskId: string,
  value: string | null
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated: Task = { ...task, delegateStatus: value, updatedAt: now };
  await deps.taskRepo.save(updated);
  return updated;
}
