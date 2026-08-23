import { Task } from '../domain/task.js';
import { TaskRepository } from '../ports/TaskRepository.js';

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
  }
}

export async function mustFindTask(taskRepo: TaskRepository, taskId: string): Promise<Task> {
  const task = await taskRepo.findById(taskId);
  if (task === null) throw new TaskNotFoundError(taskId);
  return task;
}
