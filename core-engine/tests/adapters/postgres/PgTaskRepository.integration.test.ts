import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { createPool } from '../../../src/adapters/postgres/db.js';
import { createTask } from '../../../src/domain/task.js';
import { PgTaskRepository } from '../../../src/adapters/postgres/PgTaskRepository.js';

const connectionString = process.env.CORE_PG_URL;
const describeIfPg = connectionString ? describe : describe.skip;

describeIfPg('PgTaskRepository (integration)', () => {
  let pool: Pool;
  let repo: PgTaskRepository;

  beforeAll(async () => {
    pool = createPool(connectionString!);
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

  test('round-trips emailSnapshot and tags as jsonb', async () => {
    const task = {
      ...createTask({ title: 'A', description: '', source: 'manual', sourceRefId: null }, new Date('2026-01-01T00:00:00Z')),
      emailSnapshot: { sender: 'a@b.c', subject: 'S' },
      tags: ['x', 'y'],
    };
    await repo.save(task);
    const found = await repo.findById(task.id);
    expect(found?.emailSnapshot).toEqual({ sender: 'a@b.c', subject: 'S' });
    expect(found?.tags).toEqual(['x', 'y']);
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
