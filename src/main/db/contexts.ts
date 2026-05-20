import { Kysely } from 'kysely'
import { randomUUID } from 'node:crypto'
import type { DB } from './schema'

export interface Context {
  id: string
  name: string
  sortOrder: number
  isRecurring: boolean
  createdAt: number
}

function rowToContext(r: {
  id: string
  name: string
  sort_order: number
  is_recurring: number
  created_at: number
}): Context {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    isRecurring: r.is_recurring === 1,
    createdAt: r.created_at
  }
}

export async function listContexts(db: Kysely<DB>): Promise<Context[]> {
  const rows = await db
    .selectFrom('contexts')
    .selectAll()
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'asc')
    .execute()
  return rows.map(rowToContext)
}

export interface CreateContextInput {
  name: string
  isRecurring: boolean
  sortOrder?: number
}

export async function createContext(
  db: Kysely<DB>,
  input: CreateContextInput
): Promise<Context> {
  const id = randomUUID()
  const now = Date.now()

  // Default sort_order: place at the end of the existing list.
  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const max = await db
      .selectFrom('contexts')
      .select(db.fn.max('sort_order').as('m'))
      .executeTakeFirst()
    sortOrder = (max?.m ?? -1) + 1
  }

  await db
    .insertInto('contexts')
    .values({
      id,
      name: input.name,
      sort_order: sortOrder,
      is_recurring: input.isRecurring ? 1 : 0,
      created_at: now
    })
    .execute()

  return {
    id,
    name: input.name,
    sortOrder,
    isRecurring: input.isRecurring,
    createdAt: now
  }
}

export async function deleteNonRecurring(db: Kysely<DB>): Promise<number> {
  const result = await db
    .deleteFrom('contexts')
    .where('is_recurring', '=', 0)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0)
}
