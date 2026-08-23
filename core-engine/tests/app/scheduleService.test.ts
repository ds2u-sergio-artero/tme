import { describe, test, expect } from 'vitest';
import { scheduleTask } from '../../src/app/scheduleService';
import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FixedClock } from './fakes';
import { createTask } from '../../src/domain/task';
import { DomainError } from '../../src/domain/errors';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const schedulingPort = new FakeSchedulingPort({ provider: 'google', externalEventId: 'evt-1' });
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { taskRepo, eventRepo, schedulingPort, clock };
}

describe('scheduleTask', () => {
  test('calls SchedulingPort.createEvent, stores the returned ref and scheduled date, and moves status to Scheduled', async () => {
    const { taskRepo, eventRepo, schedulingPort, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);
    const scheduledDate = new Date('2026-02-01T00:00:00Z');

    const result = await scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, scheduledDate);

    expect(result.status).toBe('Scheduled');
    expect(result.scheduledDate).toBe(scheduledDate);
    expect(result.calendarEventRef).toEqual({ provider: 'google', externalEventId: 'evt-1' });
    expect(schedulingPort.calls).toEqual([task]);
    const events = await eventRepo.findByTaskId(task.id);
    expect(events[0].eventType).toBe('status_transition');
    expect(events[0].newValue).toBe('Scheduled');
  });

  test('throws DomainError when the task cannot legally become Scheduled', async () => {
    const { taskRepo, eventRepo, schedulingPort, clock } = setup();
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status: 'Completed' as const };
    await taskRepo.save(task);

    await expect(
      scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, new Date('2026-02-01T00:00:00Z'))
    ).rejects.toThrow(DomainError);
  });
});
