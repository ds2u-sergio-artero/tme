import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { setDeadline } from '../../src/domain/editTask.js';

const now = new Date('2026-01-01T00:00:00Z');

describe('setDeadline', () => {
  test('sets a fresh deadline when there is no prior override', () => {
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
    const deadline = new Date('2026-03-01T00:00:00Z');
    const result = setDeadline(task, deadline, now);
    expect(result.deadline).toBe(deadline);
    expect(result.promotionOverride).toBeNull();
  });

  test('clears an existing override when the deadline actually changes, re-arming promotion', () => {
    const oldDeadline = new Date('2025-12-01T00:00:00Z');
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
      deadline: oldDeadline,
      promotionOverride: oldDeadline,
    };
    const newDeadline = new Date('2026-06-01T00:00:00Z');
    const result = setDeadline(task, newDeadline, now);

    expect(result.deadline).toBe(newDeadline);
    expect(result.promotionOverride).toBeNull();
  });

  test('preserves the override when the new deadline equals the old one', () => {
    const deadline = new Date('2025-12-01T00:00:00Z');
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
      deadline,
      promotionOverride: deadline,
    };
    const result = setDeadline(task, new Date(deadline.getTime()), now);
    expect(result.promotionOverride).toEqual(deadline);
  });
});
