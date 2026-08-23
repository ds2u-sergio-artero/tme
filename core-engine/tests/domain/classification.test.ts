import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { classify, recordSuggestion, approveSuggestion, rejectSuggestion } from '../../src/domain/classification.js';
import { DomainError } from '../../src/domain/errors.js';

const now = new Date('2026-01-01T00:00:00Z');

function baseTask() {
  return createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
}

describe('classify', () => {
  test('sets importance and urgency directly, regardless of any pending suggestion', () => {
    const task = { ...baseTask(), suggestedImportance: true, suggestedUrgency: true };
    const result = classify(task, false, true, now);

    expect(result.importance).toBe(false);
    expect(result.urgency).toBe(true);
    expect(result.suggestedImportance).toBe(true);
    expect(result.suggestedUrgency).toBe(true);
  });

  test('confirming Schedule on a task that is auto-promoted to Do places an override bound to the deadline', () => {
    const past = new Date('2025-12-01T00:00:00Z');
    const promoted = { ...baseTask(), importance: true, urgency: false, deadline: past, promotionOverride: null };
    const result = classify(promoted, true, false, now);
    expect(result.promotionOverride).toEqual(past);
  });

  test('reclassifying an auto-promoted task to a different quadrant does not place an override', () => {
    const past = new Date('2025-12-01T00:00:00Z');
    const promoted = { ...baseTask(), importance: true, urgency: false, deadline: past, promotionOverride: null };
    const result = classify(promoted, false, false, now);
    expect(result.promotionOverride).toBeNull();
  });

  test('classifying a task that was never auto-promoted does not place an override', () => {
    const task = baseTask();
    const result = classify(task, true, false, now);
    expect(result.promotionOverride).toBeNull();
  });
});

describe('recordSuggestion', () => {
  test('writes only the suggested_* fields, leaving the real axes untouched', () => {
    const task = baseTask();
    const result = recordSuggestion(task, true, false, now);

    expect(result.suggestedImportance).toBe(true);
    expect(result.suggestedUrgency).toBe(false);
    expect(result.importance).toBeNull();
    expect(result.urgency).toBeNull();
  });
});

describe('approveSuggestion', () => {
  test('copies the suggested values onto the real axes and clears the suggestion', () => {
    const task = { ...baseTask(), suggestedImportance: true, suggestedUrgency: false };
    const result = approveSuggestion(task, now);

    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(false);
    expect(result.suggestedImportance).toBeNull();
    expect(result.suggestedUrgency).toBeNull();
  });

  test('throws DomainError when there is no pending suggestion', () => {
    const task = baseTask();
    expect(() => approveSuggestion(task, now)).toThrow(DomainError);
  });
});

describe('rejectSuggestion', () => {
  test('clears the suggestion and leaves the real axes untouched', () => {
    const task = { ...baseTask(), importance: true, urgency: true, suggestedImportance: false, suggestedUrgency: false };
    const result = rejectSuggestion(task, now);

    expect(result.suggestedImportance).toBeNull();
    expect(result.suggestedUrgency).toBeNull();
    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(true);
  });
});
