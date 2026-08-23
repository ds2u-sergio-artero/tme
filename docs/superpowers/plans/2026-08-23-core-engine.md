# Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Core Engine domain model, its six invariants, application services, event log, and a Postgres persistence adapter exactly as contracted by the approved Core Engine design spec, fully unit-testable without a database.

**Architecture:** Pragmatic domain-centric architecture per CE-DEC-011 — a pure domain layer holding the six invariants, application services orchestrating one use case each against ports, and adapters plugging into those ports. The only adapter built here is Postgres, sitting behind the `TaskRepository` and `TaskEventRepository` ports; `SchedulingPort` and `SuggestionPort` are defined as interfaces only, since their implementations belong to the Calendar and AI sub-projects (spec Section 5, Section 9).

**Tech Stack:** TypeScript strict / Node 22 / Vitest / PostgreSQL 16 via `pg` driver / plain SQL migrations

**Spec:** docs/superpowers/specs/2026-08-23-core-engine-design.md

## Global Constraints

- TypeScript strict mode everywhere (`strict: true` in tsconfig); no `any`, no implicit any.
- No ORM — all Postgres access goes through the `pg` driver with parameterized SQL (`$1, $2, ...`), never string-concatenated queries.
- `src/domain/**` imports nothing from `src/adapters/**` or `pg` — the dependency rule runs one way, domain → nothing, adapters → domain (never the reverse).
- Every business rule (Section 4 invariants) is unit-tested with no database, no framework, and no wall clock — time always comes from an injected `Clock` or a plain `Date` parameter.
- `Clock` (`src/ports/Clock.ts`) is the only source of "now" anywhere production code runs; tests use a fixed `Date` or the `FixedClock` test double, never `Date.now()`/`new Date()` inside domain or app code.
- Every task ends with `npx vitest run` green and `npx tsc --noEmit` clean before its commit.

## Design Decisions (resolving spec ambiguities)

The design spec (Sections 3-6) is conceptual by design and leaves some implementation-level shape open. These calls were made to keep the plan concrete and buildable; none of them contradict an approved decision in the spec.

- **Promotion override placement lives inside `classify`, not a separate service.** Spec Section 5 lists "classify (manually, or by approving/rejecting an AI suggestion)" as the one app service covering reclassification, and Discovery DEC-026 describes "manually move the task back to Schedule or reclassify to any quadrant" as the same user capability. `classify` therefore detects the specific case — the task was effectively `Do` via promotion, and the caller is confirming `importance=true, urgency=false` (Schedule) — and places the override itself (CE-DEC-003). No separate "un-promote" service was invented.
- **`delegateStatus` is a plain `string | null`, not an enum.** Discovery DEC-009 calls it "a manual status toggle the task owner sets by hand" but never enumerates its values, and CE spec Section 9 pins only `EmailSnapshot`'s fields as deferred to a later spec — it is silent on this one too. Modeling it as free text (like `assignee`) avoids inventing a product decision (what states exist) that belongs to a later UI spec.
- **`CalendarEventRef` is stored as two flat columns** (`calendar_event_provider`, `calendar_event_external_id`) rather than a nested JSON column, so `TaskRepository.findByCalendarEventRef` (needed for `event_cancelled`, spec Section 5) is a plain indexed-equality `WHERE`, not a JSON containment query.
- **`TaskRepository.findByCalendarEventRef` was added to the port.** Spec Section 5 requires the inbound seam `event_cancelled(event_ref)` to locate "a linked calendar event," but Section 5's port list does not separately name that lookup. This plan adds it to `TaskRepository` since the domain never touches storage directly (Section 5) and every lookup Core needs must go through a repository port.
- **`applyEventCancelled` only transitions status when the task is currently `Scheduled`.** Invariant 6 is phrased for the expected case ("moves the task's status from Scheduled back to Open"). If a stale or duplicate cancellation notice arrives for a task no longer `Scheduled`, this plan still clears the schedule fields and sets `schedulingRemoved`, but leaves `status` untouched rather than forcing a transition Invariant 4's matrix does not define (e.g. `Delegated -> Open`).
- **`scheduleTask` only accepts the `Open -> Scheduled` transition** (no reschedule-in-place operation). Invariant 4's transition matrix has no `Scheduled -> Scheduled` entry, and Section 5 describes `SchedulingPort.create_event` as a one-time action "invoked when the user schedules a task." Changing an already-scheduled task's date is not defined by this spec and is left out rather than guessed at.

None of these needed a Product Owner call — each is fully constrained by combining approved decisions already in the spec or Discovery Summary. Nothing here overrides an approved decision.

## File Structure

```
core-engine/
  package.json                                   — npm scripts (test, typecheck) and dependencies (pg, vitest, typescript)
  tsconfig.json                                   — strict TypeScript compiler config
  vitest.config.ts                                — Vitest config (tests/**/*.test.ts)
  migrations/
    001_init.sql                                  — tasks + task_events tables, dedupe partial unique index
  src/
    domain/
      errors.ts                                   — DomainError (illegal transitions, invalid operations)
      task.ts                                      — Task, Status, Source, CalendarEventRef types; createTask factory
      effectiveQuadrant.ts                         — effectiveQuadrant, isAutoPromoted (Invariant 2, CE-DEC-002/007)
      taskEvent.ts                                 — TaskEvent, EventType, createTaskEvent factory
      statusTransition.ts                          — canTransition, transitionStatus (Invariant 4)
      delegate.ts                                  — delegateTask, auto-clear on delegate (Invariant 1)
      classification.ts                            — classify, recordSuggestion, approveSuggestion, rejectSuggestion (Invariant 5, CE-DEC-003 override placement)
      editTask.ts                                  — setDeadline (clears promotion override on real change)
      eventCancelled.ts                            — applyEventCancelled (Invariant 6)
      snooze.ts                                     — snoozeTask, unsnoozeTask, isSnoozed (CE-DEC-008)
      tags.ts                                       — addTag, removeTag
    ports/
      Clock.ts                                      — Clock interface (now(): Date)
      TaskRepository.ts                             — persistence port for Task
      TaskEventRepository.ts                        — persistence port for TaskEvent
      SchedulingPort.ts                             — outbound seam to the Calendar sub-project
      SuggestionPort.ts                             — outbound seam to the AI sub-project
    app/
      shared.ts                                     — mustFindTask helper, TaskNotFoundError
      captureOrGet.ts                                — capture_or_get inbound seam (CE-DEC-004, dedupe)
      classifyService.ts                             — classify/approve/reject application service
      scheduleService.ts                             — schedule application service (calls SchedulingPort)
      delegateService.ts                             — delegate application service
      lifecycleService.ts                            — complete, archive, restore, delete
      eventCancelledService.ts                       — event_cancelled inbound seam (Invariant 6)
      snoozeService.ts                               — snooze/unsnooze application service
      editService.ts                                 — edit fields, edit deadline, tag application services
      notificationQueries.ts                         — deadlinesDueWithin, followUpsDueWithin (query seam, Section 5)
    adapters/
      postgres/
        db.ts                                        — Pool factory
        PgTaskRepository.ts                           — TaskRepository over Postgres
        PgTaskEventRepository.ts                      — TaskEventRepository over Postgres
  tests/
    domain/                                          — one test file per src/domain file, mirrored 1:1
    app/
      fakes.ts                                       — FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FakeSuggestionPort, FixedClock
      shared.test.ts, captureOrGet.test.ts, classifyService.test.ts, scheduleService.test.ts,
      delegateService.test.ts, lifecycleService.test.ts, eventCancelledService.test.ts,
      snoozeService.test.ts, editService.test.ts, notificationQueries.test.ts
    adapters/postgres/
      PgTaskRepository.integration.test.ts            — gated behind CORE_PG_URL
      PgTaskEventRepository.integration.test.ts        — gated behind CORE_PG_URL
```

## Execution Waves (parallel wave protocol)

Tasks 2, 3, 4, 9, 10 depend only on Task 1 and touch disjoint files — safe to wave together. Tasks 5, 6, 8 depend only on Task 1/2/4 and are mutually disjoint. Task 7 modifies Task 6's file, so it is a dependent, solo wave. Task 11 depends on 1 and 3. Tasks 12-20 (all application services) depend only on domain files and Task 11, and each touches its own file — the biggest wave, except Task 15 additionally depends on Task 14 (its test imports `scheduleTask` to prove `SchedulingPort` is never called during delegation), so 14 and 15 cannot share a wave. Task 21 (migration) depends only on Task 1's field list. Tasks 22 and 23 are strictly serial (23 imports `db.ts` created in 22). See each task's `Depends-on:` line for the authoritative dependency graph; do not hand-recompute waves from prose — derive them mechanically from those lines per `.claude/rules/08-parallel-subagent-driven-development.md`.

---

## Task Breakdown

### Task 1: Scaffold project, Task domain type, DomainError

**Files:**
- Create: `core-engine/package.json`, `core-engine/tsconfig.json`, `core-engine/vitest.config.ts`
- Create: `core-engine/src/domain/errors.ts`
- Create: `core-engine/src/domain/task.ts`
- Test: `core-engine/tests/domain/task.test.ts`

**Interfaces:**
- Produces: `Status = 'Open' | 'Scheduled' | 'Delegated' | 'Completed' | 'Archived' | 'Deleted'`, `Source = 'manual' | 'outlook_email' | 'calendar_event'`, `CalendarEventRef { provider: string; externalEventId: string }`, `Task` (full field set below), `createTask(input: NewTaskInput, now: Date): Task`, `DomainError extends Error`.

Depends-on: none

- [ ] Step 1: Create the npm project scaffold.

  `core-engine/package.json`:
  ```json
  {
    "name": "core-engine",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "engines": { "node": ">=22" },
    "scripts": {
      "test": "vitest run",
      "typecheck": "tsc --noEmit"
    },
    "devDependencies": {
      "typescript": "^5.6.0",
      "vitest": "^2.1.0",
      "@types/node": "^22.0.0",
      "@types/pg": "^8.11.0"
    },
    "dependencies": {
      "pg": "^8.13.0"
    }
  }
  ```

  `core-engine/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2023",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "outDir": "dist",
      "rootDir": ".",
      "declaration": false,
      "forceConsistentCasingInFileNames": true
    },
    "include": ["src", "tests"]
  }
  ```

  `core-engine/vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npm install`
  Expected: dependencies install cleanly, `node_modules/` and `package-lock.json` created. No test runs yet — this step has no RED/GREEN cycle, it is scaffold only.

