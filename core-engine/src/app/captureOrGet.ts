import { Task, Source, createTask } from '../domain/task.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { Clock } from '../ports/Clock.js';

export interface CaptureContent {
  title: string;
  description: string;
  emailSnapshot?: Record<string, unknown> | null;
}

export interface CaptureOrGetDeps {
  taskRepo: TaskRepository;
  eventRepo: TaskEventRepository;
  clock: Clock;
}

export async function captureOrGet(
  deps: CaptureOrGetDeps,
  source: Source,
  sourceRefId: string | null,
  content: CaptureContent
): Promise<Task> {
  if (sourceRefId !== null) {
    const existing = await deps.taskRepo.findBySource(source, sourceRefId);
    if (existing !== null) return existing;
  }

  const now = deps.clock.now();
  const task = createTask(
    {
      title: content.title,
      description: content.description,
      source,
      sourceRefId,
      emailSnapshot: content.emailSnapshot,
    },
    now
  );
  await deps.taskRepo.save(task);
  await deps.eventRepo.append(createTaskEvent(task.id, 'capture', null, { source, sourceRefId }, now));
  return task;
}
