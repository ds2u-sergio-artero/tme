import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { applyEventCancelled } from '../../src/domain/eventCancelled.js';

const now = new Date('2026-01-01T00:00:00Z');

describe('applyEventCancelled', () => {
  test('clears schedule fields, sets schedulingRemoved, and moves Scheduled back to Open, axes untouched', () => {
    const task = {
      ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, now),
      status: 'Scheduled' as const,
      importance: true,
      urgency: false,
      scheduledDate: new Date('2026-02-01T00:00:00Z'),
      calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
    };

    const result = applyEventCancelled(task, now);

    expect(result.status).toBe('Open');
    expect(result.scheduledDate).toBeNull();
    expect(result.calendarEventRef).toBeNull();
    expect(result.schedulingRemoved).toBe(true);
    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(false);
  });

  test('clears fields and sets schedulingRemoved without forcing a status change when the task is not Scheduled', () => {
    const task = {
      ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, now),
      status: 'Delegated' as const,
    };

    const result = applyEventCancelled(task, now);

    expect(result.status).toBe('Delegated');
    expect(result.schedulingRemoved).toBe(true);
    expect(result.scheduledDate).toBeNull();
    expect(result.calendarEventRef).toBeNull();
  });
});