- [ ] Step 2: Add `DomainError` with no dedicated test (zero branches — exempt per the project's testing rubric; it is exercised transitively by every later test that asserts `.toThrow(DomainError)`).

  `core-engine/src/domain/errors.ts`:
  ```ts
  export class DomainError extends Error {}
  ```

- [ ] Step 3: Write the failing test for `createTask`.

  `core-engine/tests/domain/task.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';

  describe('createTask', () => {
    test('creates a task with null axes and Open status in the Inbox', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const task = createTask(
        { title: 'Reply to client', description: 'Send the proposal', source: 'manual', sourceRefId: null },
        now
      );

      expect(task.title).toBe('Reply to client');
      expect(task.description).toBe('Send the proposal');
      expect(task.source).toBe('manual');
      expect(task.sourceRefId).toBeNull();
      expect(task.importance).toBeNull();
      expect(task.urgency).toBeNull();
      expect(task.status).toBe('Open');
      expect(task.tags).toEqual([]);
      expect(task.schedulingRemoved).toBe(false);
      expect(task.createdAt).toBe(now);
      expect(task.updatedAt).toBe(now);
      expect(typeof task.id).toBe('string');
      expect(task.id.length).toBeGreaterThan(0);
    });

    test('stores an email snapshot when provided, and defaults it to null otherwise', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const withSnapshot = createTask(
        {
          title: 'Flagged email',
          description: '',
          source: 'outlook_email',
          sourceRefId: 'msg-123',
          emailSnapshot: { subject: 'Q3 budget' },
        },
        now
      );
      const withoutSnapshot = createTask(
        { title: 'Manual task', description: '', source: 'manual', sourceRefId: null },
        now
      );

      expect(withSnapshot.emailSnapshot).toEqual({ subject: 'Q3 budget' });
      expect(withSnapshot.sourceRefId).toBe('msg-123');
      expect(withoutSnapshot.emailSnapshot).toBeNull();
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/task.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/task'` — the module does not exist yet.

- [ ] Step 4: Implement the `Task` type and `createTask` factory.

  `core-engine/src/domain/task.ts`:
  ```ts
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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/task.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 5: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/package.json core-engine/tsconfig.json core-engine/vitest.config.ts core-engine/src/domain/errors.ts core-engine/src/domain/task.ts core-engine/tests/domain/task.test.ts
  git commit -m "feat(core-engine): scaffold project and add Task domain type"
  ```

### Task 2: effectiveQuadrant — derived quadrant and auto-promotion (Invariant 2, CE-DEC-002/007)

**Files:**
- Create: `core-engine/src/domain/effectiveQuadrant.ts`
- Test: `core-engine/tests/domain/effectiveQuadrant.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 1).
- Produces: `Quadrant = 'Unclassified' | 'Do' | 'Schedule' | 'Delegate' | 'Eliminate'`, `isAutoPromoted(task: Task, now: Date): boolean`, `effectiveQuadrant(task: Task, now: Date): Quadrant`.

Depends-on: 1

- [ ] Step 1: Write the failing test covering every branch spec Section 7 requires: unset axes, each of the four quadrants, and a passed deadline both with and without an active override.

  `core-engine/tests/domain/effectiveQuadrant.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { effectiveQuadrant, isAutoPromoted } from '../../src/domain/effectiveQuadrant';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/effectiveQuadrant.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/effectiveQuadrant'`.

- [ ] Step 2: Implement `effectiveQuadrant` and `isAutoPromoted`.

  `core-engine/src/domain/effectiveQuadrant.ts`:
  ```ts
  import { Task } from './task';

  export type Quadrant = 'Unclassified' | 'Do' | 'Schedule' | 'Delegate' | 'Eliminate';

  export function isAutoPromoted(task: Task, now: Date): boolean {
    if (task.importance !== true || task.urgency !== false) return false;
    if (task.deadline === null) return false;
    if (task.deadline.getTime() >= now.getTime()) return false;
    if (task.promotionOverride !== null && task.promotionOverride.getTime() === task.deadline.getTime()) {
      return false;
    }
    return true;
  }

  export function effectiveQuadrant(task: Task, now: Date): Quadrant {
    if (task.importance === null || task.urgency === null) return 'Unclassified';
    if (task.importance && task.urgency) return 'Do';
    if (!task.importance && task.urgency) return 'Delegate';
    if (!task.importance && !task.urgency) return 'Eliminate';
    return isAutoPromoted(task, now) ? 'Do' : 'Schedule';
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/effectiveQuadrant.test.ts`
  Expected PASS: 9 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/effectiveQuadrant.ts core-engine/tests/domain/effectiveQuadrant.test.ts
  git commit -m "feat(core-engine): add effectiveQuadrant and auto-promotion (Invariant 2)"
  ```

### Task 3: TaskEvent domain type and factory

**Files:**
- Create: `core-engine/src/domain/taskEvent.ts`
- Test: `core-engine/tests/domain/taskEvent.test.ts`

**Interfaces:**
- Produces: `EventType` (union, see below), `TaskEvent { id, taskId, eventType, oldValue, newValue, occurredAt }`, `createTaskEvent(taskId: string, eventType: EventType, oldValue: unknown, newValue: unknown, now: Date): TaskEvent`.

Depends-on: 1

- [ ] Step 1: Write the failing test.

  `core-engine/tests/domain/taskEvent.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTaskEvent } from '../../src/domain/taskEvent';

  describe('createTaskEvent', () => {
    test('builds an event with all fields set and a generated id', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const event = createTaskEvent('task-1', 'capture', null, { source: 'manual' }, now);

      expect(event.taskId).toBe('task-1');
      expect(event.eventType).toBe('capture');
      expect(event.oldValue).toBeNull();
      expect(event.newValue).toEqual({ source: 'manual' });
      expect(event.occurredAt).toBe(now);
      expect(typeof event.id).toBe('string');
      expect(event.id.length).toBeGreaterThan(0);
    });

    test('generates a different id for each event', () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const first = createTaskEvent('task-1', 'capture', null, {}, now);
      const second = createTaskEvent('task-1', 'capture', null, {}, now);
      expect(first.id).not.toBe(second.id);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/taskEvent.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/taskEvent'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/taskEvent.ts`:
  ```ts
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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/taskEvent.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/taskEvent.ts core-engine/tests/domain/taskEvent.test.ts
  git commit -m "feat(core-engine): add TaskEvent domain type and factory"
  ```

### Task 4: Status transition matrix (Invariant 4)

**Files:**
- Create: `core-engine/src/domain/statusTransition.ts`
- Test: `core-engine/tests/domain/statusTransition.test.ts`

**Interfaces:**
- Consumes: `Task`, `Status` (Task 1), `DomainError` (Task 1).
- Produces: `canTransition(from: Status, to: Status): boolean`, `transitionStatus(task: Task, to: Status, now: Date): Task` (throws `DomainError` on an illegal move).

Depends-on: 1

- [ ] Step 1: Write the failing test covering legal and illegal moves per Invariant 4.

  `core-engine/tests/domain/statusTransition.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { canTransition, transitionStatus } from '../../src/domain/statusTransition';
  import { DomainError } from '../../src/domain/errors';
  import { Status } from '../../src/domain/task';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/statusTransition.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/statusTransition'`.

- [ ] Step 2: Implement the transition matrix.

  `core-engine/src/domain/statusTransition.ts`:
  ```ts
  import { Task, Status } from './task';
  import { DomainError } from './errors';

  const TRANSITIONS: Record<Status, Status[]> = {
    Open: ['Scheduled', 'Delegated', 'Completed', 'Archived', 'Deleted'],
    Scheduled: ['Open', 'Delegated', 'Completed', 'Archived', 'Deleted'],
    Delegated: ['Completed', 'Archived', 'Deleted'],
    Completed: ['Archived', 'Deleted'],
    Archived: ['Open', 'Deleted'],
    Deleted: [],
  };

  export function canTransition(from: Status, to: Status): boolean {
    return TRANSITIONS[from].includes(to);
  }

  export function transitionStatus(task: Task, to: Status, now: Date): Task {
    if (!canTransition(task.status, to)) {
      throw new DomainError(`Illegal status transition: ${task.status} -> ${to}`);
    }
    return { ...task, status: to, updatedAt: now };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/statusTransition.test.ts`
  Expected PASS: 24 tests pass (12 legal + 9 illegal `test.each` rows, plus 3 in the `transitionStatus` block).

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/statusTransition.ts core-engine/tests/domain/statusTransition.test.ts
  git commit -m "feat(core-engine): add status transition matrix (Invariant 4)"
  ```

### Task 5: Delegate auto-clear (Invariant 1)

**Files:**
- Create: `core-engine/src/domain/delegate.ts`
- Test: `core-engine/tests/domain/delegate.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 1), `transitionStatus` (Task 4).
- Produces: `delegateTask(task: Task, assignee: string, followUpDate: Date, now: Date): Task` (throws `DomainError` when `task.status` is not `Open`/`Scheduled`).

Depends-on: 1, 4

- [ ] Step 1: Write the failing test.

  `core-engine/tests/domain/delegate.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { delegateTask } from '../../src/domain/delegate';
  import { DomainError } from '../../src/domain/errors';

  const now = new Date('2026-01-01T00:00:00Z');
  const followUp = new Date('2026-01-08T00:00:00Z');

  describe('delegateTask', () => {
    test('delegating an Open task sets assignee, follow-up date, and status Delegated', () => {
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now);
      const result = delegateTask(task, 'alice@example.com', followUp, now);

      expect(result.status).toBe('Delegated');
      expect(result.assignee).toBe('alice@example.com');
      expect(result.followUpDate).toBe(followUp);
      expect(result.scheduledDate).toBeNull();
      expect(result.calendarEventRef).toBeNull();
    });

    test('delegating a Scheduled task auto-clears scheduledDate and calendarEventRef locally', () => {
      const task = {
        ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
        status: 'Scheduled' as const,
        scheduledDate: new Date('2026-02-01T00:00:00Z'),
        calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
      };

      const result = delegateTask(task, 'bob@example.com', followUp, now);

      expect(result.status).toBe('Delegated');
      expect(result.scheduledDate).toBeNull();
      expect(result.calendarEventRef).toBeNull();
    });

    test('throws DomainError when the task cannot legally become Delegated', () => {
      const task = {
        ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, now),
        status: 'Completed' as const,
      };
      expect(() => delegateTask(task, 'alice@example.com', followUp, now)).toThrow(DomainError);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/delegate.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/delegate'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/delegate.ts`:
  ```ts
  import { Task } from './task';
  import { transitionStatus } from './statusTransition';

  export function delegateTask(task: Task, assignee: string, followUpDate: Date, now: Date): Task {
    const transitioned = transitionStatus(task, 'Delegated', now);
    return {
      ...transitioned,
      assignee,
      followUpDate,
      scheduledDate: null,
      calendarEventRef: null,
    };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/delegate.test.ts`
  Expected PASS: 3 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/delegate.ts core-engine/tests/domain/delegate.test.ts
  git commit -m "feat(core-engine): add delegate auto-clear (Invariant 1)"
  ```

### Task 6: Classification — manual set, AI suggestion approve/reject (Invariant 5)

**Files:**
- Create: `core-engine/src/domain/classification.ts`
- Test: `core-engine/tests/domain/classification.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 1), `DomainError` (Task 1).
- Produces: `classify(task: Task, importance: boolean, urgency: boolean, now: Date): Task`, `recordSuggestion(task: Task, importance: boolean, urgency: boolean, now: Date): Task`, `approveSuggestion(task: Task, now: Date): Task` (throws `DomainError` when no suggestion is pending), `rejectSuggestion(task: Task, now: Date): Task`.

Depends-on: 1

- [ ] Step 1: Write the failing test for Invariant 5 (this task does not yet cover promotion-override placement — that is Task 7).

  `core-engine/tests/domain/classification.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { classify, recordSuggestion, approveSuggestion, rejectSuggestion } from '../../src/domain/classification';
  import { DomainError } from '../../src/domain/errors';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/classification.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/classification'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/classification.ts`:
  ```ts
  import { Task } from './task';
  import { DomainError } from './errors';

  export function classify(task: Task, importance: boolean, urgency: boolean, now: Date): Task {
    return { ...task, importance, urgency, updatedAt: now };
  }

  export function recordSuggestion(task: Task, importance: boolean, urgency: boolean, now: Date): Task {
    return { ...task, suggestedImportance: importance, suggestedUrgency: urgency, updatedAt: now };
  }

  export function approveSuggestion(task: Task, now: Date): Task {
    if (task.suggestedImportance === null || task.suggestedUrgency === null) {
      throw new DomainError('Task has no pending suggestion to approve');
    }
    const classified = classify(task, task.suggestedImportance, task.suggestedUrgency, now);
    return { ...classified, suggestedImportance: null, suggestedUrgency: null };
  }

  export function rejectSuggestion(task: Task, now: Date): Task {
    return { ...task, suggestedImportance: null, suggestedUrgency: null, updatedAt: now };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/classification.test.ts`
  Expected PASS: 5 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/classification.ts core-engine/tests/domain/classification.test.ts
  git commit -m "feat(core-engine): add classification and suggestion approve/reject (Invariant 5)"
  ```

### Task 7: Promotion override lifecycle (Invariant 2 + CE-DEC-003)

**Files:**
- Modify: `core-engine/src/domain/classification.ts`, `core-engine/tests/domain/classification.test.ts`
- Create: `core-engine/src/domain/editTask.ts`
- Test: `core-engine/tests/domain/editTask.test.ts`, `core-engine/tests/domain/promotionOverride.test.ts`

**Interfaces:**
- Consumes: `classify` (Task 6, modified in place), `isAutoPromoted`, `effectiveQuadrant` (Task 2), `Task` (Task 1).
- Produces: `setDeadline(task: Task, deadline: Date | null, now: Date): Task`. `classify`'s signature is unchanged (`classify(task, importance, urgency, now): Task`) — only its body gains the override-placement branch, so Task 13's `classifyService`, written against Task 6's signature, keeps working unmodified.

Depends-on: 6, 2

- [ ] Step 1: Extend `classification.test.ts` with the override-placement case, and add the override-clearing test for `setDeadline`.

  Add to `core-engine/tests/domain/classification.test.ts` (inside the `describe('classify', ...)` block, after the existing test):
  ```ts
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
  ```

  `core-engine/tests/domain/editTask.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { setDeadline } from '../../src/domain/editTask';

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
  ```

  `core-engine/tests/domain/promotionOverride.test.ts` (end-to-end lifecycle: placed, deadline changes, cleared — spec Section 7's required scenario):
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { classify } from '../../src/domain/classification';
  import { setDeadline } from '../../src/domain/editTask';
  import { effectiveQuadrant } from '../../src/domain/effectiveQuadrant';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/classification.test.ts tests/domain/editTask.test.ts tests/domain/promotionOverride.test.ts`
  Expected FAIL: the three new `classify` assertions fail (override not yet placed — current `classify` never sets `promotionOverride`); `editTask.test.ts` and `promotionOverride.test.ts` fail with `Cannot find module '../../src/domain/editTask'`.

