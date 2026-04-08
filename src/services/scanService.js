import { enqueueAction, getQueuedActions, removeQueuedAction } from './offlineQueue'
import { markIn, markOut, markAttendance } from './teamService'

export async function performOut({ teamId, membersOut, actorUid }) {
  if (!navigator.onLine) {
    await enqueueAction({ type: 'OUT', teamId, membersOut, actorUid })
    return { queued: true }
  }

  await markOut(teamId, membersOut, actorUid)
  return { queued: false }
}

export async function performIn({ teamId, actorUid }) {
  if (!navigator.onLine) {
    await enqueueAction({ type: 'IN', teamId, actorUid })
    return { queued: true }
  }

  const result = await markIn(teamId, actorUid)
  return { queued: false, ...result }
}

export async function performAttendance({ teamId, actorUid }) {
  if (!navigator.onLine) {
    await enqueueAction({ type: 'ATTENDANCE', teamId, actorUid })
    return { queued: true }
  }

  await markAttendance(teamId, actorUid)
  return { queued: false }
}

export async function syncOfflineQueue() {
  if (!navigator.onLine) return { synced: 0 }

  const queue = await getQueuedActions()
  let synced = 0

  for (const action of queue) {
    try {
      if (action.type === 'OUT') {
        await markOut(action.teamId, action.membersOut, action.actorUid)
      }
      if (action.type === 'IN') {
        await markIn(action.teamId, action.actorUid)
      }
      if (action.type === 'ATTENDANCE') {
        await markAttendance(action.teamId, action.actorUid)
      }
      await removeQueuedAction(action.id)
      synced += 1
    } catch {
      // Keep failed queued action for retry.
    }
  }

  return { synced }
}
