import { describe, test, expect } from 'vitest';
import { createTask } from '../../src/domain/task.js';
import { addTag, removeTag } from '../../src/domain/tags.js';

const now = new Date('2026-01-01T00:00:00Z');

describe('addTag', () => {
  test('adds a new tag', () => {
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
    const result = addTag(task, 'urgent-client', now);
    expect(result.tags).toEqual(['urgent-client']);
  });

  test('is idempotent — adding the same tag twice does not duplicate it', () => {
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now), tags: ['urgent-client'] };
    const result = addTag(task, 'urgent-client', now);
    expect(result.tags).toEqual(['urgent-client']);
  });
});

describe('removeTag', () => {
  test('removes an existing tag', () => {
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now), tags: ['a', 'b'] };
    const result = removeTag(task, 'a', now);
    expect(result.tags).toEqual(['b']);
  });

  test('no-ops when the tag is absent', () => {
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now), tags: ['b'] };
    const result = removeTag(task, 'a', now);
    expect(result.tags).toEqual(['b']);
  });
});
