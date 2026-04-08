import { useEffect, useState } from 'react'

export default function TeamTimer({ outAt, maxBreak = 30, grace = 5 }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!outAt) return

    const tick = () => {
      const outDate = new Date(outAt)
      const now = new Date()
      const diffMs = now - outDate
      setElapsed(Math.floor(diffMs / 60000)) // minutes
    }

    tick()
    const timer = setInterval(tick, 30000) // update every 30s
    return () => clearInterval(timer)
  }, [outAt])

  if (!outAt) return <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>-</span>

  const totalAllowed = maxBreak + grace
  const isOverdue = elapsed > totalAllowed
  const isPending = elapsed > maxBreak && elapsed <= totalAllowed

  let statusColor = '#34d399' // Green (Safe)
  if (isOverdue) statusColor = '#ef4444' // Red (Late)
  else if (isPending) statusColor = '#fbbf24' // Yellow (Grace)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <strong style={{ color: statusColor, fontSize: '1rem', fontWeight: 800 }}>
        {elapsed}m <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.6 }}>out</span>
      </strong>
      <div style={{ 
        width: '100%', 
        height: '4px', 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: '99px',
        overflow: 'hidden',
        marginTop: '2px' 
      }}>
        <div style={{ 
          width: `${Math.min(100, (elapsed / totalAllowed) * 100)}%`, 
          height: '100%', 
          background: statusColor,
          boxShadow: `0 0 8px ${statusColor}44` 
        }} />
      </div>
    </div>
  )
}
