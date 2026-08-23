import { describe, test, expect } from 'vitest';
import { delegateTaskService } from '../../src/app/delegateService.js';
import { scheduleTask } from '../../src/app/scheduleService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { taskRepo, eventRepo, clock };
}

describe('delegateTaskService', () => {
  test('delegating an Open task sets assignee/follow-up and records a status_transition event', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);
    const followUp = new Date('2026-01-08T00:00:00Z');

    const result = await delegateTaskService({ taskRepo, eventRepo, clock }, task.id, 'alice@example.com', followUp);

    expect(result.status).toBe('Delegated');
    expect(result.assignee).toBe('alice@example.com');
    const events = await eventRepo.findByTaskId(task.id);
    expect(events[0].eventType).toBe('status_transition');
    expect(events[0].newValue).toBe('Delegated');
  });

  test('delegating a scheduled task clears the schedule locally without ever touching the calendar', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const schedulingPort = new FakeSchedulingPort();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);

    const scheduled = await scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, new Date('2026-02-01T00:00:00Z'));
    expect(schedulingPort.calls).toHaveLength(1);

    const delegated = await delegateTaskService({ taskRepo, eventRepo, clock }, scheduled.id, 'bob@example.com', new Date('2026-01-08T00:00:00Z'));

    expect(delegated.status).toBe('Delegated');
    expect(delegated.scheduledDate).toBeNull();
    expect(delegated.calendarEventRef).toBeNull();
    expect(schedulingPort.calls).toHaveLength(1); // unchanged — delegate never calls SchedulingPort
  });
});