- [ ] Step 2: Update `classify` to place the override, and implement `setDeadline`.

  In `core-engine/src/domain/classification.ts`, replace the `classify` function only (everything else in the file is unchanged):
  ```ts
  import { Task } from './task';
  import { DomainError } from './errors';
  import { isAutoPromoted } from './effectiveQuadrant';

  export function classify(task: Task, importance: boolean, urgency: boolean, now: Date): Task {
    const placeOverride = isAutoPromoted(task, now) && importance === true && urgency === false;
    return {
      ...task,
      importance,
      urgency,
      promotionOverride: placeOverride ? task.deadline : task.promotionOverride,
      updatedAt: now,
    };
  }
  ```

  `core-engine/src/domain/editTask.ts`:
  ```ts
  import { Task } from './task';

  export function setDeadline(task: Task, deadline: Date | null, now: Date): Task {
    const oldTime = task.deadline ? task.deadline.getTime() : null;
    const newTime = deadline ? deadline.getTime() : null;
    const changed = oldTime !== newTime;
    return {
      ...task,
      deadline,
      promotionOverride: changed ? null : task.promotionOverride,
      updatedAt: now,
    };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/classification.test.ts tests/domain/editTask.test.ts tests/domain/promotionOverride.test.ts`
  Expected PASS: 8 + 3 + 1 = 12 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/classification.ts core-engine/src/domain/editTask.ts core-engine/tests/domain/classification.test.ts core-engine/tests/domain/editTask.test.ts core-engine/tests/domain/promotionOverride.test.ts
  git commit -m "feat(core-engine): add promotion override placement and clearing (Invariant 2, CE-DEC-003)"
  ```

### Task 8: Inbound event cancellation (Invariant 6)

**Files:**
- Create: `core-engine/src/domain/eventCancelled.ts`
- Test: `core-engine/tests/domain/eventCancelled.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 1), `transitionStatus` (Task 4).
- Produces: `applyEventCancelled(task: Task, now: Date): Task`.

Depends-on: 1, 4

- [ ] Step 1: Write the failing test.

  `core-engine/tests/domain/eventCancelled.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { applyEventCancelled } from '../../src/domain/eventCancelled';

  const now = new Date('2026-01-01T00:00:00Z');

  describe('applyEventCancelled', () => {
    test('clears schedule fields, sets schedulingRemoved, and moves Scheduled back to Open, axes untouched', () => {
      const task = {
        ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, now),
        status: 'Scheduled' as const,
        importance: true,
        urgency: false,
        scheduledDate: new Date('2026-02-01T00:00:00Z'),
        calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
      };

      const result = applyEventCancelled(task, now);

      expect(result.status).toBe('Open');
      expect(result.scheduledDate).toBeNull();
      expect(result.calendarEventRef).toBeNull();
      expect(result.schedulingRemoved).toBe(true);
      expect(result.importance).toBe(true);
      expect(result.urgency).toBe(false);
    });

    test('clears fields and sets schedulingRemoved without forcing a status change when the task is not Scheduled', () => {
      const task = {
        ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, now),
        status: 'Delegated' as const,
      };

      const result = applyEventCancelled(task, now);

      expect(result.status).toBe('Delegated');
      expect(result.schedulingRemoved).toBe(true);
      expect(result.scheduledDate).toBeNull();
      expect(result.calendarEventRef).toBeNull();
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/eventCancelled.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/eventCancelled'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/eventCancelled.ts`:
  ```ts
  import { Task } from './task';
  import { transitionStatus } from './statusTransition';

  export function applyEventCancelled(task: Task, now: Date): Task {
    const next = task.status === 'Scheduled' ? transitionStatus(task, 'Open', now) : task;
    return {
      ...next,
      scheduledDate: null,
      calendarEventRef: null,
      schedulingRemoved: true,
      updatedAt: now,
    };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/eventCancelled.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/eventCancelled.ts core-engine/tests/domain/eventCancelled.test.ts
  git commit -m "feat(core-engine): add inbound event cancellation (Invariant 6)"
  ```

### Task 9: Snooze (CE-DEC-008)

**Files:**
- Create: `core-engine/src/domain/snooze.ts`
- Test: `core-engine/tests/domain/snooze.test.ts`

**Interfaces:**
- Consumes: `Task`, `Status` (Task 1), `DomainError` (Task 1).
- Produces: `snoozeTask(task: Task, until: Date, now: Date): Task` (throws `DomainError` unless `status` is `Open`/`Scheduled`/`Delegated`), `unsnoozeTask(task: Task, now: Date): Task`, `isSnoozed(task: Task, now: Date): boolean`.

Depends-on: 1

- [ ] Step 1: Write the failing test.

  `core-engine/tests/domain/snooze.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { snoozeTask, unsnoozeTask, isSnoozed } from '../../src/domain/snooze';
  import { DomainError } from '../../src/domain/errors';
  import { Status } from '../../src/domain/task';

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
    test('clears snoozedUntil', () => {
      const task = { ...taskWithStatus('Open'), snoozedUntil: until };
      const result = unsnoozeTask(task, now);
      expect(result.snoozedUntil).toBeNull();
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
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/snooze.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/snooze'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/snooze.ts`:
  ```ts
  import { Task, Status } from './task';
  import { DomainError } from './errors';

  const SNOOZABLE_STATUSES: Status[] = ['Open', 'Scheduled', 'Delegated'];

  export function snoozeTask(task: Task, until: Date, now: Date): Task {
    if (!SNOOZABLE_STATUSES.includes(task.status)) {
      throw new DomainError(`Cannot snooze a task with status ${task.status}`);
    }
    return { ...task, snoozedUntil: until, updatedAt: now };
  }

  export function unsnoozeTask(task: Task, now: Date): Task {
    return { ...task, snoozedUntil: null, updatedAt: now };
  }

  export function isSnoozed(task: Task, now: Date): boolean {
    return task.snoozedUntil !== null && task.snoozedUntil.getTime() > now.getTime();
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/snooze.test.ts`
  Expected PASS: 8 tests pass (3 + 3 `test.each` rows, plus 1 + 3).

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/snooze.ts core-engine/tests/domain/snooze.test.ts
  git commit -m "feat(core-engine): add snooze (CE-DEC-008)"
  ```

### Task 10: Tags

**Files:**
- Create: `core-engine/src/domain/tags.ts`
- Test: `core-engine/tests/domain/tags.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 1).
- Produces: `addTag(task: Task, tag: string, now: Date): Task` (idempotent), `removeTag(task: Task, tag: string, now: Date): Task` (no-op if absent).

Depends-on: 1

- [ ] Step 1: Write the failing test.

  `core-engine/tests/domain/tags.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { addTag, removeTag } from '../../src/domain/tags';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/tags.test.ts`
  Expected FAIL: `Cannot find module '../../src/domain/tags'`.

