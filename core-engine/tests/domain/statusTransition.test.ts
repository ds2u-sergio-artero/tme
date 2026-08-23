import { describe, test, expect } from 'vitest';
import { createTask, Status } from '../../src/domain/task.js';
import { canTransition, transitionStatus } from '../../src/domain/statusTransition.js';
import { DomainError } from '../../src/domain/errors.js';

const now = new Date('2026-01-01T00:00:00Z');

function taskWithStatus(status: Status) {
  return { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now), status };
}

describe('canTransition', () => {
  test.each<[Status, Status]>([
    ['Open', 'Scheduled'],
    ['Scheduled', 'Open'],
    ['Open', 'Delegated'],
    ['Scheduled', 'Delegated'],
    ['Open', 'Completed'],
    ['Scheduled', 'Completed'],
    ['Delegated', 'Completed'],
    ['Delegated', 'Archived'],
    ['Completed', 'Archived'],
    ['Completed', 'Deleted'],
    ['Archived', 'Open'],
    ['Archived', 'Deleted'],
    ['Open', 'Archived'],
    ['Scheduled', 'Archived'],
    ['Open', 'Deleted'],
    ['Scheduled', 'Deleted'],
    ['Delegated', 'Deleted'],
  ])('%s -> %s is legal', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  test.each<[Status, Status]>([
    ['Delegated', 'Open'],
    ['Delegated', 'Scheduled'],
    ['Completed', 'Open'],
    ['Completed', 'Scheduled'],
    ['Archived', 'Scheduled'],
    ['Archived', 'Completed'],
    ['Deleted', 'Open'],
    ['Deleted', 'Archived'],
    ['Open', 'Open'],
    ['Scheduled', 'Scheduled'],
  ])('%s -> %s is illegal', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('transitionStatus', () => {
  test('returns a new task with the target status on a legal move', () => {
    const task = taskWithStatus('Open');
    const result = transitionStatus(task, 'Scheduled', now);
    expect(result.status).toBe('Scheduled');
    expect(result.updatedAt).toBe(now);
  });

  test('throws DomainError on an illegal move', () => {
    const task = taskWithStatus('Deleted');
    expect(() => transitionStatus(task, 'Open', now)).toThrow(DomainError);
  });

  test('Deleted is terminal — no move out of it is legal', () => {
    expect(canTransition('Deleted', 'Open')).toBe(false);
    expect(canTransition('Deleted', 'Archived')).toBe(false);
    expect(canTransition('Deleted', 'Completed')).toBe(false);
  });
});
