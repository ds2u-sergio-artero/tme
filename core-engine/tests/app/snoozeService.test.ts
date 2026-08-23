import { describe, test, expect } from 'vitest';
import { snoozeTaskService, unsnoozeTaskService } from '../../src/app/snoozeService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';
import { DomainError } from '../../src/domain/errors.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, clock };
}

describe('snoozeTaskService', () => {
  test('sets snoozedUntil and records a snoozed event', async () => {
    const { deps, taskRepo, eventRepo, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);
    const until = new Date('2026-01-08T00:00:00Z');

    const result = await snoozeTaskService(deps, task.id, until);

    expect(result.snoozedUntil).toBe(until);
    expect((await eventRepo.findByTaskId(task.id))[0].eventType).toBe('snoozed');
  });

  test('throws DomainError for a terminal-status task', async () => {
    const { deps, taskRepo, clock } = setup();
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status: 'Completed' as const };
    await taskRepo.save(task);

    await expect(snoozeTaskService(deps, task.id, new Date('2026-01-08T00:00:00Z'))).rejects.toThrow(DomainError);
  });
});

describe('unsnoozeTaskService', () => {
  test('clears snoozedUntil and records an unsnoozed event', async () => {
    const { deps, taskRepo, eventRepo, clock } = setup();
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), snoozedUntil: new Date('2026-01-08T00:00:00Z') };
    await taskRepo.save(task);

    const result = await unsnoozeTaskService(deps, task.id);

    expect(result.snoozedUntil).toBeNull();
    expect((await eventRepo.findByTaskId(task.id))[0].eventType).toBe('unsnoozed');
  });
});
