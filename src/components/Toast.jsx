import { useEffect } from 'react'

export default function Toast({ message, type = 'info', visible = false, onClose, duration = 3000 }) {
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => onClose && onClose(), duration)
    return () => clearTimeout(t)
  }, [visible, duration, onClose])

  if (!visible) return null

  const bg = type === 'success' ? 'rgba(52, 211, 153, 0.12)' : type === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)'
  const color = type === 'error' ? '#f87171' : type === 'success' ? '#34d399' : '#818cf8'

  return (
    <div style={{ position: 'fixed', right: 16, top: 16, zIndex: 2000 }}>
      <div style={{ minWidth: 220, padding: '12px 16px', borderRadius: 12, background: bg, color: color, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.04)', fontWeight: 700 }}>
        {message}
      </div>
    </div>
  )
}
