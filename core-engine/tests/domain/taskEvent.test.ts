import { describe, test, expect } from 'vitest';
import { createTaskEvent } from '../../src/domain/taskEvent.js';

describe('createTaskEvent', () => {
  test('builds an event with all fields set and a generated id', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const event = createTaskEvent('task-1', 'capture', null, { source: 'manual' }, now);

    expect(event.taskId).toBe('task-1');
    expect(event.eventType).toBe('capture');
    expect(event.oldValue).toBeNull();
    expect(event.newValue).toEqual({ source: 'manual' });
    expect(event.occurredAt).toBe(now);
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);
  });

  test('generates a different id for each event', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const first = createTaskEvent('task-1', 'capture', null, {}, now);
    const second = createTaskEvent('task-1', 'capture', null, {}, now);
    expect(first.id).not.toBe(second.id);
  });
});
