import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { createTaskEvent } from '../../src/domain/taskEvent.js';
import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FakeSuggestionPort } from './fakes.js';

describe('FakeTaskRepository', () => {
  test('round-trips a saved task by id', async () => {
    const repo = new FakeTaskRepository();
    const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
    await repo.save(task);
    expect(await repo.findById(task.id)).toEqual(task);
  });

  test('finds a task by source and sourceRefId, and returns null when absent', async () => {
    const repo = new FakeTaskRepository();
    const task = createTask({ title: 'A', description: '', source: 'outlook_email', sourceRefId: 'msg-1' }, new Date());
    await repo.save(task);
    expect(await repo.findBySource('outlook_email', 'msg-1')).toEqual(task);
    expect(await repo.findBySource('outlook_email', 'msg-2')).toBeNull();
  });

  test('finds a task by calendarEventRef', async () => {
    const repo = new FakeTaskRepository();
    const task = {
      ...createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date()),
      calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
    };
    await repo.save(task);
    const found = await repo.findByCalendarEventRef({ provider: 'google', externalEventId: 'evt-1' });
    expect(found?.id).toBe(task.id);
  });
});

describe('FakeTaskEventRepository', () => {
  test('appends and reads back events for a task, in insertion order', async () => {
    const repo = new FakeTaskEventRepository();
    const now = new Date();
    await repo.append(createTaskEvent('task-1', 'capture', null, {}, now));
    await repo.append(createTaskEvent('task-1', 'status_transition', 'Open', 'Scheduled', now));
    await repo.append(createTaskEvent('task-2', 'capture', null, {}, now));

    const events = await repo.findByTaskId('task-1');
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe('capture');
    expect(events[1].eventType).toBe('status_transition');
  });
});

describe('FakeSchedulingPort', () => {
  test('records each call and returns the configured ref', async () => {
    const port = new FakeSchedulingPort({ provider: 'google', externalEventId: 'evt-9' });
    const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
    const ref = await port.createEvent(task);
    expect(ref).toEqual({ provider: 'google', externalEventId: 'evt-9' });
    expect(port.calls).toEqual([task]);
  });
});

describe('FakeSuggestionPort', () => {
  test('returns the configured suggestion', async () => {
    const port = new FakeSuggestionPort({ importance: true, urgency: false });
    expect(await port.suggest({ title: 'A', description: '' })).toEqual({ importance: true, urgency: false });
  });
});
