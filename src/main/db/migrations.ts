import { Kysely, sql } from 'kysely'
import type { DB } from './schema'

interface Migration {
  name: string
  up: (db: Kysely<DB>) => Promise<void>
}

// Migrations run in declared order; each runs once and is tracked in
// migrations_applied. Add new migrations to the end of this list — never
// rewrite history once a migration has shipped.
const migrations: Migration[] = [
  {
    name: '0001_initial',
    up: async (db) => {
      await db.schema
        .createTable('contexts')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('is_recurring', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('created_at', 'integer', (col) => col.notNull())
        .execute()

      await db.schema
        .createTable('session')
        .addColumn('id', 'integer', (col) =>
          col.primaryKey().check(sql`id = 1`)
        )
        .addColumn('active_context_id', 'text', (col) =>
          col.references('contexts.id').onDelete('set null')
        )
        .addColumn('active_started_at_ms', 'integer')
        .addColumn('session_date', 'text', (col) => col.notNull())
        .execute()

      await db.schema
        .createTable('today_seconds')
        .addColumn('context_id', 'text', (col) =>
          col.primaryKey().references('contexts.id').onDelete('cascade')
        )
        .addColumn('seconds', 'integer', (col) => col.notNull().defaultTo(0))
        .execute()

      await db.schema
        .createTable('daily_logs')
        .addColumn('date', 'text', (col) => col.notNull())
        .addColumn('context_name', 'text', (col) => col.notNull())
        .addColumn('duration_seconds', 'integer', (col) => col.notNull())
        .addColumn('context_id', 'text', (col) =>
          col.references('contexts.id').onDelete('set null')
        )
        .addColumn('created_at', 'integer', (col) => col.notNull())
        .addPrimaryKeyConstraint('daily_logs_pk', ['date', 'context_name'])
        .execute()

      await db.schema
        .createIndex('daily_logs_date_idx')
        .on('daily_logs')
        .column('date')
        .execute()
    }
  }
]

export async function runMigrations(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable('migrations_applied')
    .ifNotExists()
    .addColumn('name', 'text', (col) => col.primaryKey())
    .addColumn('applied_at', 'integer', (col) => col.notNull())
    .execute()

  const applied = await db
    .selectFrom('migrations_applied')
    .select('name')
    .execute()
  const appliedNames = new Set(applied.map((r) => r.name))

  for (const m of migrations) {
    if (appliedNames.has(m.name)) continue
    await m.up(db)
    await db
      .insertInto('migrations_applied')
      .values({ name: m.name, applied_at: Date.now() })
      .execute()
  }
}
