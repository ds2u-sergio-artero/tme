import { Task } from '../domain/task.js';
import { classify, recordSuggestion, approveSuggestion, rejectSuggestion } from '../domain/classification.js';
import { createTaskEvent } from '../domain/taskEvent.js';
import { mustFindTask } from './shared.js';
import { TaskRepository } from '../ports/TaskRepository.js';
import { TaskEventRepository } from '../ports/TaskEventRepository.js';
import { SuggestionPort } from '../ports/SuggestionPort.js';
import { Clock } from '../ports/Clock.js';

export async function classifyManually(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  taskId: string,
  importance: boolean,
  urgency: boolean
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = classify(task, importance, urgency, now);
  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(
    createTaskEvent(
      taskId,
      'classification_applied',
      { importance: task.importance, urgency: task.urgency },
      { importance, urgency, origin: 'manual' },
      now
    )
  );
  if (updated.promotionOverride !== null && task.promotionOverride === null) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_placed', null, updated.promotionOverride, now));
  }
  return updated;
}

export async function requestSuggestion(
  deps: { taskRepo: TaskRepository; suggestionPort: SuggestionPort; clock: Clock },
  taskId: string
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const suggestion = await deps.suggestionPort.suggest({ title: task.title, description: task.description });
  const updated = recordSuggestion(task, suggestion.importance, suggestion.urgency, now);
  await deps.taskRepo.save(updated);
  return updated;
}

export async function approveSuggestionService(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  taskId: string
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = approveSuggestion(task, now);
  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(
    createTaskEvent(
      taskId,
      'classification_applied',
      { importance: task.importance, urgency: task.urgency },
      { importance: updated.importance, urgency: updated.urgency, origin: 'approved_ai' },
      now
    )
  );
  if (updated.promotionOverride !== null && task.promotionOverride === null) {
    await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_placed', null, updated.promotionOverride, now));
  }
  return updated;
}

export async function rejectSuggestionService(
  deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
  taskId: string
): Promise<Task> {
  const now = deps.clock.now();
  const task = await mustFindTask(deps.taskRepo, taskId);
  const updated = rejectSuggestion(task, now);
  await deps.taskRepo.save(updated);
  await deps.eventRepo.append(
    createTaskEvent(
      taskId,
      'suggestion_rejected',
      { suggestedImportance: task.suggestedImportance, suggestedUrgency: task.suggestedUrgency },
      null,
      now
    )
  );
  return updated;
}
