export type EventType =
  | 'capture'
  | 'classification_applied'
  | 'suggestion_rejected'
  | 'status_transition'
  | 'snoozed'
  | 'unsnoozed'
  | 'deadline_changed'
  | 'promotion_override_placed'
  | 'promotion_override_cleared';

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: EventType;
  oldValue: unknown;
  newValue: unknown;
  occurredAt: Date;
}

export function createTaskEvent(
  taskId: string,
  eventType: EventType,
  oldValue: unknown,
  newValue: unknown,
  now: Date
): TaskEvent {
  return { id: crypto.randomUUID(), taskId, eventType, oldValue, newValue, occurredAt: now };
}
