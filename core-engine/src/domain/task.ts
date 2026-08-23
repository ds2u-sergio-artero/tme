export type Status = 'Open' | 'Scheduled' | 'Delegated' | 'Completed' | 'Archived' | 'Deleted';
export type Source = 'manual' | 'outlook_email' | 'calendar_event';

export interface CalendarEventRef {
  provider: string;
  externalEventId: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  source: Source;
  sourceRefId: string | null;
  emailSnapshot: Record<string, unknown> | null;
  importance: boolean | null;
  urgency: boolean | null;
  suggestedImportance: boolean | null;
  suggestedUrgency: boolean | null;
  deadline: Date | null;
  scheduledDate: Date | null;
  calendarEventRef: CalendarEventRef | null;
  promotionOverride: Date | null;
  schedulingRemoved: boolean;
  snoozedUntil: Date | null;
  status: Status;
  assignee: string | null;
  followUpDate: Date | null;
  delegateStatus: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTaskInput {
  title: string;
  description: string;
  source: Source;
  sourceRefId: string | null;
  emailSnapshot?: Record<string, unknown> | null;
}

export function createTask(input: NewTaskInput, now: Date): Task {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description,
    source: input.source,
    sourceRefId: input.sourceRefId,
    emailSnapshot: input.emailSnapshot ?? null,
    importance: null,
    urgency: null,
    suggestedImportance: null,
    suggestedUrgency: null,
    deadline: null,
    scheduledDate: null,
    calendarEventRef: null,
    promotionOverride: null,
    schedulingRemoved: false,
    snoozedUntil: null,
    status: 'Open',
    assignee: null,
    followUpDate: null,
    delegateStatus: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
