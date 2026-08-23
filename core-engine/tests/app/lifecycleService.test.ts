import { describe, test, expect } from 'vitest';
import { completeTask, archiveTask, restoreTask, deleteTask } from '../../src/app/lifecycleService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';
import { DomainError } from '../../src/domain/errors.js';

function setup(status: 'Open' | 'Scheduled' | 'Archived' | 'Deleted' = 'Open') {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status };
  return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, task };
}

describe('completeTask', () => {
  test('moves an Open task to Completed and records a status_transition event', async () => {
    const { deps, taskRepo, eventRepo, task } = setup();
    await taskRepo.save(task);
    const result = await completeTask(deps, task.id);
    expect(result.status).toBe('Completed');
    expect((await eventRepo.findByTaskId(task.id))[0].newValue).toBe('Completed');
  });
});

describe('archiveTask', () => {
  test('moves any status to Archived', async () => {
    const { deps, taskRepo, task } = setup();
    await taskRepo.save(task);
    const result = await archiveTask(deps, task.id);
    expect(result.status).toBe('Archived');
  });
});

describe('restoreTask', () => {
  test('restores an Archived task to Open', async () => {
    const { deps, taskRepo, task } = setup('Archived');
    await taskRepo.save(task);
    const result = await restoreTask(deps, task.id);
    expect(result.status).toBe('Open');
  });

  test('throws DomainError restoring a Scheduled task', async () => {
    const { deps, taskRepo, task } = setup('Scheduled');
    await taskRepo.save(task);
    await expect(restoreTask(deps, task.id)).rejects.toThrow(DomainError);
  });

  test('throws DomainError restoring a task that is not Archived', async () => {
    const { deps, taskRepo, task } = setup('Open');
    await taskRepo.save(task);
    await expect(restoreTask(deps, task.id)).rejects.toThrow(DomainError);
  });
});

describe('deleteTask', () => {
  test('moves any status to Deleted', async () => {
    const { deps, taskRepo, task } = setup();
    await taskRepo.save(task);
    const result = await deleteTask(deps, task.id);
    expect(result.status).toBe('Deleted');
  });

  test('throws DomainError deleting a task that is already Deleted (terminal)', async () => {
    const { deps, taskRepo, task } = setup('Deleted');
    await taskRepo.save(task);
    await expect(deleteTask(deps, task.id)).rejects.toThrow(DomainError);
  });
});
