import { openDB } from 'idb'

const DB_NAME = 'ticketscan-offline'
const STORE_NAME = 'scanQueue'

const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true })
    }
  },
})

export async function enqueueAction(action) {
  const db = await dbPromise
  await db.add(STORE_NAME, {
    ...action,
    queuedAt: new Date().toISOString(),
  })
}

export async function getQueuedActions() {
  const db = await dbPromise
  return db.getAll(STORE_NAME)
}

export async function removeQueuedAction(id) {
  const db = await dbPromise
  await db.delete(STORE_NAME, id)
}
