import { TaskEvent } from '../domain/taskEvent.js';

export interface TaskEventRepository {
  append(event: TaskEvent): Promise<void>;
  findByTaskId(taskId: string): Promise<TaskEvent[]>;
}
