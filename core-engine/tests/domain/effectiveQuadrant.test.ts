import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { effectiveQuadrant, isAutoPromoted } from '../../src/domain/effectiveQuadrant.js';

const now = new Date('2026-06-01T00:00:00Z');

function baseTask() {
  return createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
}

describe('effectiveQuadrant', () => {
  test('is Unclassified when importance is null', () => {
    const task = { ...baseTask(), importance: null, urgency: true };
    expect(effectiveQuadrant(task, now)).toBe('Unclassified');
  });

  test('is Unclassified when urgency is null', () => {
    const task = { ...baseTask(), importance: true, urgency: null };
    expect(effectiveQuadrant(task, now)).toBe('Unclassified');
  });

  test('is Do when important and urgent', () => {
    const task = { ...baseTask(), importance: true, urgency: true };
    expect(effectiveQuadrant(task, now)).toBe('Do');
  });

  test('is Delegate when urgent and not important', () => {
    const task = { ...baseTask(), importance: false, urgency: true };
    expect(effectiveQuadrant(task, now)).toBe('Delegate');
  });

  test('is Eliminate when neither important nor urgent', () => {
    const task = { ...baseTask(), importance: false, urgency: false };
    expect(effectiveQuadrant(task, now)).toBe('Eliminate');
  });

  test('is Schedule when important, not urgent, and no deadline', () => {
    const task = { ...baseTask(), importance: true, urgency: false, deadline: null };
    expect(effectiveQuadrant(task, now)).toBe('Schedule');
  });

  test('is Schedule when important, not urgent, and the deadline has not passed yet', () => {
    const future = new Date('2026-12-01T00:00:00Z');
    const task = { ...baseTask(), importance: true, urgency: false, deadline: future };
    expect(effectiveQuadrant(task, now)).toBe('Schedule');
  });

  test('auto-promotes to Do when important, not urgent, and the deadline has passed with no override', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const task = { ...baseTask(), importance: true, urgency: false, deadline: past, promotionOverride: null };
    expect(effectiveQuadrant(task, now)).toBe('Do');
    expect(isAutoPromoted(task, now)).toBe(true);
  });

  test('stays Schedule when the deadline has passed but an override is bound to that exact deadline', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const task = { ...baseTask(), importance: true, urgency: false, deadline: past, promotionOverride: past };
    expect(effectiveQuadrant(task, now)).toBe('Schedule');
    expect(isAutoPromoted(task, now)).toBe(false);
  });

  test('re-arms promotion when the override is bound to a different (stale) deadline than the current one', () => {
    const past = new Date('2026-01-01T00:00:00Z');
    const staleOverride = new Date('2025-01-01T00:00:00Z');
    const task = { ...baseTask(), importance: true, urgency: false, deadline: past, promotionOverride: staleOverride };
    expect(effectiveQuadrant(task, now)).toBe('Do');
  });
});
