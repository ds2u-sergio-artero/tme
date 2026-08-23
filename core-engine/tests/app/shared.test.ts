import { describe, test, expect } from 'vitest';
import { mustFindTask, TaskNotFoundError } from '../../src/app/shared.js';
import { FakeTaskRepository } from './fakes.js';
import { createTask } from '../../src/domain/task.js';

describe('mustFindTask', () => {
  test('returns the task when it exists', async () => {
    const repo = new FakeTaskRepository();
    const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
    await repo.save(task);
    expect(await mustFindTask(repo, task.id)).toEqual(task);
  });

  test('throws TaskNotFoundError when the task does not exist', async () => {
    const repo = new FakeTaskRepository();
    await expect(mustFindTask(repo, 'missing-id')).rejects.toThrow(TaskNotFoundError);
  });
});
