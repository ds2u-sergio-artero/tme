import { describe, test, expect } from 'vitest';
import { classifyManually, requestSuggestion, approveSuggestionService, rejectSuggestionService } from '../../src/app/classifyService.js';
import { FakeTaskRepository, FakeTaskEventRepository, FakeSuggestionPort, FixedClock } from './fakes.js';
import { createTask } from '../../src/domain/task.js';
import type { TaskEvent } from '../../src/domain/taskEvent.js';

function setup() {
  const taskRepo = new FakeTaskRepository();
  const eventRepo = new FakeTaskEventRepository();
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  return { taskRepo, eventRepo, clock };
}

describe('classifyManually', () => {
  test('sets the real axes and records a classification_applied event with manual origin', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);

    const result = await classifyManually({ taskRepo, eventRepo, clock }, task.id, true, true);

    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(true);
    const events = await eventRepo.findByTaskId(task.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('classification_applied');
    expect(events[0].newValue).toEqual({ importance: true, urgency: true, origin: 'manual' });
  });

  test('places promotion_override and records promotion_override_placed event when classifying auto-promoted task', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const now = new Date('2026-01-03T00:00:00Z');
    const deadline = new Date('2026-01-01T00:00:00Z');

    const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, deadline);
    const autoPromotedTask = {
      ...task,
      importance: true,
      urgency: false,
      deadline: deadline,
    };
    await taskRepo.save(autoPromotedTask);

    const clock2 = new FixedClock(now);
    const result = await classifyManually({ taskRepo, eventRepo, clock: clock2 }, task.id, true, false);

    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(false);
    expect(result.promotionOverride).toEqual(deadline);

    const events = await eventRepo.findByTaskId(task.id);
    expect(events).toHaveLength(2);
    const classificationEvent = events.find((e: TaskEvent) => e.eventType === 'classification_applied');
    const overrideEvent = events.find((e: TaskEvent) => e.eventType === 'promotion_override_placed');
    expect(classificationEvent).toBeDefined();
    expect(overrideEvent).toBeDefined();
    expect(overrideEvent?.newValue).toEqual(deadline);
  });
});

describe('requestSuggestion', () => {
  test('calls SuggestionPort and stores the result into suggested_* only', async () => {
    const { taskRepo, clock } = setup();
    const task = createTask({ title: 'T', description: 'D', source: 'manual', sourceRefId: null }, clock.now());
    await taskRepo.save(task);
    const suggestionPort = new FakeSuggestionPort({ importance: true, urgency: false });

    const result = await requestSuggestion({ taskRepo, suggestionPort, clock }, task.id);

    expect(result.suggestedImportance).toBe(true);
    expect(result.suggestedUrgency).toBe(false);
    expect(result.importance).toBeNull();
    expect(result.urgency).toBeNull();
  });
});

describe('approveSuggestionService', () => {
  test('copies the suggestion onto the real axes and records classification_applied with approved_ai origin', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()),
      suggestedImportance: true,
      suggestedUrgency: false,
    };
    await taskRepo.save(task);

    const result = await approveSuggestionService({ taskRepo, eventRepo, clock }, task.id);

    expect(result.importance).toBe(true);
    expect(result.urgency).toBe(false);
    expect(result.suggestedImportance).toBeNull();
    const events = await eventRepo.findByTaskId(task.id);
    expect(events[0].newValue).toEqual({ importance: true, urgency: false, origin: 'approved_ai' });
  });
});

describe('rejectSuggestionService', () => {
  test('clears the suggestion and records suggestion_rejected', async () => {
    const { taskRepo, eventRepo, clock } = setup();
    const task = {
      ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()),
      suggestedImportance: true,
      suggestedUrgency: true,
    };
    await taskRepo.save(task);

    const result = await rejectSuggestionService({ taskRepo, eventRepo, clock }, task.id);

    expect(result.suggestedImportance).toBeNull();
    expect(result.suggestedUrgency).toBeNull();
    const events = await eventRepo.findByTaskId(task.id);
    expect(events[0].eventType).toBe('suggestion_rejected');
  });
});