- [ ] Step 2: Implement.

  `core-engine/src/domain/tags.ts`:
  ```ts
  import { Task } from './task';

  export function addTag(task: Task, tag: string, now: Date): Task {
    if (task.tags.includes(tag)) return task;
    return { ...task, tags: [...task.tags, tag], updatedAt: now };
  }

  export function removeTag(task: Task, tag: string, now: Date): Task {
    if (!task.tags.includes(tag)) return task;
    return { ...task, tags: task.tags.filter((t) => t !== tag), updatedAt: now };
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/domain/tags.test.ts`
  Expected PASS: 4 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/domain/tags.ts core-engine/tests/domain/tags.test.ts
  git commit -m "feat(core-engine): add tag add/remove"
  ```

### Task 11: Ports, Clock, in-memory fakes, and the shared `mustFindTask` helper

**Files:**
- Create: `core-engine/src/ports/Clock.ts`, `core-engine/src/ports/TaskRepository.ts`, `core-engine/src/ports/TaskEventRepository.ts`, `core-engine/src/ports/SchedulingPort.ts`, `core-engine/src/ports/SuggestionPort.ts`
- Create: `core-engine/src/app/shared.ts`
- Create: `core-engine/tests/app/fakes.ts`
- Test: `core-engine/tests/app/fakes.test.ts`, `core-engine/tests/app/shared.test.ts`

**Interfaces:**
- Consumes: `Task`, `Source`, `CalendarEventRef` (Task 1), `TaskEvent` (Task 3).
- Produces: `Clock { now(): Date }`; `TaskRepository { save, findById, findBySource, findByCalendarEventRef, findDeadlinesDueWithin, findFollowUpsDueWithin }`; `TaskEventRepository { append, findByTaskId }`; `SchedulingPort { createEvent(task): Promise<CalendarEventRef> }`; `SuggestionPort { suggest(content): Promise<Suggestion> }` where `Suggestion = { importance: boolean; urgency: boolean }`; `mustFindTask(taskRepo: TaskRepository, taskId: string): Promise<Task>` (throws `TaskNotFoundError`); test doubles `FakeTaskRepository`, `FakeTaskEventRepository`, `FakeSchedulingPort`, `FakeSuggestionPort`, `FixedClock`, all implementing the ports above — every application-service task (12-20) imports these from `tests/app/fakes.ts`.

Depends-on: 1, 3

- [ ] Step 1: Define the ports. These are plain interfaces with no branching logic, so per the project's testing rubric they carry no dedicated test — their correctness is verified transitively by the fakes and, later, the Postgres adapter tests.

  `core-engine/src/ports/Clock.ts`:
  ```ts
  export interface Clock {
    now(): Date;
  }
  ```

  `core-engine/src/ports/TaskRepository.ts`:
  ```ts
  import { Task, Source, CalendarEventRef } from '../domain/task';

  export interface TaskRepository {
    save(task: Task): Promise<void>;
    findById(id: string): Promise<Task | null>;
    findBySource(source: Source, sourceRefId: string): Promise<Task | null>;
    findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null>;
    findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]>;
    findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]>;
  }
  ```

  `core-engine/src/ports/TaskEventRepository.ts`:
  ```ts
  import { TaskEvent } from '../domain/taskEvent';

  export interface TaskEventRepository {
    append(event: TaskEvent): Promise<void>;
    findByTaskId(taskId: string): Promise<TaskEvent[]>;
  }
  ```

  `core-engine/src/ports/SchedulingPort.ts`:
  ```ts
  import { Task, CalendarEventRef } from '../domain/task';

  export interface SchedulingPort {
    createEvent(task: Task): Promise<CalendarEventRef>;
  }
  ```

  `core-engine/src/ports/SuggestionPort.ts`:
  ```ts
  export interface Suggestion {
    importance: boolean;
    urgency: boolean;
  }

  export interface SuggestionContent {
    title: string;
    description: string;
  }

  export interface SuggestionPort {
    suggest(content: SuggestionContent): Promise<Suggestion>;
  }
  ```

- [ ] Step 2: Write the failing tests for `mustFindTask` and the fakes.

  `core-engine/tests/app/shared.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { mustFindTask, TaskNotFoundError } from '../../src/app/shared';
  import { FakeTaskRepository } from './fakes';
  import { createTask } from '../../src/domain/task';

  describe('mustFindTask', () => {
    test('returns the task when it exists', async () => {
      const repo = new FakeTaskRepository();
      const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
      await repo.save(task);
      expect(await mustFindTask(repo, task.id)).toEqual(task);
    });

    test('throws TaskNotFoundError when the task does not exist', async () => {
      const repo = new FakeTaskRepository();
      await expect(mustFindTask(repo, 'missing-id')).rejects.toThrow(TaskNotFoundError);
    });
  });
  ```

  `core-engine/tests/app/fakes.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { createTask } from '../../src/domain/task';
  import { createTaskEvent } from '../../src/domain/taskEvent';
  import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FakeSuggestionPort } from './fakes';

  describe('FakeTaskRepository', () => {
    test('round-trips a saved task by id', async () => {
      const repo = new FakeTaskRepository();
      const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
      await repo.save(task);
      expect(await repo.findById(task.id)).toEqual(task);
    });

    test('finds a task by source and sourceRefId, and returns null when absent', async () => {
      const repo = new FakeTaskRepository();
      const task = createTask({ title: 'A', description: '', source: 'outlook_email', sourceRefId: 'msg-1' }, new Date());
      await repo.save(task);
      expect(await repo.findBySource('outlook_email', 'msg-1')).toEqual(task);
      expect(await repo.findBySource('outlook_email', 'msg-2')).toBeNull();
    });

    test('finds a task by calendarEventRef', async () => {
      const repo = new FakeTaskRepository();
      const task = {
        ...createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date()),
        calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
      };
      await repo.save(task);
      const found = await repo.findByCalendarEventRef({ provider: 'google', externalEventId: 'evt-1' });
      expect(found?.id).toBe(task.id);
    });
  });

  describe('FakeTaskEventRepository', () => {
    test('appends and reads back events for a task, in insertion order', async () => {
      const repo = new FakeTaskEventRepository();
      const now = new Date();
      await repo.append(createTaskEvent('task-1', 'capture', null, {}, now));
      await repo.append(createTaskEvent('task-1', 'status_transition', 'Open', 'Scheduled', now));
      await repo.append(createTaskEvent('task-2', 'capture', null, {}, now));

      const events = await repo.findByTaskId('task-1');
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('capture');
      expect(events[1].eventType).toBe('status_transition');
    });
  });

  describe('FakeSchedulingPort', () => {
    test('records each call and returns the configured ref', async () => {
      const port = new FakeSchedulingPort({ provider: 'google', externalEventId: 'evt-9' });
      const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date());
      const ref = await port.createEvent(task);
      expect(ref).toEqual({ provider: 'google', externalEventId: 'evt-9' });
      expect(port.calls).toEqual([task]);
    });
  });

  describe('FakeSuggestionPort', () => {
    test('returns the configured suggestion', async () => {
      const port = new FakeSuggestionPort({ importance: true, urgency: false });
      expect(await port.suggest({ title: 'A', description: '' })).toEqual({ importance: true, urgency: false });
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/shared.test.ts tests/app/fakes.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/shared'` and `Cannot find module './fakes'`.

- [ ] Step 3: Implement `shared.ts` and `fakes.ts`.

  `core-engine/src/app/shared.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { TaskRepository } from '../ports/TaskRepository';

  export class TaskNotFoundError extends Error {
    constructor(taskId: string) {
      super(`Task not found: ${taskId}`);
    }
  }

  export async function mustFindTask(taskRepo: TaskRepository, taskId: string): Promise<Task> {
    const task = await taskRepo.findById(taskId);
    if (task === null) throw new TaskNotFoundError(taskId);
    return task;
  }
  ```

  `core-engine/tests/app/fakes.ts`:
  ```ts
  import { Task, Source, CalendarEventRef } from '../../src/domain/task';
  import { TaskEvent } from '../../src/domain/taskEvent';
  import { TaskRepository } from '../../src/ports/TaskRepository';
  import { TaskEventRepository } from '../../src/ports/TaskEventRepository';
  import { SchedulingPort } from '../../src/ports/SchedulingPort';
  import { SuggestionPort, Suggestion, SuggestionContent } from '../../src/ports/SuggestionPort';
  import { Clock } from '../../src/ports/Clock';

  export class FakeTaskRepository implements TaskRepository {
    private tasks = new Map<string, Task>();

    async save(task: Task): Promise<void> {
      this.tasks.set(task.id, task);
    }

    async findById(id: string): Promise<Task | null> {
      return this.tasks.get(id) ?? null;
    }

    async findBySource(source: Source, sourceRefId: string): Promise<Task | null> {
      for (const task of this.tasks.values()) {
        if (task.source === source && task.sourceRefId === sourceRefId) return task;
      }
      return null;
    }

    async findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null> {
      for (const task of this.tasks.values()) {
        if (
          task.calendarEventRef !== null &&
          task.calendarEventRef.provider === ref.provider &&
          task.calendarEventRef.externalEventId === ref.externalEventId
        ) {
          return task;
        }
      }
      return null;
    }

    async findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]> {
      return [...this.tasks.values()].filter(
        (t) => t.deadline !== null && t.deadline.getTime() >= from.getTime() && t.deadline.getTime() <= to.getTime()
      );
    }

    async findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]> {
      return [...this.tasks.values()].filter(
        (t) =>
          t.followUpDate !== null &&
          t.followUpDate.getTime() >= from.getTime() &&
          t.followUpDate.getTime() <= to.getTime()
      );
    }
  }

  export class FakeTaskEventRepository implements TaskEventRepository {
    public events: TaskEvent[] = [];

    async append(event: TaskEvent): Promise<void> {
      this.events.push(event);
    }

    async findByTaskId(taskId: string): Promise<TaskEvent[]> {
      return this.events.filter((e) => e.taskId === taskId);
    }
  }

  export class FakeSchedulingPort implements SchedulingPort {
    public calls: Task[] = [];

    constructor(private ref: CalendarEventRef = { provider: 'google', externalEventId: 'evt-1' }) {}

    async createEvent(task: Task): Promise<CalendarEventRef> {
      this.calls.push(task);
      return this.ref;
    }
  }

  export class FakeSuggestionPort implements SuggestionPort {
    constructor(private suggestion: Suggestion = { importance: true, urgency: true }) {}

    async suggest(_content: SuggestionContent): Promise<Suggestion> {
      return this.suggestion;
    }
  }

  export class FixedClock implements Clock {
    constructor(private date: Date) {}

    now(): Date {
      return this.date;
    }
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/shared.test.ts tests/app/fakes.test.ts`
  Expected PASS: 2 + 7 = 9 tests pass.

- [ ] Step 4: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/ports core-engine/src/app/shared.ts core-engine/tests/app/fakes.ts core-engine/tests/app/fakes.test.ts core-engine/tests/app/shared.test.ts
  git commit -m "feat(core-engine): add ports, Clock, and in-memory test fakes"
  ```

### Task 12: `captureOrGet` — dedupe-enforcing capture entry point (CE-DEC-004, Invariant 3, CE-DEC-012)

**Files:**
- Create: `core-engine/src/app/captureOrGet.ts`
- Test: `core-engine/tests/app/captureOrGet.test.ts`

**Interfaces:**
- Consumes: `Task`, `Source`, `createTask` (Task 1), `createTaskEvent` (Task 3), `transitionStatus` (Task 4), `TaskRepository`, `TaskEventRepository`, `Clock` (Task 11), `FakeTaskRepository`, `FakeTaskEventRepository`, `FixedClock` (Task 11).
- Produces: `CaptureContent { title: string; description: string; emailSnapshot?: Record<string, unknown> | null }`, `captureOrGet(deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock }, source: Source, sourceRefId: string | null, content: CaptureContent): Promise<Task>`.

Depends-on: 1, 3, 4, 11

- [ ] Step 1: Write the failing test — new capture, dedupe on repeat, manual never deduped, dedupe surviving deletion (CE-DEC-012).

  `core-engine/tests/app/captureOrGet.test.ts`:
  ```ts
  import { describe, test, expect, vi } from 'vitest';
  import { captureOrGet } from '../../src/app/captureOrGet';
  import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes';
  import { transitionStatus } from '../../src/domain/statusTransition';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, clock };
  }

  describe('captureOrGet', () => {
    test('creates a new task in the Inbox when no task claims the source/sourceRefId pair', async () => {
      const { deps, eventRepo } = setup();
      const task = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'Flagged email', description: 'body' });

      expect(task.status).toBe('Open');
      expect(task.importance).toBeNull();
      expect(task.urgency).toBeNull();
      expect(await eventRepo.findByTaskId(task.id)).toHaveLength(1);
    });

    test('returns the existing task instead of creating a duplicate for a repeat capture', async () => {
      const { deps, taskRepo } = setup();
      const saveSpy = vi.spyOn(taskRepo, 'save');

      const first = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'A', description: '' });
      const second = await captureOrGet(deps, 'outlook_email', 'msg-1', { title: 'A again', description: '' });

      expect(second.id).toBe(first.id);
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    test('never dedupes manual tasks — each manual capture (sourceRefId null) creates a new task', async () => {
      const { deps } = setup();
      const first = await captureOrGet(deps, 'manual', null, { title: 'Buy milk', description: '' });
      const second = await captureOrGet(deps, 'manual', null, { title: 'Buy milk', description: '' });

      expect(second.id).not.toBe(first.id);
    });

    test('dedupe survives deletion — a deleted sourced task is returned again, never recreated (CE-DEC-012)', async () => {
      const { deps, taskRepo, clock } = setup();
      const original = await captureOrGet(deps, 'calendar_event', 'evt-1', { title: 'Standup', description: '' });
      const deleted = transitionStatus(original, 'Deleted', clock.now());
      await taskRepo.save(deleted);

      const result = await captureOrGet(deps, 'calendar_event', 'evt-1', { title: 'Standup', description: '' });

      expect(result.id).toBe(original.id);
      expect(result.status).toBe('Deleted');
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/captureOrGet.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/captureOrGet'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/captureOrGet.ts`:
  ```ts
  import { Task, Source, createTask } from '../domain/task';
  import { createTaskEvent } from '../domain/taskEvent';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export interface CaptureContent {
    title: string;
    description: string;
    emailSnapshot?: Record<string, unknown> | null;
  }

  export interface CaptureOrGetDeps {
    taskRepo: TaskRepository;
    eventRepo: TaskEventRepository;
    clock: Clock;
  }

  export async function captureOrGet(
    deps: CaptureOrGetDeps,
    source: Source,
    sourceRefId: string | null,
    content: CaptureContent
  ): Promise<Task> {
    if (sourceRefId !== null) {
      const existing = await deps.taskRepo.findBySource(source, sourceRefId);
      if (existing !== null) return existing;
    }

    const now = deps.clock.now();
    const task = createTask(
      {
        title: content.title,
        description: content.description,
        source,
        sourceRefId,
        emailSnapshot: content.emailSnapshot,
      },
      now
    );
    await deps.taskRepo.save(task);
    await deps.eventRepo.append(createTaskEvent(task.id, 'capture', null, { source, sourceRefId }, now));
    return task;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/captureOrGet.test.ts`
  Expected PASS: 4 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/captureOrGet.ts core-engine/tests/app/captureOrGet.test.ts
  git commit -m "feat(core-engine): add captureOrGet dedupe-enforcing capture seam"
  ```

### Task 13: Classify application service (manual, suggest, approve, reject)

**Files:**
- Create: `core-engine/src/app/classifyService.ts`
- Test: `core-engine/tests/app/classifyService.test.ts`

**Interfaces:**
- Consumes: `classify`, `recordSuggestion`, `approveSuggestion`, `rejectSuggestion` (Task 7's `classification.ts`), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `TaskRepository`, `TaskEventRepository`, `Clock`, `SuggestionPort` (Task 11), fakes (Task 11).
- Produces: `classifyManually(deps: { taskRepo; eventRepo; clock }, taskId: string, importance: boolean, urgency: boolean): Promise<Task>`, `requestSuggestion(deps: { taskRepo; suggestionPort; clock }, taskId: string): Promise<Task>`, `approveSuggestionService(deps: { taskRepo; eventRepo; clock }, taskId: string): Promise<Task>`, `rejectSuggestionService(deps: { taskRepo; eventRepo; clock }, taskId: string): Promise<Task>`.

Depends-on: 3, 7, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/classifyService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { classifyManually, requestSuggestion, approveSuggestionService, rejectSuggestionService } from '../../src/app/classifyService';
  import { FakeTaskRepository, FakeTaskEventRepository, FakeSuggestionPort, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';

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
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/classifyService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/classifyService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/classifyService.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { classify, recordSuggestion, approveSuggestion, rejectSuggestion } from '../domain/classification';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { SuggestionPort } from '../ports/SuggestionPort';
  import { Clock } from '../ports/Clock';

  export async function classifyManually(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    taskId: string,
    importance: boolean,
    urgency: boolean
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = classify(task, importance, urgency, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(
      createTaskEvent(
        taskId,
        'classification_applied',
        { importance: task.importance, urgency: task.urgency },
        { importance, urgency, origin: 'manual' },
        now
      )
    );
    if (updated.promotionOverride !== null && task.promotionOverride === null) {
      await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_placed', null, updated.promotionOverride, now));
    }
    return updated;
  }

  export async function requestSuggestion(
    deps: { taskRepo: TaskRepository; suggestionPort: SuggestionPort; clock: Clock },
    taskId: string
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const suggestion = await deps.suggestionPort.suggest({ title: task.title, description: task.description });
    const updated = recordSuggestion(task, suggestion.importance, suggestion.urgency, now);
    await deps.taskRepo.save(updated);
    return updated;
  }

  export async function approveSuggestionService(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    taskId: string
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = approveSuggestion(task, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(
      createTaskEvent(
        taskId,
        'classification_applied',
        { importance: task.importance, urgency: task.urgency },
        { importance: updated.importance, urgency: updated.urgency, origin: 'approved_ai' },
        now
      )
    );
    if (updated.promotionOverride !== null && task.promotionOverride === null) {
      await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_placed', null, updated.promotionOverride, now));
    }
    return updated;
  }

  export async function rejectSuggestionService(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    taskId: string
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = rejectSuggestion(task, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(
      createTaskEvent(
        taskId,
        'suggestion_rejected',
        { suggestedImportance: task.suggestedImportance, suggestedUrgency: task.suggestedUrgency },
        null,
        now
      )
    );
    return updated;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/classifyService.test.ts`
  Expected PASS: 4 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/classifyService.ts core-engine/tests/app/classifyService.test.ts
  git commit -m "feat(core-engine): add classify application service"
  ```

### Task 14: Schedule application service

**Files:**
- Create: `core-engine/src/app/scheduleService.ts`
- Test: `core-engine/tests/app/scheduleService.test.ts`

**Interfaces:**
- Consumes: `transitionStatus` (Task 4), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `TaskRepository`, `TaskEventRepository`, `Clock`, `SchedulingPort` (Task 11), fakes (Task 11).
- Produces: `scheduleTask(deps: { taskRepo; eventRepo; schedulingPort; clock }, taskId: string, scheduledDate: Date): Promise<Task>` (only legal from status `Open`, per the transition matrix).

Depends-on: 1, 3, 4, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/scheduleService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { scheduleTask } from '../../src/app/scheduleService';
  import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';
  import { DomainError } from '../../src/domain/errors';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const schedulingPort = new FakeSchedulingPort({ provider: 'google', externalEventId: 'evt-1' });
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { taskRepo, eventRepo, schedulingPort, clock };
  }

  describe('scheduleTask', () => {
    test('calls SchedulingPort.createEvent, stores the returned ref and scheduled date, and moves status to Scheduled', async () => {
      const { taskRepo, eventRepo, schedulingPort, clock } = setup();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);
      const scheduledDate = new Date('2026-02-01T00:00:00Z');

      const result = await scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, scheduledDate);

      expect(result.status).toBe('Scheduled');
      expect(result.scheduledDate).toBe(scheduledDate);
      expect(result.calendarEventRef).toEqual({ provider: 'google', externalEventId: 'evt-1' });
      expect(schedulingPort.calls).toEqual([task]);
      const events = await eventRepo.findByTaskId(task.id);
      expect(events[0].eventType).toBe('status_transition');
      expect(events[0].newValue).toBe('Scheduled');
    });

    test('throws DomainError when the task cannot legally become Scheduled', async () => {
      const { taskRepo, eventRepo, schedulingPort, clock } = setup();
      const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status: 'Completed' as const };
      await taskRepo.save(task);

      await expect(
        scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, new Date('2026-02-01T00:00:00Z'))
      ).rejects.toThrow(DomainError);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/scheduleService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/scheduleService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/scheduleService.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { transitionStatus } from '../domain/statusTransition';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { SchedulingPort } from '../ports/SchedulingPort';
  import { Clock } from '../ports/Clock';

  export async function scheduleTask(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; schedulingPort: SchedulingPort; clock: Clock },
    taskId: string,
    scheduledDate: Date
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const transitioned = transitionStatus(task, 'Scheduled', now);
    const ref = await deps.schedulingPort.createEvent(task);
    const updated: Task = { ...transitioned, scheduledDate, calendarEventRef: ref };

    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
    return updated;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/scheduleService.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/scheduleService.ts core-engine/tests/app/scheduleService.test.ts
  git commit -m "feat(core-engine): add schedule application service"
  ```

### Task 15: Delegate application service

**Files:**
- Create: `core-engine/src/app/delegateService.ts`
- Test: `core-engine/tests/app/delegateService.test.ts`

**Interfaces:**
- Consumes: `delegateTask` (Task 5), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `scheduleTask` (Task 14, test-only — used as setup to prove Invariant 1's "calendar event not touched"), `TaskRepository`, `TaskEventRepository`, `Clock`, fakes (Task 11).
- Produces: `delegateTaskService(deps: { taskRepo; eventRepo; clock }, taskId: string, assignee: string, followUpDate: Date): Promise<Task>`.

Depends-on: 3, 5, 11, 14

- [ ] Step 1: Write the failing test — including the cross-service assertion that delegating never calls `SchedulingPort`.

  `core-engine/tests/app/delegateService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { delegateTaskService } from '../../src/app/delegateService';
  import { scheduleTask } from '../../src/app/scheduleService';
  import { FakeTaskRepository, FakeTaskEventRepository, FakeSchedulingPort, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { taskRepo, eventRepo, clock };
  }

  describe('delegateTaskService', () => {
    test('delegating an Open task sets assignee/follow-up and records a status_transition event', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);
      const followUp = new Date('2026-01-08T00:00:00Z');

      const result = await delegateTaskService({ taskRepo, eventRepo, clock }, task.id, 'alice@example.com', followUp);

      expect(result.status).toBe('Delegated');
      expect(result.assignee).toBe('alice@example.com');
      const events = await eventRepo.findByTaskId(task.id);
      expect(events[0].eventType).toBe('status_transition');
      expect(events[0].newValue).toBe('Delegated');
    });

    test('delegating a scheduled task clears the schedule locally without ever touching the calendar', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const schedulingPort = new FakeSchedulingPort();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);

      const scheduled = await scheduleTask({ taskRepo, eventRepo, schedulingPort, clock }, task.id, new Date('2026-02-01T00:00:00Z'));
      expect(schedulingPort.calls).toHaveLength(1);

      const delegated = await delegateTaskService({ taskRepo, eventRepo, clock }, scheduled.id, 'bob@example.com', new Date('2026-01-08T00:00:00Z'));

      expect(delegated.status).toBe('Delegated');
      expect(delegated.scheduledDate).toBeNull();
      expect(delegated.calendarEventRef).toBeNull();
      expect(schedulingPort.calls).toHaveLength(1); // unchanged — delegate never calls SchedulingPort
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/delegateService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/delegateService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/delegateService.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { delegateTask } from '../domain/delegate';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export async function delegateTaskService(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    taskId: string,
    assignee: string,
    followUpDate: Date
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = delegateTask(task, assignee, followUpDate, now);

    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
    return updated;
  }
  ```

  Note this file has no import of `SchedulingPort` at all — the calendar is never touched from this path (Invariant 1, CE-DEC-006), and the test above proves it at runtime via the shared `FakeSchedulingPort` call counter.

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/delegateService.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/delegateService.ts core-engine/tests/app/delegateService.test.ts
  git commit -m "feat(core-engine): add delegate application service"
  ```

### Task 16: Lifecycle application service (complete, archive, restore, delete)

**Files:**
- Create: `core-engine/src/app/lifecycleService.ts`
- Test: `core-engine/tests/app/lifecycleService.test.ts`

**Interfaces:**
- Consumes: `transitionStatus` (Task 4), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `TaskRepository`, `TaskEventRepository`, `Clock`, fakes (Task 11).
- Produces: `completeTask(deps, taskId): Promise<Task>`, `archiveTask(deps, taskId): Promise<Task>`, `restoreTask(deps, taskId): Promise<Task>`, `deleteTask(deps, taskId): Promise<Task>` — all with the same `deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock }` shape.

Depends-on: 3, 4, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/lifecycleService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { completeTask, archiveTask, restoreTask, deleteTask } from '../../src/app/lifecycleService';
  import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';
  import { DomainError } from '../../src/domain/errors';

  function setup(status: 'Open' | 'Archived' | 'Deleted' = 'Open') {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status };
    return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, task };
  }

  describe('completeTask', () => {
    test('moves an Open task to Completed and records a status_transition event', async () => {
      const { deps, taskRepo, eventRepo, task } = setup();
      await taskRepo.save(task);
      const result = await completeTask(deps, task.id);
      expect(result.status).toBe('Completed');
      expect((await eventRepo.findByTaskId(task.id))[0].newValue).toBe('Completed');
    });
  });

  describe('archiveTask', () => {
    test('moves any status to Archived', async () => {
      const { deps, taskRepo, task } = setup();
      await taskRepo.save(task);
      const result = await archiveTask(deps, task.id);
      expect(result.status).toBe('Archived');
    });
  });

  describe('restoreTask', () => {
    test('restores an Archived task to Open', async () => {
      const { deps, taskRepo, task } = setup('Archived');
      await taskRepo.save(task);
      const result = await restoreTask(deps, task.id);
      expect(result.status).toBe('Open');
    });

    test('throws DomainError restoring a task that is not Archived', async () => {
      const { deps, taskRepo, task } = setup('Open');
      await taskRepo.save(task);
      await expect(restoreTask(deps, task.id)).rejects.toThrow(DomainError);
    });
  });

  describe('deleteTask', () => {
    test('moves any status to Deleted', async () => {
      const { deps, taskRepo, task } = setup();
      await taskRepo.save(task);
      const result = await deleteTask(deps, task.id);
      expect(result.status).toBe('Deleted');
    });

    test('throws DomainError deleting a task that is already Deleted (terminal)', async () => {
      const { deps, taskRepo, task } = setup('Deleted');
      await taskRepo.save(task);
      await expect(deleteTask(deps, task.id)).rejects.toThrow(DomainError);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/lifecycleService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/lifecycleService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/lifecycleService.ts`:
  ```ts
  import { Task, Status } from '../domain/task';
  import { transitionStatus } from '../domain/statusTransition';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export interface LifecycleDeps {
    taskRepo: TaskRepository;
    eventRepo: TaskEventRepository;
    clock: Clock;
  }

  async function moveTo(deps: LifecycleDeps, taskId: string, to: Status): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = transitionStatus(task, to, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'status_transition', task.status, updated.status, now));
    return updated;
  }

  export function completeTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
    return moveTo(deps, taskId, 'Completed');
  }

  export function archiveTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
    return moveTo(deps, taskId, 'Archived');
  }

  export function restoreTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
    return moveTo(deps, taskId, 'Open');
  }

  export function deleteTask(deps: LifecycleDeps, taskId: string): Promise<Task> {
    return moveTo(deps, taskId, 'Deleted');
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/lifecycleService.test.ts`
  Expected PASS: 5 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/lifecycleService.ts core-engine/tests/app/lifecycleService.test.ts
  git commit -m "feat(core-engine): add lifecycle application service (complete/archive/restore/delete)"
  ```

### Task 17: Inbound `event_cancelled` application service (Invariant 6)

**Files:**
- Create: `core-engine/src/app/eventCancelledService.ts`
- Test: `core-engine/tests/app/eventCancelledService.test.ts`

**Interfaces:**
- Consumes: `applyEventCancelled` (Task 8), `createTaskEvent` (Task 3), `TaskRepository.findByCalendarEventRef` (Task 11), `TaskEventRepository`, `Clock`, fakes (Task 11).
- Produces: `LinkedTaskNotFoundError extends Error`, `eventCancelled(deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock }, ref: CalendarEventRef): Promise<Task>`.

Depends-on: 3, 8, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/eventCancelledService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { eventCancelled, LinkedTaskNotFoundError } from '../../src/app/eventCancelledService';
  import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { taskRepo, eventRepo, clock };
  }

  describe('eventCancelled', () => {
    test('clears the schedule, sets schedulingRemoved, and moves Scheduled back to Open', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const ref = { provider: 'google', externalEventId: 'evt-1' };
      const task = {
        ...createTask({ title: 'T', description: '', source: 'calendar_event', sourceRefId: 'evt-1' }, clock.now()),
        status: 'Scheduled' as const,
        scheduledDate: new Date('2026-02-01T00:00:00Z'),
        calendarEventRef: ref,
      };
      await taskRepo.save(task);

      const result = await eventCancelled({ taskRepo, eventRepo, clock }, ref);

      expect(result.status).toBe('Open');
      expect(result.scheduledDate).toBeNull();
      expect(result.schedulingRemoved).toBe(true);
      const events = await eventRepo.findByTaskId(task.id);
      expect(events[0].eventType).toBe('status_transition');
    });

    test('throws LinkedTaskNotFoundError when no task links the given event', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      await expect(
        eventCancelled({ taskRepo, eventRepo, clock }, { provider: 'google', externalEventId: 'missing' })
      ).rejects.toThrow(LinkedTaskNotFoundError);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/eventCancelledService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/eventCancelledService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/eventCancelledService.ts`:
  ```ts
  import { Task, CalendarEventRef } from '../domain/task';
  import { applyEventCancelled } from '../domain/eventCancelled';
  import { createTaskEvent } from '../domain/taskEvent';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export class LinkedTaskNotFoundError extends Error {
    constructor(ref: CalendarEventRef) {
      super(`No task links calendar event ${ref.provider}:${ref.externalEventId}`);
    }
  }

  export async function eventCancelled(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    ref: CalendarEventRef
  ): Promise<Task> {
    const task = await deps.taskRepo.findByCalendarEventRef(ref);
    if (task === null) throw new LinkedTaskNotFoundError(ref);

    const now = deps.clock.now();
    const updated = applyEventCancelled(task, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(task.id, 'status_transition', task.status, updated.status, now));
    return updated;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/eventCancelledService.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/eventCancelledService.ts core-engine/tests/app/eventCancelledService.test.ts
  git commit -m "feat(core-engine): add inbound event_cancelled application service (Invariant 6)"
  ```

### Task 18: Snooze application service

**Files:**
- Create: `core-engine/src/app/snoozeService.ts`
- Test: `core-engine/tests/app/snoozeService.test.ts`

**Interfaces:**
- Consumes: `snoozeTask`, `unsnoozeTask` (Task 9), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `TaskRepository`, `TaskEventRepository`, `Clock`, fakes (Task 11).
- Produces: `snoozeTaskService(deps: { taskRepo; eventRepo; clock }, taskId: string, until: Date): Promise<Task>`, `unsnoozeTaskService(deps, taskId: string): Promise<Task>`.

Depends-on: 3, 9, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/snoozeService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { snoozeTaskService, unsnoozeTaskService } from '../../src/app/snoozeService';
  import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';
  import { DomainError } from '../../src/domain/errors';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { deps: { taskRepo, eventRepo, clock }, taskRepo, eventRepo, clock };
  }

  describe('snoozeTaskService', () => {
    test('sets snoozedUntil and records a snoozed event', async () => {
      const { deps, taskRepo, eventRepo, clock } = setup();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);
      const until = new Date('2026-01-08T00:00:00Z');

      const result = await snoozeTaskService(deps, task.id, until);

      expect(result.snoozedUntil).toBe(until);
      expect((await eventRepo.findByTaskId(task.id))[0].eventType).toBe('snoozed');
    });

    test('throws DomainError for a terminal-status task', async () => {
      const { deps, taskRepo, clock } = setup();
      const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), status: 'Completed' as const };
      await taskRepo.save(task);

      await expect(snoozeTaskService(deps, task.id, new Date('2026-01-08T00:00:00Z'))).rejects.toThrow(DomainError);
    });
  });

  describe('unsnoozeTaskService', () => {
    test('clears snoozedUntil and records an unsnoozed event', async () => {
      const { deps, taskRepo, eventRepo, clock } = setup();
      const task = { ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()), snoozedUntil: new Date('2026-01-08T00:00:00Z') };
      await taskRepo.save(task);

      const result = await unsnoozeTaskService(deps, task.id);

      expect(result.snoozedUntil).toBeNull();
      expect((await eventRepo.findByTaskId(task.id))[0].eventType).toBe('unsnoozed');
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/snoozeService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/snoozeService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/snoozeService.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { snoozeTask, unsnoozeTask } from '../domain/snooze';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export interface SnoozeDeps {
    taskRepo: TaskRepository;
    eventRepo: TaskEventRepository;
    clock: Clock;
  }

  export async function snoozeTaskService(deps: SnoozeDeps, taskId: string, until: Date): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = snoozeTask(task, until, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'snoozed', task.snoozedUntil, until, now));
    return updated;
  }

  export async function unsnoozeTaskService(deps: SnoozeDeps, taskId: string): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = unsnoozeTask(task, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'unsnoozed', task.snoozedUntil, null, now));
    return updated;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/snoozeService.test.ts`
  Expected PASS: 3 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/snoozeService.ts core-engine/tests/app/snoozeService.test.ts
  git commit -m "feat(core-engine): add snooze application service"
  ```

