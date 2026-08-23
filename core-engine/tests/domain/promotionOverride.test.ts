import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { classify } from '../../src/domain/classification.js';
import { setDeadline } from '../../src/domain/editTask.js';
import { effectiveQuadrant } from '../../src/domain/effectiveQuadrant.js';

describe('promotion override lifecycle', () => {
  test('moving an auto-promoted task back to Schedule places an override, and changing the deadline clears it and re-arms promotion', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const oldDeadline = new Date('2026-01-15T00:00:00Z');
    const afterFirstPass = new Date('2026-02-01T00:00:00Z');

    let task = createTask({ title: 'Renew contract', description: '', source: 'manual', sourceRefId: null }, created);
    task = { ...task, deadline: oldDeadline };
    task = classify(task, true, false, created);
    expect(effectiveQuadrant(task, afterFirstPass)).toBe('Do');

    task = classify(task, true, false, afterFirstPass);
    expect(task.promotionOverride).toEqual(oldDeadline);
    expect(effectiveQuadrant(task, afterFirstPass)).toBe('Schedule');

    const newDeadline = new Date('2026-03-15T00:00:00Z');
    task = setDeadline(task, newDeadline, afterFirstPass);
    expect(task.promotionOverride).toBeNull();

    const afterSecondPass = new Date('2026-04-01T00:00:00Z');
    expect(effectiveQuadrant(task, afterSecondPass)).toBe('Do');
  });
});
