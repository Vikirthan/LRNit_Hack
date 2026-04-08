import { useEffect, useState } from 'react'

export default function OnlineIndicator() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)

    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  return <div className={`status-pill ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline (queueing scans)'}</div>
}