### Task 19: Edit fields, edit deadline, and tag application services

**Files:**
- Create: `core-engine/src/app/editService.ts`
- Test: `core-engine/tests/app/editService.test.ts`

**Interfaces:**
- Consumes: `setDeadline` (Task 7), `addTag`, `removeTag` (Task 10), `createTaskEvent` (Task 3), `mustFindTask` (Task 11), `TaskRepository`, `TaskEventRepository`, `Clock`, fakes (Task 11).
- Produces: `editTaskFields(deps: { taskRepo; clock }, taskId: string, changes: { title?: string; description?: string }): Promise<Task>` (no event — title/description are not in the Section 6 event-type list), `editDeadline(deps: { taskRepo; eventRepo; clock }, taskId: string, deadline: Date | null): Promise<Task>` (always emits `deadline_changed`; emits `promotion_override_cleared` only when an override was actually cleared), `addTagService(deps: { taskRepo; clock }, taskId: string, tag: string): Promise<Task>`, `removeTagService(deps: { taskRepo; clock }, taskId: string, tag: string): Promise<Task>`.

Depends-on: 3, 7, 10, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/editService.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { editTaskFields, editDeadline, addTagService, removeTagService } from '../../src/app/editService';
  import { FakeTaskRepository, FakeTaskEventRepository, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';

  function setup() {
    const taskRepo = new FakeTaskRepository();
    const eventRepo = new FakeTaskEventRepository();
    const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
    return { taskRepo, eventRepo, clock };
  }

  describe('editTaskFields', () => {
    test('updates title and description with no event recorded', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const task = createTask({ title: 'Old', description: 'Old desc', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);

      const result = await editTaskFields({ taskRepo, clock }, task.id, { title: 'New', description: 'New desc' });

      expect(result.title).toBe('New');
      expect(result.description).toBe('New desc');
      expect(await eventRepo.findByTaskId(task.id)).toHaveLength(0);
    });
  });

  describe('editDeadline', () => {
    test('changes the deadline and records deadline_changed', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);
      const deadline = new Date('2026-03-01T00:00:00Z');

      const result = await editDeadline({ taskRepo, eventRepo, clock }, task.id, deadline);

      expect(result.deadline).toBe(deadline);
      const events = await eventRepo.findByTaskId(task.id);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('deadline_changed');
    });

    test('also records promotion_override_cleared when changing the deadline clears an active override', async () => {
      const { taskRepo, eventRepo, clock } = setup();
      const oldDeadline = new Date('2025-12-01T00:00:00Z');
      const task = {
        ...createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now()),
        deadline: oldDeadline,
        promotionOverride: oldDeadline,
      };
      await taskRepo.save(task);

      await editDeadline({ taskRepo, eventRepo, clock }, task.id, new Date('2026-06-01T00:00:00Z'));

      const events = await eventRepo.findByTaskId(task.id);
      expect(events.map((e) => e.eventType)).toEqual(['deadline_changed', 'promotion_override_cleared']);
    });
  });

  describe('addTagService / removeTagService', () => {
    test('adds then removes a tag', async () => {
      const { taskRepo, clock } = setup();
      const task = createTask({ title: 'T', description: '', source: 'manual', sourceRefId: null }, clock.now());
      await taskRepo.save(task);

      const tagged = await addTagService({ taskRepo, clock }, task.id, 'client-x');
      expect(tagged.tags).toEqual(['client-x']);

      const untagged = await removeTagService({ taskRepo, clock }, task.id, 'client-x');
      expect(untagged.tags).toEqual([]);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/editService.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/editService'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/editService.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { setDeadline } from '../domain/editTask';
  import { addTag, removeTag } from '../domain/tags';
  import { createTaskEvent } from '../domain/taskEvent';
  import { mustFindTask } from './shared';
  import { TaskRepository } from '../ports/TaskRepository';
  import { TaskEventRepository } from '../ports/TaskEventRepository';
  import { Clock } from '../ports/Clock';

  export async function editTaskFields(
    deps: { taskRepo: TaskRepository; clock: Clock },
    taskId: string,
    changes: { title?: string; description?: string }
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated: Task = { ...task, ...changes, updatedAt: now };
    await deps.taskRepo.save(updated);
    return updated;
  }

  export async function editDeadline(
    deps: { taskRepo: TaskRepository; eventRepo: TaskEventRepository; clock: Clock },
    taskId: string,
    deadline: Date | null
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = setDeadline(task, deadline, now);
    await deps.taskRepo.save(updated);
    await deps.eventRepo.append(createTaskEvent(taskId, 'deadline_changed', task.deadline, deadline, now));
    if (task.promotionOverride !== null && updated.promotionOverride === null) {
      await deps.eventRepo.append(createTaskEvent(taskId, 'promotion_override_cleared', task.promotionOverride, null, now));
    }
    return updated;
  }

  export async function addTagService(
    deps: { taskRepo: TaskRepository; clock: Clock },
    taskId: string,
    tag: string
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = addTag(task, tag, now);
    await deps.taskRepo.save(updated);
    return updated;
  }

  export async function removeTagService(
    deps: { taskRepo: TaskRepository; clock: Clock },
    taskId: string,
    tag: string
  ): Promise<Task> {
    const now = deps.clock.now();
    const task = await mustFindTask(deps.taskRepo, taskId);
    const updated = removeTag(task, tag, now);
    await deps.taskRepo.save(updated);
    return updated;
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/editService.test.ts`
  Expected PASS: 4 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/editService.ts core-engine/tests/app/editService.test.ts
  git commit -m "feat(core-engine): add edit fields, edit deadline, and tag application services"
  ```

### Task 20: Notification query seam (deadlines and follow-ups due, excluding snoozed)

**Files:**
- Create: `core-engine/src/app/notificationQueries.ts`
- Test: `core-engine/tests/app/notificationQueries.test.ts`

**Interfaces:**
- Consumes: `isSnoozed` (Task 9), `TaskRepository.findDeadlinesDueWithin` / `findFollowUpsDueWithin` (Task 11), `Clock`, fakes (Task 11).
- Produces: `deadlinesDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]>`, `followUpsDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]>` — both exclude snoozed tasks (CE-DEC-008).

Depends-on: 9, 11

- [ ] Step 1: Write the failing test.

  `core-engine/tests/app/notificationQueries.test.ts`:
  ```ts
  import { describe, test, expect } from 'vitest';
  import { deadlinesDueWithin, followUpsDueWithin } from '../../src/app/notificationQueries';
  import { FakeTaskRepository, FixedClock } from './fakes';
  import { createTask } from '../../src/domain/task';

  describe('deadlinesDueWithin', () => {
    test('returns tasks with a deadline in the window, excluding snoozed ones', async () => {
      const taskRepo = new FakeTaskRepository();
      const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

      const due = { ...createTask({ title: 'Due', description: '', source: 'manual', sourceRefId: null }, clock.now()), deadline: new Date('2026-01-05T00:00:00Z') };
      const snoozed = {
        ...createTask({ title: 'Snoozed', description: '', source: 'manual', sourceRefId: null }, clock.now()),
        deadline: new Date('2026-01-05T00:00:00Z'),
        snoozedUntil: new Date('2026-01-10T00:00:00Z'),
      };
      await taskRepo.save(due);
      await taskRepo.save(snoozed);

      const results = await deadlinesDueWithin({ taskRepo, clock }, new Date('2026-01-07T00:00:00Z'));

      expect(results.map((t) => t.id)).toEqual([due.id]);
    });
  });

  describe('followUpsDueWithin', () => {
    test('returns tasks with a follow-up date in the window, excluding snoozed ones', async () => {
      const taskRepo = new FakeTaskRepository();
      const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

      const due = { ...createTask({ title: 'Due', description: '', source: 'manual', sourceRefId: null }, clock.now()), followUpDate: new Date('2026-01-05T00:00:00Z') };
      const snoozed = {
        ...createTask({ title: 'Snoozed', description: '', source: 'manual', sourceRefId: null }, clock.now()),
        followUpDate: new Date('2026-01-05T00:00:00Z'),
        snoozedUntil: new Date('2026-01-10T00:00:00Z'),
      };
      await taskRepo.save(due);
      await taskRepo.save(snoozed);

      const results = await followUpsDueWithin({ taskRepo, clock }, new Date('2026-01-07T00:00:00Z'));

      expect(results.map((t) => t.id)).toEqual([due.id]);
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/notificationQueries.test.ts`
  Expected FAIL: `Cannot find module '../../src/app/notificationQueries'`.

- [ ] Step 2: Implement.

  `core-engine/src/app/notificationQueries.ts`:
  ```ts
  import { Task } from '../domain/task';
  import { isSnoozed } from '../domain/snooze';
  import { TaskRepository } from '../ports/TaskRepository';
  import { Clock } from '../ports/Clock';

  export async function deadlinesDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]> {
    const now = deps.clock.now();
    const tasks = await deps.taskRepo.findDeadlinesDueWithin(now, windowEnd);
    return tasks.filter((t) => !isSnoozed(t, now));
  }

  export async function followUpsDueWithin(deps: { taskRepo: TaskRepository; clock: Clock }, windowEnd: Date): Promise<Task[]> {
    const now = deps.clock.now();
    const tasks = await deps.taskRepo.findFollowUpsDueWithin(now, windowEnd);
    return tasks.filter((t) => !isSnoozed(t, now));
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/app/notificationQueries.test.ts`
  Expected PASS: 2 tests pass.

- [ ] Step 3: Typecheck, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit`
  Expected: no errors.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/app/notificationQueries.ts core-engine/tests/app/notificationQueries.test.ts
  git commit -m "feat(core-engine): add notification query seam (deadlines and follow-ups, excluding snoozed)"
  ```

### Task 21: Postgres migration — `tasks` and `task_events` tables

**Files:**
- Create: `core-engine/migrations/001_init.sql`

**Interfaces:**
- Produces: the `tasks` table (all `Task` fields from Task 1, `CalendarEventRef` flattened to two columns) with a partial unique index enforcing dedupe (Invariant 3, CE-DEC-012); the `task_events` table (all `TaskEvent` fields from Task 3) referencing `tasks(id)`.

Depends-on: 1

This task has no TDD cycle of its own (SQL DDL, not application code) — it is verified by Task 22's and Task 23's integration tests, which run against a real database created from this file.

- [ ] Step 1: Write the migration.

  `core-engine/migrations/001_init.sql`:
  ```sql
  CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL CHECK (source IN ('manual', 'outlook_email', 'calendar_event')),
    source_ref_id TEXT,
    email_snapshot JSONB,
    importance BOOLEAN,
    urgency BOOLEAN,
    suggested_importance BOOLEAN,
    suggested_urgency BOOLEAN,
    deadline TIMESTAMPTZ,
    scheduled_date TIMESTAMPTZ,
    calendar_event_provider TEXT,
    calendar_event_external_id TEXT,
    promotion_override TIMESTAMPTZ,
    scheduling_removed BOOLEAN NOT NULL DEFAULT FALSE,
    snoozed_until TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('Open', 'Scheduled', 'Delegated', 'Completed', 'Archived', 'Deleted')),
    assignee TEXT,
    follow_up_date TIMESTAMPTZ,
    delegate_status TEXT,
    tags JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  -- Invariant 3 / CE-DEC-012: the (source, source_ref_id) claim is permanent, including
  -- past deletion. The row is retained (status just becomes 'Deleted'), so a plain
  -- partial unique index — not a soft-delete-aware one — is exactly correct here.
  CREATE UNIQUE INDEX tasks_source_dedupe_idx ON tasks (source, source_ref_id) WHERE source_ref_id IS NOT NULL;

  CREATE TABLE task_events (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id),
    event_type TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    occurred_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX task_events_task_id_idx ON task_events (task_id, occurred_at);
  ```

- [ ] Step 2: Commit.

  ```bash
  cd /mnt/c/git/tme && git add core-engine/migrations/001_init.sql
  git commit -m "feat(core-engine): add initial Postgres migration for tasks and task_events"
  ```

### Task 22: `PgTaskRepository` — Postgres adapter for `TaskRepository`

**Files:**
- Create: `core-engine/src/adapters/postgres/db.ts`, `core-engine/src/adapters/postgres/PgTaskRepository.ts`
- Test: `core-engine/tests/adapters/postgres/PgTaskRepository.integration.test.ts`

**Interfaces:**
- Consumes: `Task`, `Source`, `CalendarEventRef` (Task 1), `TaskRepository` (Task 11), `createTask` (Task 1).
- Produces: `createPool(connectionString: string): Pool`, `PgTaskRepository implements TaskRepository`.

Depends-on: 1, 11, 21

These tests need a running Postgres. Start one locally with:
```bash
docker run --rm -d --name core-pg -e POSTGRES_PASSWORD=test -p 55440:5432 postgres:16
sleep 2
PGPASSWORD=test psql -h localhost -p 55440 -U postgres -c 'CREATE DATABASE core_engine_test;'
PGPASSWORD=test psql -h localhost -p 55440 -U postgres -d core_engine_test -f /mnt/c/git/tme/core-engine/migrations/001_init.sql
export CORE_PG_URL="postgres://postgres:test@localhost:55440/core_engine_test"
```
When `CORE_PG_URL` is unset, `npx vitest run` still runs (and passes) every other test in the suite — only these two integration files skip themselves.

- [ ] Step 1: Write the failing integration test.

  `core-engine/tests/adapters/postgres/PgTaskRepository.integration.test.ts`:
  ```ts
  import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
  import { Pool } from 'pg';
  import { createTask } from '../../../src/domain/task';
  import { PgTaskRepository } from '../../../src/adapters/postgres/PgTaskRepository';

  const connectionString = process.env.CORE_PG_URL;
  const describeIfPg = connectionString ? describe : describe.skip;

  describeIfPg('PgTaskRepository (integration)', () => {
    let pool: Pool;
    let repo: PgTaskRepository;

    beforeAll(async () => {
      pool = new Pool({ connectionString });
      repo = new PgTaskRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    beforeEach(async () => {
      await pool.query('TRUNCATE tasks, task_events CASCADE');
    });

    test('round-trips a saved task', async () => {
      const task = createTask(
        { title: 'Integration test', description: 'desc', source: 'manual', sourceRefId: null },
        new Date('2026-01-01T00:00:00Z')
      );
      await repo.save(task);
      const found = await repo.findById(task.id);
      expect(found?.title).toBe('Integration test');
      expect(found?.status).toBe('Open');
      expect(found?.tags).toEqual([]);
    });

    test('finds a task by calendarEventRef', async () => {
      const task = {
        ...createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date('2026-01-01T00:00:00Z')),
        calendarEventRef: { provider: 'google', externalEventId: 'evt-1' },
      };
      await repo.save(task);
      const found = await repo.findByCalendarEventRef({ provider: 'google', externalEventId: 'evt-1' });
      expect(found?.id).toBe(task.id);
    });

    test('rejects a second insert for the same source and source_ref_id (dedupe unique index)', async () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const first = createTask({ title: 'A', description: '', source: 'outlook_email', sourceRefId: 'dupe-1' }, now);
      const second = createTask({ title: 'B', description: '', source: 'outlook_email', sourceRefId: 'dupe-1' }, now);
      await repo.save(first);
      await expect(repo.save(second)).rejects.toThrow();
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/adapters/postgres/PgTaskRepository.integration.test.ts`
  Expected FAIL (with `CORE_PG_URL` set): `Cannot find module '../../../src/adapters/postgres/PgTaskRepository'`. Without `CORE_PG_URL` set, this whole file reports skipped, not failed — do this step with `CORE_PG_URL` exported so the RED step is real.

- [ ] Step 2: Implement `db.ts` and `PgTaskRepository.ts`.

  `core-engine/src/adapters/postgres/db.ts`:
  ```ts
  import { Pool } from 'pg';

  export function createPool(connectionString: string): Pool {
    return new Pool({ connectionString });
  }
  ```

  `core-engine/src/adapters/postgres/PgTaskRepository.ts`:
  ```ts
  import { Pool } from 'pg';
  import { Task, Source, Status, CalendarEventRef } from '../../domain/task';
  import { TaskRepository } from '../../ports/TaskRepository';

  interface TaskRow {
    id: string;
    title: string;
    description: string;
    source: Source;
    source_ref_id: string | null;
    email_snapshot: Record<string, unknown> | null;
    importance: boolean | null;
    urgency: boolean | null;
    suggested_importance: boolean | null;
    suggested_urgency: boolean | null;
    deadline: Date | null;
    scheduled_date: Date | null;
    calendar_event_provider: string | null;
    calendar_event_external_id: string | null;
    promotion_override: Date | null;
    scheduling_removed: boolean;
    snoozed_until: Date | null;
    status: Status;
    assignee: string | null;
    follow_up_date: Date | null;
    delegate_status: string | null;
    tags: string[];
    created_at: Date;
    updated_at: Date;
  }

  function fromRow(row: TaskRow): Task {
    const calendarEventRef: CalendarEventRef | null =
      row.calendar_event_provider !== null && row.calendar_event_external_id !== null
        ? { provider: row.calendar_event_provider, externalEventId: row.calendar_event_external_id }
        : null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      source: row.source,
      sourceRefId: row.source_ref_id,
      emailSnapshot: row.email_snapshot,
      importance: row.importance,
      urgency: row.urgency,
      suggestedImportance: row.suggested_importance,
      suggestedUrgency: row.suggested_urgency,
      deadline: row.deadline,
      scheduledDate: row.scheduled_date,
      calendarEventRef,
      promotionOverride: row.promotion_override,
      schedulingRemoved: row.scheduling_removed,
      snoozedUntil: row.snoozed_until,
      status: row.status,
      assignee: row.assignee,
      followUpDate: row.follow_up_date,
      delegateStatus: row.delegate_status,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  export class PgTaskRepository implements TaskRepository {
    constructor(private pool: Pool) {}

    async save(task: Task): Promise<void> {
      await this.pool.query(
        `INSERT INTO tasks (
          id, title, description, source, source_ref_id, email_snapshot,
          importance, urgency, suggested_importance, suggested_urgency,
          deadline, scheduled_date, calendar_event_provider, calendar_event_external_id,
          promotion_override, scheduling_removed, snoozed_until, status,
          assignee, follow_up_date, delegate_status, tags, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description,
          importance = EXCLUDED.importance, urgency = EXCLUDED.urgency,
          suggested_importance = EXCLUDED.suggested_importance, suggested_urgency = EXCLUDED.suggested_urgency,
          deadline = EXCLUDED.deadline, scheduled_date = EXCLUDED.scheduled_date,
          calendar_event_provider = EXCLUDED.calendar_event_provider,
          calendar_event_external_id = EXCLUDED.calendar_event_external_id,
          promotion_override = EXCLUDED.promotion_override, scheduling_removed = EXCLUDED.scheduling_removed,
          snoozed_until = EXCLUDED.snoozed_until, status = EXCLUDED.status,
          assignee = EXCLUDED.assignee, follow_up_date = EXCLUDED.follow_up_date,
          delegate_status = EXCLUDED.delegate_status, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at`,
        [
          task.id, task.title, task.description, task.source, task.sourceRefId,
          task.emailSnapshot, task.importance, task.urgency, task.suggestedImportance, task.suggestedUrgency,
          task.deadline, task.scheduledDate,
          task.calendarEventRef?.provider ?? null, task.calendarEventRef?.externalEventId ?? null,
          task.promotionOverride, task.schedulingRemoved, task.snoozedUntil, task.status,
          task.assignee, task.followUpDate, task.delegateStatus, JSON.stringify(task.tags),
          task.createdAt, task.updatedAt,
        ]
      );
    }

    async findById(id: string): Promise<Task | null> {
      const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE id = $1', [id]);
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    }

    async findBySource(source: Source, sourceRefId: string): Promise<Task | null> {
      const result = await this.pool.query<TaskRow>(
        'SELECT * FROM tasks WHERE source = $1 AND source_ref_id = $2',
        [source, sourceRefId]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    }

    async findByCalendarEventRef(ref: CalendarEventRef): Promise<Task | null> {
      const result = await this.pool.query<TaskRow>(
        'SELECT * FROM tasks WHERE calendar_event_provider = $1 AND calendar_event_external_id = $2',
        [ref.provider, ref.externalEventId]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    }

    async findDeadlinesDueWithin(from: Date, to: Date): Promise<Task[]> {
      const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE deadline BETWEEN $1 AND $2', [from, to]);
      return result.rows.map(fromRow);
    }

    async findFollowUpsDueWithin(from: Date, to: Date): Promise<Task[]> {
      const result = await this.pool.query<TaskRow>('SELECT * FROM tasks WHERE follow_up_date BETWEEN $1 AND $2', [from, to]);
      return result.rows.map(fromRow);
    }
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/adapters/postgres/PgTaskRepository.integration.test.ts`
  Expected PASS: 3 tests pass (requires `CORE_PG_URL` pointed at a migrated database; without it, 3 skipped).

- [ ] Step 3: Typecheck, run the full non-integration suite to confirm nothing else broke, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit && npx vitest run`
  Expected: no type errors; all suites pass (integration files skip if `CORE_PG_URL` is unset, pass if it is set).

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/adapters/postgres/db.ts core-engine/src/adapters/postgres/PgTaskRepository.ts core-engine/tests/adapters/postgres/PgTaskRepository.integration.test.ts
  git commit -m "feat(core-engine): add PgTaskRepository Postgres adapter"
  ```

### Task 23: `PgTaskEventRepository` — Postgres adapter for `TaskEventRepository`

**Files:**
- Create: `core-engine/src/adapters/postgres/PgTaskEventRepository.ts`
- Test: `core-engine/tests/adapters/postgres/PgTaskEventRepository.integration.test.ts`

**Interfaces:**
- Consumes: `TaskEvent`, `EventType`, `createTaskEvent` (Task 3), `TaskEventRepository` (Task 11), `createTask` (Task 1), `PgTaskRepository` (Task 22, test-only — used to insert the parent task row `task_events.task_id` must reference).
- Produces: `PgTaskEventRepository implements TaskEventRepository`.

Depends-on: 3, 11, 21, 22

Uses the same `CORE_PG_URL`-gated database as Task 22 (see that task's docker one-liner).

- [ ] Step 1: Write the failing integration test.

  `core-engine/tests/adapters/postgres/PgTaskEventRepository.integration.test.ts`:
  ```ts
  import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
  import { Pool } from 'pg';
  import { createTask } from '../../../src/domain/task';
  import { createTaskEvent } from '../../../src/domain/taskEvent';
  import { PgTaskRepository } from '../../../src/adapters/postgres/PgTaskRepository';
  import { PgTaskEventRepository } from '../../../src/adapters/postgres/PgTaskEventRepository';

  const connectionString = process.env.CORE_PG_URL;
  const describeIfPg = connectionString ? describe : describe.skip;

  describeIfPg('PgTaskEventRepository (integration)', () => {
    let pool: Pool;
    let taskRepo: PgTaskRepository;
    let eventRepo: PgTaskEventRepository;

    beforeAll(async () => {
      pool = new Pool({ connectionString });
      taskRepo = new PgTaskRepository(pool);
      eventRepo = new PgTaskEventRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    beforeEach(async () => {
      await pool.query('TRUNCATE tasks, task_events CASCADE');
    });

    test('appends events and reads them back in occurred_at order', async () => {
      const now = new Date('2026-01-01T00:00:00Z');
      const task = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, now);
      await taskRepo.save(task);

      await eventRepo.append(createTaskEvent(task.id, 'capture', null, {}, now));
      await eventRepo.append(
        createTaskEvent(task.id, 'status_transition', 'Open', 'Scheduled', new Date('2026-01-02T00:00:00Z'))
      );

      const events = await eventRepo.findByTaskId(task.id);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('capture');
      expect(events[1].eventType).toBe('status_transition');
      expect(events[1].oldValue).toBe('Open');
      expect(events[1].newValue).toBe('Scheduled');
    });
  });
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/adapters/postgres/PgTaskEventRepository.integration.test.ts`
  Expected FAIL (with `CORE_PG_URL` set): `Cannot find module '../../../src/adapters/postgres/PgTaskEventRepository'`.

- [ ] Step 2: Implement.

  `core-engine/src/adapters/postgres/PgTaskEventRepository.ts`:
  ```ts
  import { Pool } from 'pg';
  import { TaskEvent, EventType } from '../../domain/taskEvent';
  import { TaskEventRepository } from '../../ports/TaskEventRepository';

  interface TaskEventRow {
    id: string;
    task_id: string;
    event_type: EventType;
    old_value: unknown;
    new_value: unknown;
    occurred_at: Date;
  }

  function fromRow(row: TaskEventRow): TaskEvent {
    return {
      id: row.id,
      taskId: row.task_id,
      eventType: row.event_type,
      oldValue: row.old_value,
      newValue: row.new_value,
      occurredAt: row.occurred_at,
    };
  }

  export class PgTaskEventRepository implements TaskEventRepository {
    constructor(private pool: Pool) {}

    async append(event: TaskEvent): Promise<void> {
      await this.pool.query(
        'INSERT INTO task_events (id, task_id, event_type, old_value, new_value, occurred_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [
          event.id,
          event.taskId,
          event.eventType,
          JSON.stringify(event.oldValue),
          JSON.stringify(event.newValue),
          event.occurredAt,
        ]
      );
    }

    async findByTaskId(taskId: string): Promise<TaskEvent[]> {
      const result = await this.pool.query<TaskEventRow>(
        'SELECT * FROM task_events WHERE task_id = $1 ORDER BY occurred_at ASC',
        [taskId]
      );
      return result.rows.map(fromRow);
    }
  }
  ```

  Run: `cd /mnt/c/git/tme/core-engine && npx vitest run tests/adapters/postgres/PgTaskEventRepository.integration.test.ts`
  Expected PASS: 1 test passes (requires `CORE_PG_URL`; skipped otherwise).

- [ ] Step 3: Typecheck, run the full suite, then commit.

  Run: `cd /mnt/c/git/tme/core-engine && npx tsc --noEmit && npx vitest run`
  Expected: no type errors; every test file passes (integration files pass if `CORE_PG_URL` is set, skip otherwise).

  ```bash
  cd /mnt/c/git/tme && git add core-engine/src/adapters/postgres/PgTaskEventRepository.ts core-engine/tests/adapters/postgres/PgTaskEventRepository.integration.test.ts
  git commit -m "feat(core-engine): add PgTaskEventRepository Postgres adapter"
  ```

---

## Final Verification

Core Engine has no UI or HTTP surface (spec Section 1, Section 7), so there is no Lighthouse, accessibility, or E2E gate here — those apply to later sub-projects with an actual interface. Definition of done for this plan:

1. **Full unit suite, no database required:**
   ```bash
   cd /mnt/c/git/tme/core-engine && npx vitest run
   ```
   Expected: every `tests/domain/**` and `tests/app/**` file passes; the two `tests/adapters/postgres/*.integration.test.ts` files report as skipped (not failed) when `CORE_PG_URL` is unset.

2. **Typecheck clean:**
   ```bash
   cd /mnt/c/git/tme/core-engine && npx tsc --noEmit
   ```

3. **Integration suite, with Postgres running** (see Task 22's docker one-liner):
   ```bash
   cd /mnt/c/git/tme/core-engine && CORE_PG_URL="postgres://postgres:test@localhost:55440/core_engine_test" npx vitest run
   ```
   Expected: all tests pass, including the two integration files.

4. **Dependency rule check** — confirm no file under `core-engine/src/domain/` imports from `core-engine/src/adapters/` or from `pg`:
   ```bash
   grep -rl "adapters/postgres\|from 'pg'\|from \"pg\"" core-engine/src/domain || echo "clean"
   ```
   Expected output: `clean`.

5. **Spec coverage** — every invariant (Section 4, items 1-6), every port and seam (Section 5), and the full event-type list (Section 6) has at least one passing test exercising it; see the per-task **Interfaces** lines above for the full traceability map back to spec sections.

## ✅ Definition of Done
- [ ] All 23 tasks committed, each with its own green test run.
- [ ] `npx vitest run` green with no `CORE_PG_URL` set.
- [ ] `npx vitest run` green with `CORE_PG_URL` set against a migrated Postgres 16 instance.
- [ ] `npx tsc --noEmit` clean.
- [ ] Dependency-rule grep (Final Verification, item 4) prints `clean`.
