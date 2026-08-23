import { describe, test, expect } from 'vitest';
import { deadlinesDueWithin, followUpsDueWithin } from '../../src/app/notificationQueries.js';
import { FakeTaskRepository, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';

describe('deadlinesDueWithin', () => {
  test('returns tasks with a deadline in the window, excluding snoozed ones', async () => {
    const taskRepo = new FakeTaskRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

    const due = { ...createTask({ title: 'Due', description: '', source: 'manual', sourceRefId: null }, clock.now()), deadline: new Date('2026-01-05T00:00:00Z') };
    const snoozed = {
      ...createTask({ title: 'Snoozed', description: '', source: 'manual', sourceRefId: null }, clock.now()),
      deadline: new Date('2026-01-05T00:00:00Z'),
      snoozedUntil: new Date('2026-01-10T00:00:00Z'),
    };
    await taskRepo.save(due);
    await taskRepo.save(snoozed);

    const results = await deadlinesDueWithin({ taskRepo, clock }, new Date('2026-01-07T00:00:00Z'));

    expect(results.map((t) => t.id)).toEqual([due.id]);
  });
});

describe('followUpsDueWithin', () => {
  test('returns tasks with a follow-up date in the window, excluding snoozed ones', async () => {
    const taskRepo = new FakeTaskRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

    const due = { ...createTask({ title: 'Due', description: '', source: 'manual', sourceRefId: null }, clock.now()), followUpDate: new Date('2026-01-05T00:00:00Z') };
    const snoozed = {
      ...createTask({ title: 'Snoozed', description: '', source: 'manual', sourceRefId: null }, clock.now()),
      followUpDate: new Date('2026-01-05T00:00:00Z'),
      snoozedUntil: new Date('2026-01-10T00:00:00Z'),
    };
    await taskRepo.save(due);
    await taskRepo.save(snoozed);

    const results = await followUpsDueWithin({ taskRepo, clock }, new Date('2026-01-07T00:00:00Z'));

    expect(results.map((t) => t.id)).toEqual([due.id]);
  });
});
