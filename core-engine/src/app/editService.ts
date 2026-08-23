import { Task } from '../domain/task.js';
import { setDeadline } from '../domain/editTask.js';
import { addTag, removeTag } from '../domain/tags.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';

export async function editTaskFields(
  deps: { taskRepo: TaskRepository; clock: Clock },
  taskId: string,
  changes: { title?: string; description?: string }
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated: Task = { ...task, ...changes, updatedAt: now };
  await deps.taskRepo.save(updated);
  return updated;
}

export async function editDeadline(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  taskId: string,
  deadline: Date | null
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = setDeadline(task, deadline, now);
  await deps.taskRepo.save(updated);
  const oldTime = task.deadline ? task.deadline.getTime() : null;
  const newTime = updated.deadline ? updated.deadline.getTime() : null;
  if (oldTime !== newTime) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'deadline_changed', task.deadline, deadline, now));
  }
  if (task.promotionOverride !== null && updated.promotionOverride === null) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_cleared', task.promotionOverride, null, now));
  }
  return updated;
}

export async function addTagService(
  deps: { taskRepo: TaskRepository; clock: Clock },
  taskId: string,
  tag: string
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = addTag(task, tag, now);
  await deps.taskRepo.save(updated);
  return updated;
}

export async function removeTagService(
  deps: { taskRepo: TaskRepository; clock: Clock },
  taskId: string,
  tag: string
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = removeTag(task, tag, now);
  await deps.taskRepo.save(updated);
  return updated;
}
