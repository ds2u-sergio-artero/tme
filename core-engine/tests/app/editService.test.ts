import { describe, test, expect } from 'vitest';
import { editTaskFields, editDeadline, addTagService, removeTagService } from '../../src/app/editService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { taskRepo, eventRepo, clock };
}

describe('editTaskFields', () => {
  test('updates title and description with no event recorded', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = createTask({ title: 'Old', description: 'Old desc', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);

    const result = await editTaskFields({ taskRepo, clock }, task.id, { title: 'New', description: 'New desc' });

    expect(result.title).toBe('New');
    expect(result.description).toBe('New desc');
    expect(await eventRepo.findByTaskId(task.id)).toHaveLength(0);
  });
});

describe('editDeadline', () => {
  test('changes the deadline and records deadline_changed', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);
    const deadline = new Date('2026-03-01T00:00:00Z');

    const result = await editDeadline({ taskRepo, eventRepo, clock }, task.id, deadline);

    expect(result.deadline).toBe(deadline);
    const events = await eventRepo.findByTaskId(task.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('deadline_changed');
  });

  test('also records promotion_override_cleared when changing the deadline clears an active override', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const oldDeadline = new Date('2025-12-01T00:00:00Z');
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()),
      deadline: oldDeadline,
      promotionOverride: oldDeadline,
    };
    await taskRepo.save(task);

    await editDeadline({ taskRepo, eventRepo, clock }, task.id, new Date('2026-06-01T00:00:00Z'));

    const events = await eventRepo.findByTaskId(task.id);
    expect(events.map((e: typeof events[0]) => e.eventType)).toEqual(['deadline_changed', 'promotion_override_cleared']);
  });
});

describe('addTagService / removeTagService', () => {
  test('adds then removes a tag', async () => {
    const { taskRepo, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);

    const tagged = await addTagService({ taskRepo, clock }, task.id, 'client-x');
    expect(tagged.tags).toEqual(['client-x']);

    const untagged = await removeTagService({ taskRepo, clock }, task.id, 'client-x');
    expect(untagged.tags).toEqual([]);
  });
});
