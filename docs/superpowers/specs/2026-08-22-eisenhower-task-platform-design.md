# Product Discovery Summary: Task Management and Productivity Platform Based on the Eisenhower Matrix

**Working title used in this document:** "Quadrant"
**Status:** Discovery / Brainstorm — Approved. DEC-001–DEC-024 were approved by the Product Owner in a live Q&A; DEC-025 and DEC-026 were approved in a follow-up review round that resolved two of the Open Questions (see Section 19 and Section 20). This Discovery Summary as a whole is approved as of that round.
**Stage:** Pre-spec. This document is a Discovery deliverable only. It contains no technology stack, no architecture spec, and no implementation task breakdown — those come from separate, later design-approval cycles (see Section 24).
**Date:** 2026-08-22

> **Placeholder name notice.** "Quadrant" is a **working title only** and has **not** been approved as the product name. It is used throughout this document purely so the text reads naturally. The name is also carried forward as an open item in Section 20 (Open Questions) and must not be treated as final.

## Contents

1. [Product Vision](#1-product-vision)
2. [Problem Statement](#2-problem-statement)
3. [Target Personas](#3-target-personas)
4. [Core User Journeys](#4-core-user-journeys)
5. [Value Proposition](#5-value-proposition)
6. [Eisenhower Model](#6-eisenhower-model)
7. [Task Lifecycle](#7-task-lifecycle)
8. [Outlook Integration Model](#8-outlook-integration-model)
9. [Google Calendar Integration Model](#9-google-calendar-integration-model)
10. [Outlook Calendar Integration Model](#10-outlook-calendar-integration-model)
11. [Synchronization Rules](#11-synchronization-rules)
12. [AI Opportunities](#12-ai-opportunities)
13. [Core Domain Concepts](#13-core-domain-concepts)
14. [Security Considerations](#14-security-considerations)
15. [MVP Scope](#15-mvp-scope)
16. [Future Scope](#16-future-scope)
17. [Integration Boundaries](#17-integration-boundaries)
18. [Edge Case Register](#18-edge-case-register)
19. [Decision Log](#19-decision-log)
20. [Open Questions](#20-open-questions)
21. [Idea Parking Lot](#21-idea-parking-lot)
22. [Initial High-Level Architecture Hypothesis](#22-initial-high-level-architecture-hypothesis)
23. [Risks and Technical Unknowns](#23-risks-and-technical-unknowns)
24. [Recommended Next Step](#24-recommended-next-step)

---

## 1. Product Vision

> For individual professionals whose work is scattered across email and calendars, **Quadrant** is a personal task platform that applies the Eisenhower Matrix to unify Outlook flagged emails and calendar commitments into one prioritized view — answering "what deserves focus now" — unlike Outlook or Google Calendar alone, which surface everything and decide nothing.

This vision statement is approved verbatim, with "Quadrant" standing in for the still-undecided `[Product Name]`.

## 2. Problem Statement

Individual professionals' work is scattered across email and calendars with no single view of what actually deserves attention. Outlook and Google Calendar surface every message and every commitment, but neither one prioritizes any of it — the user is left to manually decide what matters. This product is deliberately not "another to-do list": its job is to answer one question, "what should I focus on now," using the Eisenhower Matrix (Urgent+Important, Important+Not Urgent, Urgent+Not Important, Not Urgent+Not Important) as the single organizing principle across both sources.

## 3. Target Personas

**Primary persona: The Individual Professional.** A single knowledge worker managing their own workload without dedicated administrative support. Their commitments arrive through two channels — flagged Outlook email and calendar events — and today those channels are disconnected: nothing tells them, across both, what is actually urgent and important right now. They need one prioritized view, not two more surfaces to check.

**No secondary persona is defined.** Per DEC-001, the product is scoped as an individual, single-tenant, power-user product for v1, not an organization or multi-tenant product. Team leads, delegates-as-users, and org admins are explicitly out of scope for v1 (see Section 16, Future Scope, and Section 21, Idea Parking Lot) and are not modeled here.

## 4. Core User Journeys

**(a) A flagged Outlook email becomes a Do-quadrant task.**
The user flags an important, time-sensitive email in Outlook. Quadrant's Outlook adapter reads the flag directly from the message's `followupFlag` property (DEC-013) and captures it as a new task — a one-time, independent snapshot of the email's relevant content (DEC-004) — landing first in the unclassified Inbox view (DEC-014). The AI-suggestion module proposes an Eisenhower quadrant, e.g. Do (Urgent + Important); the user reviews and approves it (DEC-008). The task now appears in the Do quadrant, the most prominent area of the matrix screen (DEC-010).

**(b) An important, not-urgent task gets manually scheduled onto the calendar.**
A task already classified into Schedule (Important, Not Urgent) needs calendar time. The user manually creates or drags a calendar block from the task (DEC-007) — Quadrant creates a calendar event from the task, one of the two one-way flows in DEC-006. The task now shows a scheduled date. There is no ongoing two-way sync after that: if the time is later changed directly on the calendar event, the current default assumption is that this does **not** propagate back to the task (see Section 11 and Open Question OQ-002). If the event is instead deleted or canceled directly in Google or Outlook, the task stays, its scheduled date clears, its quadrant is unaffected, and it shows a "scheduling removed" indicator (DEC-022).

**(c) A task is lightly delegated and followed up on.**
A task lands in Delegate (Urgent, Not Important). The user types a free-text assignee name/email and sets a follow-up date directly on the task (DEC-009). No delegate account is created and no notification is sent to anyone — there is no acceptance workflow. On or after the follow-up date, the task owner checks in themselves and flips a manual status toggle on the task to reflect what they learned (DEC-009).

## 5. Value Proposition

Unlike Outlook or Google Calendar — which surface every email and every commitment but prioritize none of it — Quadrant applies the Eisenhower Matrix to unify flagged emails and calendar commitments into one prioritized view that directly answers "what deserves focus now."

## 6. Eisenhower Model

The four-quadrant model is not a feature of the product — per DEC-002, unified Eisenhower triage across email and calendar **is** the v1 spine, the one value proposition everything else in v1 exists to serve.

- **Do (Urgent + Important):** The most prominent items on the matrix screen (DEC-010). A task lands here directly (e.g., a flagged, time-critical email) or arrives here automatically: an important Schedule-quadrant task whose deadline has passed auto-promotes to Do by deadline math alone — no AI involved (DEC-010). This auto-promotion is not a one-way lock: the user can manually move the task back to Schedule or reclassify it to any quadrant afterward (DEC-026).
- **Schedule (Important + Not Urgent):** v1 behavior is manual scheduling only — the user manually creates or drags a calendar block from the task onto their calendar (DEC-007). There is no AI slot-suggestion or smart time-blocking engine in v1 (parked, Section 21). Once that calendar block exists, the link does not sync continuously afterward — the current default, pending confirmation, is no propagation back to the task in either direction (see Section 11 and OQ-002). If a Schedule task's deadline passes, it auto-promotes to Do as above (DEC-010).
- **Delegate (Urgent + Not Important):** Lightweight delegation only — a free-text assignee name/email, a follow-up date, and a manual status toggle the task owner sets by hand; no delegate accounts, no notifications to the delegate, no acceptance workflow (DEC-009).
- **Eliminate (Not Urgent + Not Important):** Means archive — soft, reversible, and searchable later. It is explicitly **not** the same as Delete, which is a separate, explicit, manual action (DEC-010).

**Cross-cutting:** Snooze is a distinct defer/re-evaluate-later action available on any task in any quadrant — it is not part of what Eliminate means (DEC-010). Quadrant assignment itself is AI-suggested but always user-approved (DEC-008; see Section 12).

## 7. Task Lifecycle

Derived from the MVP task fields (DEC-011) and the Do/Eliminate mechanics (DEC-010):

1. **Captured / Inbox (unclassified).** A task is created — manually, from a flagged Outlook email, or from a calendar event (DEC-012) — and starts in the Inbox view, not yet assigned to a quadrant (DEC-014).
2. **Classified into a quadrant.** The AI-suggestion module proposes a quadrant; the user approves or adjusts it, or classifies manually (DEC-008).
3. **Scheduled and/or delegated (optional, not mutually exclusive).** A classified task may get a calendar block created for it (DEC-007, DEC-006) and/or delegate fields set (assignee, follow-up date, status toggle — DEC-009).
4. **Ongoing.** A task may auto-promote from Schedule to Do when its deadline passes (DEC-010); this is not a one-way system lock — the user can manually move it back to Schedule or reclassify it to any quadrant afterward (DEC-026). A task may also be Snoozed at any point to defer re-evaluation without changing its quadrant (DEC-010).
5. **Terminal state.** A task ends as **Completed**, **Archived** (the meaning of Eliminate — soft and reversible, DEC-010), or explicitly, manually **Deleted** (a separate action from Archive, DEC-010).

## 8. Outlook Integration Model

- **Capture, not sync:** flagged Outlook email is capture-only. The platform never writes back to the Outlook flag (DEC-003) — this avoids mailbox-mutation risk and the need for a conflict-resolution engine.
- **One-time snapshot:** at the moment of capture, the task becomes a fully independent copy of the relevant email content. There is no ongoing read-sync of the source email afterward (DEC-004). Consequently, removing the flag later has no effect on the task — there is nothing left to watch (DEC-005).
- **Read mechanism:** the flag is read directly off the mail message via Microsoft Graph's `followupFlag` property. This deliberately does not sync through Microsoft To Do — Outlook already surfaces flagged email in To Do's built-in "Flagged email" list for free, and going direct to Graph avoids a second API surface and avoids inheriting To Do's own task semantics. The Eisenhower layer is this product's entire value-add on top (DEC-013).
- **No deadline inference:** deadlines are manual entry only in v1 — there is no NLP or text-parsing of email bodies to infer a deadline such as "by Friday" (DEC-017).
- **Scope:** the mail OAuth scope is read-only — a direct consequence of never writing to a flag (DEC-020).
- **Duplicate prevention:** a task is deduped by source id permanently. If a task already exists for a given email, it is never recreated, even if that task was later archived or completed (DEC-021).
- **Token health:** if the Outlook token expires or is revoked, existing tasks are untouched, new capture pauses, and the user sees an explicit "reconnect Outlook" prompt — never a silent failure (DEC-023).

## 9. Google Calendar Integration Model

- **Two one-way flows only:** a task can create a calendar event, and a calendar event can become a task. There is no continuous bidirectional sync of the same linked object after creation, and no conflict-resolution engine (DEC-006).
- **Open point — propagation:** an earlier draft considered one narrow exception (a linked event's time change propagating back to the task's scheduled date), but Product Owner confirmation did not clearly cover that nuance. **This document does not assert that exception as decided.** The current default assumption, pending confirmation, is **no propagation in either direction** after creation. See Open Question OQ-002 (Section 20).
- **Scope:** the calendar OAuth scope is read-write, needed to create events from tasks (DEC-020).
- **Externally-canceled event:** if a calendar event that a task created is deleted or canceled directly in Google Calendar, the task itself is not deleted — its scheduled date clears, its quadrant is unaffected, and it shows a "scheduling removed" indicator. No silent data loss (DEC-022).
- **Token health:** if the Google token expires or is revoked, existing tasks are untouched, new capture pauses, and the user sees an explicit "reconnect Google" prompt — never a silent failure (DEC-023).

Nothing Google-specific is decided beyond what the decisions above already state generically for "calendar" — no Google-only behavior is introduced here.

## 10. Outlook Calendar Integration Model

Outlook Calendar follows the identical model described in Section 9 for Google Calendar: two one-way flows only, no continuous bidirectional sync, the same open propagation question (OQ-002), read-write calendar scope (DEC-020), the same externally-canceled-event handling (DEC-022), and the same token-expiry handling (DEC-023). None of the approved decisions (DEC-006, DEC-020, DEC-022, DEC-023) distinguish between calendar providers — they are written generically as "calendar" — so no Outlook-specific behavior is introduced here either.

## 11. Synchronization Rules

What talks to what, and what doesn't:

- **Outlook mail → Quadrant:** one-way, capture-only. A flagged email produces a one-time, independent task snapshot. Nothing flows back to the mailbox — the platform never writes to the flag (DEC-003, DEC-004, DEC-005).
- **Task → Calendar:** one-way. A task can create a calendar event (DEC-006).
- **Calendar → Task:** one-way. A calendar event can become a task (DEC-006).
- **No continuous bidirectional sync** of a linked task/event pair after creation, and no conflict-resolution engine (DEC-006). **Open point:** whether a linked event's time change ever propagates back to the task's scheduled date is unconfirmed; the default assumption used throughout this document is **no propagation in either direction** (see OQ-002, and Sections 6, 9, 10).
- **Disconnecting an integration** (Outlook or Google) stops new capture only. All existing tasks and their previously captured snapshots remain untouched (DEC-018).
- **Duplicate prevention** is permanent: a task is deduped by source id and is never recreated for a source that already produced one, even if that task was later archived or completed (DEC-021).
- **An externally canceled linked calendar event** does not delete the task: the task stays, its scheduled date clears, its quadrant is unaffected, and it shows a "scheduling removed" indicator (DEC-022).
- **An expired or revoked integration token** never fails silently: existing tasks stay untouched, new capture pauses, and the user is explicitly prompted to reconnect (DEC-023).

## 12. AI Opportunities

**In MVP:** the only AI capability in v1 is Eisenhower quadrant suggestion — the AI proposes importance/urgency classification, and the user must approve it. The AI never auto-applies a classification silently (DEC-008).

**Explicitly not in v1, and why:**
- NLP/text-parsing of email bodies to infer a deadline (e.g., "by Friday") — deadlines are manual entry only in v1 (DEC-017).
- Daily-planning assistant, natural-language capture, and meeting-transcription-to-tasks — all parked; the v1 wedge is triage, not a general AI assistant (DEC-024, consistent with DEC-002).
- AI-driven time-blocking / smart slot suggestion for the Schedule quadrant — v1 scheduling is manual only (DEC-007; also listed in the Idea Parking Lot, Section 21).

## 13. Core Domain Concepts

This is a conceptual sketch to support shared understanding — **not** a data model or schema. Field types, storage, and relationships are implementation-stage concerns for a later technical spec.

- **Task:** the central entity. Conceptually carries: title, description, source, source-reference id, Eisenhower quadrant, importance, urgency, deadline, scheduled date, status, delegate fields (assignee, follow-up date, status toggle), and tags (DEC-011).
- **ExternalAccount / Integration Connection:** represents one connected Microsoft identity and/or one connected Google identity (DEC-015) and the state needed to know whether that connection is healthy or needs reconnecting (DEC-023).
- **EmailReference:** the one-time, independent snapshot captured from a flagged Outlook email at capture time (DEC-004) — a copy, not a live link back to the mailbox.
- **CalendarEvent reference:** represents the one-way link created when a task produces a calendar event, or when a calendar event produces a task (DEC-006) — not a continuously synced object.
- **Delegate:** not a separate account or entity. It is just a set of fields carried on a Task — assignee name/email, follow-up date, status toggle (DEC-009) — because no real delegate identities exist in an individual-only v1 product.

**Projects and Context (v1: none).** Project/category was deferred to Future (DEC-011), so v1 has no project or context grouping concept at all. Tasks are flat in v1 — organized only by Eisenhower quadrant and tags.

## 14. Security Considerations

Kept at product level — no encryption algorithms, no implementation-level security mechanics.

- **Least-privilege scope split:** mail access is read-only; calendar access is read-write. This is a direct, low-controversy consequence of the platform never writing to a flag while still needing to create events from tasks — not an independent design choice (DEC-020, following from DEC-003/DEC-004/DEC-006).
- **No silent auth failure:** an expired or revoked token never fails quietly. Existing tasks remain untouched, new capture pauses, and the user is explicitly told to reconnect (DEC-023).
- **Reduced blast radius:** only one Microsoft identity and one Google identity can be connected at a time in v1, which limits the exposure of a single compromised or misconfigured connection (DEC-015).
- **Retention on disconnect:** disconnecting an integration does not purge anything — all existing tasks and previously captured snapshots remain untouched; only new capture stops (DEC-018).

## 15. MVP Scope

Built directly from the MVP capture entry points (DEC-012), the MVP task field set (DEC-011), and every other decision recorded above as v1 behavior.

**Must Have**
- Manual task creation (DEC-012).
- Outlook flagged-email capture as a one-time snapshot, read directly via Microsoft Graph's `followupFlag` (DEC-012, DEC-013, DEC-004).
- Calendar event becoming a task, and a task creating a calendar event — the two one-way flows (DEC-012, DEC-006).
- The MVP task field set: title, description, source, source-reference id, Eisenhower quadrant, importance, urgency, deadline, scheduled date, status, delegate fields, tags (DEC-011).
- AI-suggested Eisenhower quadrant classification with mandatory user approval (DEC-008).
- Matrix-first home screen (four quadrants) with a lighter Inbox view for unclassified items (DEC-014).
- Do-quadrant prominence, deadline-based auto-promotion from Schedule to Do, Eliminate-as-archive (soft/reversible), Delete as a separate explicit action, and Snooze as a cross-quadrant defer action (DEC-010).
- Lightweight delegation fields: free-text assignee, follow-up date, manual status toggle (DEC-009).
- One connected Microsoft identity and one connected Google identity (DEC-015).
- Deadline/follow-up reminders, both in-app and via an email digest — both channels are committed for v1, not just in-app (DEC-016, DEC-025).
- Read-only mail scope, read-write calendar scope (DEC-020).
- Permanent duplicate prevention by source id (DEC-021).
- "Scheduling removed" indicator when a linked calendar event is externally canceled (DEC-022).
- Explicit reconnect prompt on token expiry/revocation, with existing data left untouched (DEC-023).
- Flat task organization by quadrant and tags only — no project/context grouping in v1 (derived from DEC-011).

**Should Have**
- None. The one former candidate here — an email digest of reminders — was resolved to a firm Must Have commitment (DEC-025) rather than staying optional; see Section 20, OQ-005.

**Could Have**
- None identified. The approved decisions draw a firm line between what's in the v1 wedge (Must/Should above) and what's deferred (Section 16) or parked (Section 21) — there is nothing sitting in between.

**Won't Have (v1)** — decided against for v1 for stated product reasons, not merely deferred:
- No write-back to the Outlook flag, ever (DEC-003).
- No NLP/text-parsing deadline extraction from email bodies (DEC-017).
- No productivity metrics/analytics dashboard at launch (DEC-019).
- No push notifications, no Teams/Slack notification channel (DEC-016).
- No AI auto-apply of quadrant classification without user approval (DEC-008).
- No continuous bidirectional calendar sync and no conflict-resolution engine (DEC-006).
- No AI slot-suggestion/smart time-blocking for the Schedule quadrant (DEC-007).

See Section 16 (Future Scope) and Section 21 (Idea Parking Lot) for capabilities deferred or parked rather than decided against outright.

## 16. Future Scope

Explicitly deferred, not part of v1:
- Project/category grouping for tasks (DEC-011).
- Estimated effort and actual effort fields (DEC-011).
- Recurrence (DEC-011).
- Dependencies between tasks (DEC-011).
- Parent task / subtasks (DEC-011).
- Multiple mailboxes/calendars of the same provider — e.g., personal + corporate Outlook (DEC-015).
- Organization / multi-tenant support (DEC-001).

## 17. Integration Boundaries

Restated at a responsibility level only — no technology or framework names, consistent with the modular-monolith shape in Section 22.

- **Core/Domain:** owns the Task entity, its Eisenhower classification state, its lifecycle and status rules (including deadline-based auto-promotion), and tags. This is the system of record for tasks and the home of the triage wedge itself.
- **Integration Adapters (Outlook adapter, Google adapter):** translate between each external provider's data shape and the Core/Domain's task and event concepts; own provider-specific read (and, for calendar, write) operations and each provider's OAuth scope handling.
- **Capture/Sync engine:** owns the polling loop that periodically checks each connected provider for changes and turns what it finds into capture events that Core/Domain converts into new tasks or task updates.
- **Notifications:** owns delivery of deadline/follow-up reminders, both in-app and via email digest. Does not own capture or classification logic.
- **AI-suggestion module:** owns generating an Eisenhower quadrant suggestion for a task and presenting it for approval. It has no authority to write a final classification on its own.

## 18. Edge Case Register

| Scenario | Expected Behavior | Source Decision |
|---|---|---|
| The source email's flag is removed after the task was already captured | No effect on the task — it is already an independent, one-time snapshot | DEC-004, DEC-005 |
| User disconnects Outlook or Google | New capture stops; all existing tasks and previously captured snapshots remain untouched | DEC-018 |
| A capture event would recreate a task for a source that already produced one (even if that task was later archived or completed) | No duplicate is created; dedupe by source id is permanent; the user reopens the existing task | DEC-021 |
| A calendar event that a task created is deleted or canceled directly in Google/Outlook | The task is not deleted; its scheduled date clears; its quadrant is unaffected; it shows a "scheduling removed" indicator | DEC-022 |
| An integration token expires or is revoked | Existing tasks remain untouched; new capture pauses; the user sees an explicit "reconnect Outlook/Google" prompt — never a silent failure | DEC-023 |

## 19. Decision Log

All decisions below were explicitly approved by the Product Owner in a live Q&A. IDs are renumbered sequentially from the session record (DEC-001–DEC-026) so there are no gaps or duplicate IDs in this document. DEC-025 and DEC-026 were added in a follow-up review round that resolved two Open Questions (OQ-005 and OQ-006, kept below as resolved rows — see Section 20).

| ID | Topic | Decision | Reason | Status |
|---|---|---|---|---|
| DEC-001 | Audience | Individual power-user product for v1, not organization/multi-tenant | Simpler authentication/security/delegation surface; multi-tenant deferred | Approved |
| DEC-002 | Core wedge | Unified Eisenhower triage across email + calendar is the v1 spine — the one value proposition v1 is built around | Everything else (deep AI, scheduling automation, delegation depth) is v2+ unless the triage wedge needs it | Approved |
| DEC-003 | Email sync philosophy | Outlook flagged email is capture-only; the platform never writes back to the Outlook flag | Avoids mailbox-mutation risk and a conflict-resolution engine | Approved |
| DEC-004 | Email capture depth | One-time snapshot at capture — the task is a fully independent copy from creation; no ongoing read-sync of the source email | Keeps captured tasks stable and independent of the mailbox | Approved |
| DEC-005 | Flag removed after capture | No effect on the task | Consistent with the one-time-snapshot model — there is nothing left to watch | Approved |
| DEC-006 | Calendar sync philosophy | Two independent one-way flows only: a task can create a calendar event, and a calendar event can become a task; no continuous bidirectional sync of the same linked object after creation, and no conflict-resolution engine | Keeps calendar integration simple and avoids building sync-conflict handling before it's needed | Approved |
| DEC-007 | Schedule quadrant v1 behavior | Manual scheduling only — the user manually creates/drags a calendar block from a task; no AI slot-suggestion / smart time-blocking engine in v1 | Keeps v1 focused on the triage wedge; smart scheduling is parked | Approved |
| DEC-008 | AI role in v1 | AI suggests the Eisenhower quadrant; the user must approve — AI never auto-applies a classification silently | Keeps the user in control of prioritization decisions | Approved |
| DEC-009 | Delegation model | Lightweight only: free-text assignee name/email, a follow-up date, and a manual status toggle the task owner sets by hand; no delegate accounts, notifications, or acceptance workflow | No real identities exist in an individual-only v1 product | Approved |
| DEC-010 | Do + Eliminate mechanics | Do-quadrant tasks are most prominent on the matrix screen; an overdue Schedule task auto-promotes to Do by deadline math alone (no AI); Eliminate means archive (soft, reversible, searchable); Delete is a separate explicit manual action; Snooze is a distinct defer action available on any quadrant | Keeps urgent/important handling predictable and keeps destructive actions explicit and reversible where possible | Approved |
| DEC-011 | Task Model, MVP field set | title, description, source, source-reference id, Eisenhower quadrant, importance, urgency, deadline, scheduled date, status, delegate fields, tags; project/category, estimated/actual effort, recurrence, dependencies, and parent/subtasks deferred to Future | Keeps the MVP task model minimal and tied to the triage wedge | Approved |
| DEC-012 | MVP capture entry points | Manual creation, Outlook flagged email, calendar event becoming a task; all other entry points (Teams, Slack, voice, browser extension, mobile app, API/webhook) are parked | Keeps capture surface minimal for v1 | Approved |
| DEC-013 | Outlook integration approach | Read the flag directly off the mail message via Microsoft Graph's `followupFlag` property; does not sync through Microsoft To Do | Avoids a second API surface and avoids inheriting To Do's own task semantics; the Eisenhower layer is the product's entire value-add on top | Approved |
| DEC-014 | Primary home screen | Matrix-first — the four quadrants are the default landing view, with a lighter Inbox view feeding newly captured, unclassified items into it | Today-first, Calendar-first, Inbox-first, and AI-assistant-first were rejected as burying the actual differentiator | Approved |
| DEC-015 | Identity scope | One Microsoft identity + one Google identity connected at a time in v1; multiple mailboxes/calendars of the same provider deferred | Keeps the v1 connection model simple | Approved |
| DEC-016 | Notifications v1 | Deadline/follow-up reminders only, in-app and via email digest (see DEC-025); no push notifications, no Teams/Slack notification channel | Keeps notification scope minimal for v1 | Approved |
| DEC-017 | Deadline extraction from email text | Manual entry only in v1; no NLP/text-parsing of email bodies to infer a deadline | Keeps v1 scope free of NLP complexity | Approved |
| DEC-018 | Disconnect behavior | Disconnecting Outlook or Google stops new capture only; all existing tasks and their captured snapshots remain untouched | Consistent with the one-time-snapshot model (DEC-004) | Approved |
| DEC-019 | Metrics/analytics | Fully parked for v1 — no productivity metrics dashboard at launch | Keeps v1 scope focused on the triage wedge | Approved |
| DEC-020 | OAuth scope shape | Mail scope is read-only; calendar scope is read-write (needed to create events from tasks) | Direct, low-controversy consequence of DEC-003/DEC-004/DEC-006, not an independent design choice | Approved |
| DEC-021 | Duplicate prevention | Dedupe by source id, permanently — a task is never recreated for a source that already has one, even if that task was later archived or completed | Prevents duplicate tasks from reappearing; the user reopens the existing task instead | Approved |
| DEC-022 | Externally-canceled linked calendar event | If a calendar event a task created is deleted/canceled directly in Google/Outlook, the task stays; its scheduled date clears; its quadrant is unaffected; it shows a "scheduling removed" indicator | Avoids silent data loss | Approved |
| DEC-023 | Integration token expired/revoked | Existing tasks remain untouched; new capture pauses; the user sees an explicit "reconnect Outlook/Google" prompt | Avoids silent failure | Approved |
| DEC-024 | Remaining AI ideas parked for v1 | Daily-planning assistant, natural-language capture, and meeting-transcription-to-tasks are all parked, not MVP | Consistent with DEC-002 — the wedge is triage, not an AI assistant | Approved |
| DEC-025 | Notification channels v1 (resolves OQ-005) | Both in-app reminders and an email digest of deadline/follow-up reminders are committed for v1, not just in-app | PO confirmation resolving the ambiguity in DEC-016's original wording | Approved |
| DEC-026 | Auto-promotion reversibility (resolves OQ-006) | A task auto-promoted from Schedule to Do can be manually moved back to Schedule or reclassified to any quadrant — the auto-promotion is not one-directional or system-locked | PO confirmation resolving the gap in DEC-010's original wording | Approved |

## 20. Open Questions

OQ-005 and OQ-006 have since been resolved by the Product Owner (see DEC-025 and DEC-026 in Section 19) and are kept below, with their row numbering intact, for traceability. The remaining items are still genuinely open and should not be read as Approved.

| ID | Open Question | Context / Why It Matters | Current Default (pending confirmation) |
|---|---|---|---|
| OQ-001 | The product name is not decided | "Quadrant" is a working title used throughout this document purely for readability | No default — placeholder only |
| OQ-002 | Does a linked calendar event's time change ever propagate back to update the task's scheduled date (one direction, calendar wins), or is the link fully severed with zero propagation after creation? | An earlier draft floated the one-direction exception, but Product Owner confirmation did not clearly cover it | Fully severed — zero propagation in either direction after creation |
| OQ-003 | Exact Microsoft Graph / Google Calendar polling interval and per-platform rate-limit behavior | Deliberately not researched at this Discovery stage | None — deferred to each integration's own technical spec |
| OQ-004 | Is a personal (non-corporate) Microsoft account sufficient for the Graph permissions needed, or do corporate-tenant admin-consent edge cases need handling even in an individual-only product? | Not yet investigated | None |
| OQ-005 | Resolved — see DEC-025 | — | — |
| OQ-006 | Resolved — see DEC-026 | — | — |

## 21. Idea Parking Lot

- Teams integration
- Slack integration
- Voice capture
- Browser extension
- Mobile app
- API/webhook capture
- Daily-planning assistant
- Natural-language capture
- Meeting-transcription-to-tasks
- AI-driven time-blocking/smart slot suggestion (Quadrant 2 automation)
- Multiple mailboxes/calendars of the same provider
- Organization/multi-tenant support

## 22. Initial High-Level Architecture Hypothesis

Two architecture approaches were approved by the Product Owner. No technology or framework names are specified at this stage — that is deferred to each sub-project's own technical spec (see Section 24).

**System shape: modular monolith.** One deployable backend with internal module boundaries: Core/Domain, Integration Adapters (Outlook adapter, Google adapter), Capture/Sync engine, Notifications, and a thin AI-suggestion module (see Section 17).

*Considered and rejected:*
- A separate service per integration — unneeded operational overhead for a single-tenant individual product.
- Serverless functions per trigger — cold-start and orchestration complexity not justified yet.

**Capture mechanism: polling.** The backend periodically asks Microsoft Graph and the Google Calendar API "anything changed" on an interval; a few minutes of latency is acceptable for this product's use case.

*Considered and rejected for v1:*
- Event-driven webhooks/push-notification subscriptions — real infrastructure (a public HTTPS receiver, a validation handshake, subscription renewal) not justified before there is a validated user base.
- A webhook+polling hybrid — the most robust option and the most complex; appropriate later once real usage justifies it.

Exact per-platform subscription/webhook mechanics were deliberately not researched at this stage. That research happens when the Outlook and Google integration sub-projects get their own technical specs.

## 23. Risks and Technical Unknowns

- Exact Microsoft Graph / Google Calendar API polling limits and interval tuning are unknown until each integration's own technical spec is written.
- Personal-vs-corporate Microsoft account and admin-consent edge cases have not yet been investigated (OQ-004).
- The single-identity-per-provider assumption (DEC-015) may not hold if the product later needs multi-mailbox support (already noted as deferred in Section 16 and parked in Section 21); revisiting it could touch both the Core/Domain and Integration Adapter boundaries.
- The unconfirmed calendar-propagation nuance (OQ-002) could change the Synchronization Rules (Section 11) — and the corresponding statements in Sections 6, 9, and 10 — if the Product Owner later confirms the one-direction exception.
- Polling-based capture means a few minutes of latency is inherent by design (Section 22); if real usage shows users expect near-real-time capture, that would revisit the capture-mechanism decision itself, not just its interval tuning.
- The AI-suggestion module's interaction model is fixed (suggest, then require approval — DEC-008), but its actual suggestion quality is untested; how good the suggestions need to be to feel useful is a validation risk for the later technical spec, not something this Discovery stage can answer.

## 24. Recommended Next Step

1. This Discovery Summary has been reviewed and approved by the Product Owner (see Status, above).
2. Next: decompose the work into separate technical specs per sub-project — Core engine + matrix, Outlook email integration, and Calendar integration.
3. The Core engine spec goes first, since every other sub-project depends on it per the modular-monolith boundaries in Section 17.
4. Each sub-project spec goes through its own design-approval cycle before any implementation planning begins.

Implementation should not start directly from this document.
