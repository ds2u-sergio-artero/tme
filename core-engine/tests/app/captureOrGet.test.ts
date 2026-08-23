import { describe, test, expect, vi } from 'vitest';
import { captureOrGet } from '../../src/app/captureOrGet.js';
import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes.js';
import { transitionStatus } from '../../src/domain/statusTransition.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, clock };
}

describe('captureOrGet', () => {
  test('creates a new task in the Inbox when no task claims the source/sourceRefId pair', async () => {
    const { deps, eventRepo } = setup();
    const task = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'Flagged email', description: 'body' });

    expect(task.status).toBe('Open');
    expect(task.importance).toBeNull();
    expect(task.urgency).toBeNull();
    expect(await eventRepo.findByTaskId(task.id)).toHaveLength(1);
  });

  test('returns the existing task instead of creating a duplicate for a repeat capture', async () => {
    const { deps, taskRepo } = setup();
    const saveSpy = vi.spyOn(taskRepo, 'save');

    const first = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'A', description: '' });
    const second = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'A again', description: '' });

    expect(second.id).toBe(first.id);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  test('never dedupes manual tasks — each manual capture (sourceRefId null) creates a new task', async () => {
    const { deps } = setup();
    const first = await captureOrGet(deps, 'manual', null, { title: 'Buy milk', description: '' });
    const second = await captureOrGet(deps, 'manual', null, { title: 'Buy milk', description: '' });

    expect(second.id).not.toBe(first.id);
  });

  test('dedupe survives deletion — a deleted sourced task is returned again, never recreated (CE-DEC-012)', async () => {
    const { deps, taskRepo, clock } = setup();
    const original = await captureOrGet(deps, 'calendar_event', 'evt-1', { title: 'Standup', description: '' });
    const deleted = transitionStatus(original, 'Deleted', clock.now());
    await taskRepo.save(deleted);

    const result = await captureOrGet(deps, 'calendar_event', 'evt-1', { title: 'Standup', description: '' });

    expect(result.id).toBe(original.id);
    expect(result.status).toBe('Deleted');
  });
});
