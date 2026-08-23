import { Task } from '../domain/task.js';
import { transitionStatus } from '../domain/statusTransition.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { SchedulingPort } from '../ports/SchedulingPort.js';
import { Clock } from '../ports/Clock.js';

export async function scheduleTask(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; schedulingPort: SchedulingPort; clock: Clock },
  taskId: string,
  scheduledDate: Date
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const transitioned = transitionStatus(task, 'Scheduled', now);
  const ref = await deps.schedulingPort.createEvent(task);
  const updated: Task = { ...transitioned, scheduledDate, calendarEventRef: ref };

  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
  return updated;
}
