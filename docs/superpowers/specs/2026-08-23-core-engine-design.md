# Core Engine — Design Spec

**Sub-project of:** the Eisenhower-Matrix task platform (Discovery Summary: [`2026-08-22-eisenhower-task-platform-design.md`](./2026-08-22-eisenhower-task-platform-design.md))
**Status:** Approved. CE-DEC-001 through CE-DEC-012 (Section 8) and the design content — domain model, invariants and rules, ports and seams, event log, testing approach — were approved by the Product Owner in a live sectioned design review; the compiled document received final Product Owner sign-off on 2026-08-23.
**Stage:** Design spec — conceptual and contract-level only. No technology, framework, or storage names appear anywhere in this document; stack selection is explicitly out of scope here and happens during Core Engine's own implementation-planning step (Section 10).
**Date:** 2026-08-23

> **Placeholder name notice.** The platform this sub-project belongs to is referred to in the Discovery Summary by the working title "Quadrant" — an unapproved placeholder (Discovery OQ-001). Noted once here for traceability; not used again in this document.

## Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Relationship to the Discovery Summary](#2-relationship-to-the-discovery-summary)
3. [Domain Model](#3-domain-model)
4. [Invariants and Rules](#4-invariants-and-rules)
5. [Ports and Seams](#5-ports-and-seams)
6. [Event Log](#6-event-log)
7. [Testing Approach](#7-testing-approach)
8. [Core Engine Decision Log](#8-core-engine-decision-log)
9. [Open Items for Later Sub-Projects](#9-open-items-for-later-sub-projects)
10. [Recommended Next Step](#10-recommended-next-step)

---

## 1. Purpose & Scope

Core Engine is the sub-project that owns the Task/Domain model: the task entity itself, its lifecycle and status rules, its classification state (importance and urgency), tagging, and the source/dedupe contract that every capture path — manual entry, Outlook email, or a calendar event — must go through. At a responsibility level, this is the "Core/Domain" module described in Discovery Section 17, and per Discovery Section 24 it is the first sub-project to receive its own design spec, since the Outlook, Calendar, AI, and Notifications sub-projects all depend on what this document defines.

Per CE-DEC-001, Core Engine is deliberately narrow: it defines the seams (interfaces, Section 5) that other sub-projects plug into, without implementing what sits behind those seams. Explicitly out of scope for this document:

- **Notification delivery** — channel choice, formatting, and scheduling of reminders. Core exposes only the two read queries in Section 5; delivery belongs to the Notifications sub-project.
- **The AI model call** — Core defines the `SuggestionPort` seam and where its result lands (Section 5), not how a suggestion is produced. That belongs to the AI sub-project.
- **Calendar and email adapters** — provider-specific reads, writes, and OAuth scope handling. These belong to the Calendar and Outlook integration sub-projects (Discovery Section 17).
- **UI** — Core Engine has no UI or HTTP surface of its own (Section 7).
- **Stack selection** — no technology, language, framework, or storage choice is made anywhere in this document. That happens during Core Engine's own implementation-planning step (Section 10).

## 2. Relationship to the Discovery Summary

Core Engine inherits the full Discovery Summary decision set, DEC-001 through DEC-026, all approved. Nothing in this document overrides a Discovery decision except where explicitly called out below. Per Discovery Section 24 (Recommended Next Step), Core Engine is the first sub-project to receive its own design spec, since the Outlook, Calendar, AI, and Notifications sub-projects all depend on the Task/Domain model this document defines (Discovery Section 17).

### Revisions to the Discovery Summary

Two points in this document depart from the Discovery Summary's original wording. Both were approved by the Product Owner in the same review as the rest of this spec, and are called out here explicitly rather than left as a silent contradiction.

**CE-DEC-005 revises Discovery Section 7.** Discovery Section 7 (Task Lifecycle), step 3, described a task as "scheduled and/or delegated (optional, not mutually exclusive)." CE-DEC-005 revises this: `Scheduled` and `Delegated` are mutually exclusive operational statuses. A task cannot be in both at once — setting delegate fields on a `Scheduled` task auto-clears the schedule (Invariant 1, Section 4) rather than letting both hold simultaneously. Both statuses remain independent of quadrant — a `Do`-quadrant task can still carry status `Scheduled`, for example — so this revision narrows only the Scheduled/Delegated pairing, not the broader lifecycle model.

**CE-DEC-012 extends Discovery DEC-021.** Discovery DEC-021 established permanent dedupe by source id, naming archived and completed tasks explicitly as cases where a task must not be recreated. It did not address what happens if the task was instead deleted, leaving that case open. CE-DEC-012 resolves it: the `(source, source_ref_id)` claim outlives the task through deletion too — a deleted, sourced task never resurrects on a later poll. This is an extension of DEC-021's intent into a case DEC-021 left unaddressed, not a reversal of it.

## 3. Domain Model

Discovery Section 13 sketched these concepts at a conceptual level only, explicitly deferring field types, storage, and relationships to a later technical spec. This section — and Discovery DEC-011's MVP field set — is that elaboration: still conceptual (no storage engine, no field types, no schema), but concrete enough to state invariants against (Section 4).

**Task (the aggregate).** Conceptually carries:
- `id` — a unique identifier for the task.
- `title`, `description`.
- `source` — one of `manual`, `outlook_email`, `calendar_event`.
- `source_ref_id` — the source-side reference used for dedupe (Invariant 3).
- `importance`, `urgency` — each yes/no, both unset until the task is classified (CE-DEC-007).
- `deadline` — optional.
- `scheduled_date` — optional.
- `snoozed_until` — optional; while active, the task is hidden from the matrix and from reminder queries, and reappears automatically once the date arrives; nothing else about the task changes — the quadrant axes stay untouched (CE-DEC-008, Discovery DEC-010).
- `promotion_override` — see Invariant 2, Section 4.
- `status` — per CE-DEC-005.
- Delegate fields: a free-text `assignee`, a `follow_up_date`, and a `delegate_status` toggle (Discovery DEC-009).
- `suggested_importance` / `suggested_urgency` — the AI's pending proposal, held until the user approves or rejects it (Discovery DEC-008).
- `scheduling_removed` — an indicator set per Invariant 6 (Discovery DEC-022).
- `tags` — a set of free-form labels.
- Created and last-updated timestamps.

**Derived, never stored.** `effective_quadrant` is computed from `importance`, `urgency`, `deadline`, and `promotion_override` (Invariant 2, Section 4) — it is never a stored field (CE-DEC-002, CE-DEC-007). Unset axes mean unclassified, which means the Inbox (CE-DEC-009, Discovery DEC-014); there is no fifth quadrant and no special status value for this case.

**EmailSnapshot.** Content captured from an email-sourced task at the moment of capture, never refreshed afterward (Discovery DEC-004). Core treats it as an owned snapshot structure and guarantees only that it is stored at capture and immutable afterward; the exact field list (sender, subject, body summary, deep link, and so on) is deliberately deferred to the Outlook integration sub-project's own spec (Section 9).

**CalendarEventRef.** Recorded when a task creates a calendar event, or, per Discovery DEC-006, when a calendar event produces a task. It is a one-way link record — a provider identifier and an external event identifier — with nothing synced through it afterward.

**TaskEvent.** A history entry (CE-DEC-010): a task identifier, an event type, an old value and a new value, and a timestamp. Event types: capture; classification applied (recording whether the origin was manual or an approved AI suggestion); suggestion rejected; status transition; snooze/unsnooze; deadline change; promotion-override placed or cleared.

## 4. Invariants and Rules

1. **Exclusivity and auto-clear.** `Scheduled` and `Delegated` are mutually exclusive statuses (CE-DEC-005). Delegating a task that is currently `Scheduled` clears its `scheduled_date` and its `CalendarEventRef` link — locally, in Core, only. The calendar event already created in the user's calendar is left untouched (CE-DEC-006); deleting that calendar event as part of the auto-clear was considered and parked, not decided against. The task's status becomes `Delegated`.
2. **Promotion.** When a task is important, not urgent, and its deadline has passed, and no promotion override is in effect, its effective quadrant is `Do` (CE-DEC-002) — computed at read time, never stored. The override is created when the user manually moves an auto-promoted task back to `Schedule`; it is bound to that specific deadline value, and changing the deadline clears it, re-arming promotion (CE-DEC-003). Independent of promotion, the user may reclassify a task to any quadrant at any time (Discovery DEC-026).
3. **Dedupe.** The pair `(source, source_ref_id)` is unique forever once claimed through `capture_or_get` (Section 5) — including past a task's deletion (CE-DEC-012, extending Discovery DEC-021).
4. **Status transitions and snooze eligibility.** Legal status moves: `Open` and `Scheduled` transition to each other; `Open` or `Scheduled` transition to `Delegated` (an auto-clear per Invariant 1 when the task was `Scheduled`); any active status — `Open`, `Scheduled`, or `Delegated` — transitions to `Completed`; any status transitions to `Archived`; any status transitions to `Deleted` (the separate, explicit manual action of Discovery DEC-010); `Archived` is restorable to `Open`; `Deleted` is terminal, with no transition out of it. All moves not listed here are illegal. Snooze applies only to the active statuses (`Open`, `Scheduled`, `Delegated`); it never applies to `Completed`, `Archived`, or `Deleted`.
5. **Classification.** The AI writes only the `suggested_importance` and `suggested_urgency` fields, never the real axes directly. User approval copies the suggested values onto the real `importance`/`urgency` axes. The user may set the axes manually at any time, whether before or after a suggestion exists (Discovery DEC-008).
6. **Inbound event cancellation.** When the calendar adapter reports that a linked calendar event was canceled externally, Core clears the task's `scheduled_date` and `CalendarEventRef`, sets the `scheduling_removed` indicator, and moves the task's status from `Scheduled` back to `Open`. The importance/urgency axes are untouched (Discovery DEC-022).

## 5. Ports and Seams

Core's internal shape follows a pragmatic domain-centric architecture (CE-DEC-011): a domain model holding the invariants of Section 4, application services per use case, and ports where adapters, persistence, the AI suggestion module, and notifications plug in. Full tactical domain-driven design — aggregates, value objects, domain events, and factories used everywhere — was rejected as ceremony without need; a thin CRUD shape was also rejected, because Core's genuine invariants (Section 4) would leak into every caller instead of being enforced once.

**Inbound** (driven by adapters or UI):
- `capture_or_get(source, source_ref_id, content)` — the dedupe-enforcing entry point for every capture path (CE-DEC-004); returns the existing task if one already claims that `source`/`source_ref_id` pair, or creates a new one in the Inbox otherwise. Integration adapters call this operation and never reimplement dedupe themselves.
- `event_cancelled(event_ref)` — called by the calendar adapter when it detects an external cancellation of a linked event; triggers Invariant 6.
- UI-facing application services: classify (manually, or by approving/rejecting an AI suggestion), schedule, delegate, complete, archive, restore, delete, snooze/unsnooze, edit fields, and tag.

**Outbound** (Core calls; other sub-projects implement):
- `SchedulingPort.create_event(task)`, returning an event reference — invoked when the user schedules a task onto a calendar; implemented per provider by the Calendar integration sub-project.
- `SuggestionPort.suggest(task_content)`, returning a suggested importance and urgency — implemented by the AI sub-project; Core stores the result only into the `suggested_importance` / `suggested_urgency` fields, never directly onto the real axes (Invariant 5).
- `TaskRepository` and `TaskEventRepository` — persistence interfaces; the domain never touches storage directly.

**Query seam for Notifications.** Core exposes two read queries — deadlines due within a window, and follow-ups due within a window — both excluding snoozed tasks (CE-DEC-008). The Notifications sub-project polls these queries on its own schedule; Core owns no delivery mechanism and no channels (CE-DEC-001).

## 6. Event Log

Core keeps a minimal history log per task (CE-DEC-010), populated by `TaskEvent` entries as defined in Section 3: task identifier, event type, old value, new value, and timestamp. The recorded event types are: capture; classification applied (recording whether the origin was manual or an approved AI suggestion); suggestion rejected; status transition; snooze/unsnooze; deadline change; and promotion-override placed or cleared.

**Amendment note (approved).** An earlier draft of this decision listed auto-promotions among the logged event types. Because promotion is computed at read time as a derived value and never stored (CE-DEC-002), there is no stored transition to log at the moment a task becomes promoted — logging one would require either a background job (rejected by CE-DEC-002) or a read that also writes as a side effect (rejected as a hidden and surprising behavior). The Product Owner approved removing auto-promotions from the logged event list on that basis. Promotion history is not lost by this: it stays fully reconstructable from what IS logged — deadline changes, override placed/cleared events, and classification events — replayed against the promotion rule in Section 4, Invariant 2.

## 7. Testing Approach

The domain is fully pure: every invariant in Section 4 is unit-testable with no persistence, framework, or wall clock involved — time is injected, which matters specifically for promotion (Invariant 2) and snooze (Section 3).

Required coverage, per the project's testing rubric:
- The derived-quadrant function across all branches: unset axes, each of the four quadrants, and a passed deadline both with and without an active override.
- The status transition rules in Invariant 4 — legal moves and illegal moves alike.
- The auto-clear rule (Invariant 1).
- Dedupe create-or-get, including the past-deletion case (Invariant 3, CE-DEC-012).
- The override lifecycle: placed, then the deadline changes, then cleared (Invariant 2).

Application services (Section 5) are tested against fake ports, not real adapters. Core Engine has no UI or HTTP surface of its own, so this sub-project carries no end-to-end tests.

## 8. Core Engine Decision Log

| ID | Topic | Decision | Reason | Status |
|---|---|---|---|---|
| CE-DEC-001 | Scope boundary | Core covers the Task/Domain model, lifecycle, classification state, tagging, and the source/dedupe contract. Notification delivery and the AI model call are out of scope — Core defines only the seams they plug into | Keeps Core buildable and testable standalone; matches the Core/Domain boundary in Discovery Section 17 | Approved |
| CE-DEC-002 | Auto-promotion mechanism | Auto-promotion is computed at read time as a derived effective quadrant; no background job ever mutates a stored quadrant | Simpler, always accurate, and carries no scheduler dependency | Approved |
| CE-DEC-003 | Auto-promotion override | A user's manual move-back sticks: it suppresses re-promotion for that same passed deadline. Only a change to the deadline itself re-arms promotion | A derived quadrant must not fight the user's own override | Approved |
| CE-DEC-004 | Dedupe enforcement | Dedupe is centralized in Core via one `capture_or_get(source, source_ref_id, content)` operation; integration adapters call it and never reimplement dedupe themselves | Enforces Discovery DEC-021 in one place instead of trusting every adapter to reimplement it correctly | Approved |
| CE-DEC-005 | Status model | A single `status` field with six values: `Open`, `Scheduled`, `Delegated`, `Completed`, `Archived`, `Deleted`. `Scheduled` and `Delegated` are mutually exclusive operational statuses, independent of quadrant. Setting delegate fields on a `Scheduled` task auto-clears the schedule | Replaces the ambiguity in Discovery Section 7's original "not mutually exclusive" phrasing with one deterministic status model (see Section 2, Revisions to the Discovery Summary) | Approved |
| CE-DEC-006 | Auto-clear scope | When delegation auto-clears a schedule, Core clears only its own `scheduled_date` and `CalendarEventRef` link; the calendar event already created in the user's calendar is left untouched | Keeps the auto-clear local to Core, staying inside Discovery DEC-006's no-ongoing-sync boundary; writing a delete-event call was considered and parked rather than built | Approved |
| CE-DEC-007 | Quadrant storage | `importance` and `urgency` (each yes/no) are the stored facts, both unset until classified; the effective quadrant is always derived, never stored. The AI suggests the two axes, not a quadrant label | One source of truth — a stored quadrant that contradicts its own axes becomes structurally impossible | Approved |
| CE-DEC-008 | Snooze | A `snoozed_until` date; while active, the task is hidden from the matrix and from reminder queries, and reappears automatically once the date arrives; nothing else about the task changes | Keeps snooze a pure visibility/timing concern — classification axes stay untouched (Discovery DEC-010) | Approved |
| CE-DEC-009 | Unclassified | Unset importance/urgency means unclassified, which means the Inbox (Discovery DEC-014); there is no fifth quadrant and no special status value for it | Avoids modeling a special case for what is structurally just two unset booleans | Approved |
| CE-DEC-010 | History (as amended) | A minimal event log (Section 6); auto-promotions are not among the logged event types, since promotion is a read-time derivation (CE-DEC-002) with no stored transition to log | Logging a derived-at-read-time fact would require a background job or a read that also writes, both rejected; promotion history stays reconstructable from what IS logged | Approved |
| CE-DEC-011 | Internal shape | Pragmatic domain-centric architecture: one domain model holding the invariants, application services per use case, and ports for adapters, persistence, the AI module, and notifications to plug into | Full tactical DDD is ceremony without need here; a thin CRUD shape would let Core's genuine invariants leak out of the domain | Approved |
| CE-DEC-012 | Dedupe survives deletion | The `(source, source_ref_id)` claim outlives the task — deleting a sourced task does not free its claim, so the next poll cannot recreate it | Extends Discovery DEC-021, which named only archived/completed tasks and left the deleted case open; the Product Owner approved closing that gap | Approved |

## 9. Open Items for Later Sub-Projects

The following are deliberately deferred to other sub-projects' own specs, not unresolved gaps in this one:

| Item | Deferred to | What Core Engine already guarantees |
|---|---|---|
| `EmailSnapshot`'s exact field list (sender, subject, body summary, deep link, and so on) | Outlook integration spec | Captured at capture time; immutable afterward (Section 3) |
| Per-provider calendar event creation mechanics | Calendar integration spec | Only the `SchedulingPort.create_event` seam is defined (Section 5); each provider's adapter implements it |
| Suggestion quality and model behavior | AI spec | Only the `SuggestionPort.suggest` seam and its landing fields are defined (Section 5); Core makes no claim about suggestion accuracy |
| Reminder delivery channels (in-app, email digest) | Notifications spec | Only the two read queries are exposed (Section 5); Core owns no delivery mechanism (CE-DEC-001) |

Discovery's remaining Open Questions OQ-001, OQ-003, and OQ-004 (Discovery Section 20) stay open exactly as recorded there, and none of them block Core Engine implementation planning. OQ-001 (product naming) and OQ-004 (personal-vs-corporate Microsoft account edge cases) concern branding and the Outlook integration's account model, neither of which Core Engine touches. OQ-003 (polling interval and rate-limit behavior) concerns the Capture/Sync engine and the integration adapters, not Core's own seams.

**OQ-002 (calendar event time-change propagation).** This one also stays open and also does not block Core Engine implementation planning, but it deserves its own note rather than a one-line dismissal. Core's design here is propagation-agnostic: the `event_cancelled(event_ref)` inbound seam (Section 5, Invariant 6) already establishes the shape Core uses for "the calendar adapter reports an external change; Core applies a rule and updates the task." If the Product Owner later confirms the one-direction propagation exception noted in Discovery Section 9 — a linked event's time change updating the task's `scheduled_date` — it would arrive through an inbound seam of that same family (for example, an event-time-changed notification) plus one corresponding invariant alongside Section 4's six. It would not require changing the Task domain model, the status model, or any other decision in this document. That is why OQ-002 does not block Core Engine implementation planning now.

## 10. Recommended Next Step

This sub-project's own design-approval cycle is complete: Sections 1–9 above, and the Core Engine Decision Log (Section 8), are approved.

1. Take this spec through Core Engine's own implementation-planning step — decomposing it into an ordered, executable task breakdown. Stack selection (language, frameworks, storage, and any other technology choice) happens at that step, not in this document.
2. The remaining sub-projects — Outlook email integration, Calendar integration, AI suggestion, and Notifications — each go through the same brainstorm → design spec → approval cycle this document just went through, and each gets its own implementation-planning step afterward, per Discovery Section 24.
3. Implementation should not start directly from this document, consistent with how the Discovery Summary itself was not meant to be implemented from directly.
