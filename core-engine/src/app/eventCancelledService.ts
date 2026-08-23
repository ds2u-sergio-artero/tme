import { Task, CalendarEventRef } from '../domain/task.js';
import { applyEventCancelled } from '../domain/eventCancelled.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';

export class LinkedTaskNotFoundError extends Error {
  constructor(ref: CalendarEventRef) {
    super(`No task links calendar event ${ref.provider}:${ref.externalEventId}`);
  }
}

export async function eventCancelled(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  ref: CalendarEventRef
): Promise<Task> {
  const task = await deps.taskRepo.findByCalendarEventRef(ref);
  if (task === null) throw new LinkedTaskNotFoundError(ref);

  const now = deps.clock.now();
  const updated = applyEventCancelled(task, now);
  await deps.taskRepo.save(updated);
  if (task.status !== updated.status) {
    await deps.eventRepo.append(createTaskEvent(task.id, 'status_transition', task.status, updated.status, now));
  }
  return updated;
}
