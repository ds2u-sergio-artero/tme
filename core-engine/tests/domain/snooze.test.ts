import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { snoozeTask, unsnoozeTask, isSnoozed } from '../../src/domain/snooze.js';
import { DomainError } from '../../src/domain/errors.js';
import { Status } from '../../src/domain/task.js';

const now = new Date('2026-01-01T00:00:00Z');
const until = new Date('2026-01-08T00:00:00Z');

function taskWithStatus(status: Status) {
  return { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now), status };
}

describe('snoozeTask', () => {
  test.each<Status>(['Open', 'Scheduled', 'Delegated'])('snoozes a %s task', (status) => {
    const result = snoozeTask(taskWithStatus(status), until, now);
    expect(result.snoozedUntil).toBe(until);
  });

  test.each<Status>(['Completed', 'Archived', 'Deleted'])('throws DomainError for a %s task', (status) => {
    expect(() => snoozeTask(taskWithStatus(status), until, now)).toThrow(DomainError);
  });
});

describe('unsnoozeTask', () => {
  test.each<Status>(['Open', 'Scheduled', 'Delegated'])('clears snoozedUntil for a %s task', (status) => {
    const task = { ...taskWithStatus(status), snoozedUntil: until };
    const result = unsnoozeTask(task, now);
    expect(result.snoozedUntil).toBeNull();
  });

  test.each<Status>(['Completed', 'Archived', 'Deleted'])('throws DomainError for a %s task', (status) => {
    const task = { ...taskWithStatus(status), snoozedUntil: until };
    expect(() => unsnoozeTask(task, now)).toThrow(DomainError);
  });
});

describe('isSnoozed', () => {
  test('is true when snoozedUntil is in the future', () => {
    const task = { ...taskWithStatus('Open'), snoozedUntil: new Date('2026-01-10T00:00:00Z') };
    expect(isSnoozed(task, now)).toBe(true);
  });

  test('is false when snoozedUntil is in the past', () => {
    const task = { ...taskWithStatus('Open'), snoozedUntil: new Date('2025-12-01T00:00:00Z') };
    expect(isSnoozed(task, now)).toBe(false);
  });

  test('is false when snoozedUntil is null', () => {
    const task = taskWithStatus('Open');
    expect(isSnoozed(task, now)).toBe(false);
  });

  test('is false when snoozedUntil equals now (boundary)', () => {
    const task = { ...taskWithStatus('Open'), snoozedUntil: now };
    expect(isSnoozed(task, now)).toBe(false);
  });
});
