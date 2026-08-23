import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createPool } from '../../../src/adapters/postgres/db.js';
import { createTask } from '../../../src/domain/task.js';
import { createTaskEvent } from '../../../src/domain/taskEvent.js';
import { PgTaskRepository } from '../../../src/adapters/postgres/PgTaskRepository.js';
import { PgTaskEventRepository } from '../../../src/adapters/postgres/PgTaskEventRepository.js';

const connectionString = process.env.CORE_PG_URL;
const describeIfPg = connectionString ? describe : describe.skip;

describeIfPg('PgTaskEventRepository (integration)', () => {
  let pool: Pool;
  let taskRepo: PgTaskRepository;
  let eventRepo: PgTaskEventRepository;

  beforeAll(async () => {
    pool = createPool(connectionString!);
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

  test('isolates events between tasks', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const taskA = createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, now);
    const taskB = createTask({ title: 'B', description: '', source: 'manual', sourceRefId: null }, now);
    await taskRepo.save(taskA);
    await taskRepo.save(taskB);

    await eventRepo.append(createTaskEvent(taskA.id, 'capture', null, {}, now));
    await eventRepo.append(createTaskEvent(taskB.id, 'capture', null, {}, now));
    await eventRepo.append(createTaskEvent(taskB.id, 'status_transition', 'Open', 'Scheduled', now));

    const eventsA = await eventRepo.findByTaskId(taskA.id);
    const eventsB = await eventRepo.findByTaskId(taskB.id);
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0].taskId).toBe(taskA.id);
    expect(eventsB).toHaveLength(2);
    expect(eventsB.every((e) => e.taskId === taskB.id)).toBe(true);
  });
});
