import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';

describe('createTask', () => {
  test('creates a task with null axes and Open status in the Inbox', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const task = createTask(
      { title: 'Reply to client', description: 'Send the proposal', source: 'manual', sourceRefId: null },
      now
    );

    expect(task.title).toBe('Reply to client');
    expect(task.description).toBe('Send the proposal');
    expect(task.source).toBe('manual');
    expect(task.sourceRefId).toBeNull();
    expect(task.importance).toBeNull();
    expect(task.urgency).toBeNull();
    expect(task.status).toBe('Open');
    expect(task.tags).toEqual([]);
    expect(task.schedulingRemoved).toBe(false);
    expect(task.createdAt).toBe(now);
    expect(task.updatedAt).toBe(now);
    expect(typeof task.id).toBe('string');
    expect(task.id.length).toBeGreaterThan(0);
  });

  test('stores an email snapshot when provided, and defaults it to null otherwise', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const withSnapshot = createTask(
      {
        title: 'Flagged email',
        description: '',
        source: 'outlook_email',
        sourceRefId: 'msg-123',
        emailSnapshot: { subject: 'Q3 budget' },
      },
      now
    );
    const withoutSnapshot = createTask(
      { title: 'Manual task', description: '', source: 'manual', sourceRefId: null },
      now
    );

    expect(withSnapshot.emailSnapshot).toEqual({ subject: 'Q3 budget' });
    expect(withSnapshot.sourceRefId).toBe('msg-123');
    expect(withoutSnapshot.emailSnapshot).toBeNull();
  });
});
