import { describe, test, expect } from 'vitest';
import { eventCancelled, LinkedTaskNotFoundError } from '../../src/app/eventCancelledService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { taskRepo, eventRepo, clock };
}

describe('eventCancelled', () => {
  test('clears the schedule, sets schedulingRemoved, and moves Scheduled back to Open', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const ref = { provider: 'google', externalEventId: 'evt-1' };
    const task = {
      ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, clock.now()),
      status: 'Scheduled' as const,
      scheduledDate: new Date('2026-02-01T00:00:00Z'),
      calendarEventRef: ref,
    };
    await taskRepo.save(task);

    const result = await eventCancelled({ taskRepo, eventRepo, clock }, ref);

    expect(result.status).toBe('Open');
    expect(result.scheduledDate).toBeNull();
    expect(result.schedulingRemoved).toBe(true);
    const events = await eventRepo.findByTaskId(task.id);
    expect(events[0].eventType).toBe('status_transition');
  });

  test('throws LinkedTaskNotFoundError when no task links the given event', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    await expect(
      eventCancelled({ taskRepo, eventRepo, clock }, { provider: 'google', externalEventId: 'missing' })
    ).rejects.toThrow(LinkedTaskNotFoundError);
  });
});
