import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { delegateTask } from '../../src/domain/delegate.js';
import { DomainError } from '../../src/domain/errors.js';

const now = new Date('2026-01-01T00:00:00Z');
const followUp = new Date('2026-01-08T00:00:00Z');

describe('delegateTask', () => {
  test('delegating an Open task sets assignee, follow-up date, and status Delegated', () => {
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
    const result = delegateTask(task, 'alice@example.com', followUp, now);

    expect(result.status).toBe('Delegated');
    expect(result.assignee).toBe('alice@example.com');
    expect(result.followUpDate).toBe(followUp);
    expect(result.scheduledDate).toBeNull();
    expect(result.calendarEventRef).toBeNull();
  });

  test('delegating a Scheduled task auto-clears scheduledDate and calendarEventRef locally', () => {
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
      status: 'Scheduled' as const,
      scheduledDate: new Date('2026-02-01T00:00:00Z'),
      calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
    };

    const result = delegateTask(task, 'bob@example.com', followUp, now);

    expect(result.status).toBe('Delegated');
    expect(result.scheduledDate).toBeNull();
    expect(result.calendarEventRef).toBeNull();
  });

  test('throws DomainError when the task cannot legally become Delegated', () => {
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
      status: 'Completed' as const,
    };
    expect(() => delegateTask(task, 'alice@example.com', followUp, now)).toThrow(DomainError);
  });
});
