import { useEffect, useState } from 'react'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      // Prevent browser from showing default install prompt
      e.preventDefault()
      // Stash event so it can be triggered later
      setDeferredPrompt(e)
      setIsVisible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
       setIsVisible(false)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    
    // Show the install prompt
    deferredPrompt.prompt()
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    console.log(`User response to install prompt: ${outcome}`)
    
    // We've used the prompt, and can't use it again
    setDeferredPrompt(null)
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="login-auth-panel" style={{ 
      marginTop: '24px', 
      padding: '20px', 
      background: 'rgba(99, 102, 241, 0.1)', 
      border: '1px solid rgba(99, 102, 241, 0.3)',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ fontSize: '1.5rem' }}>📱</div>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fff', fontSize: '0.95rem', display: 'block', marginBottom: '4px' }}>Install TicketScan App</strong>
          <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>Add to your home screen for the best experience at the venue.</p>
        </div>
        <button 
          onClick={handleInstallClick} 
          className="login-tab active" 
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
