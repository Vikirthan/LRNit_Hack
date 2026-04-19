import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function QrScanner({ onDecoded }) {
  const containerId = useRef(`qr-${Math.random().toString(36).slice(2)}`)
  const scannerRef = useRef(null)
  const lastHapticAtRef = useRef(0)

  const onDecodedRef = useRef(onDecoded)
  onDecodedRef.current = onDecoded

  useEffect(() => {
    let mounted = true

    async function start() {
      scannerRef.current = new Html5Qrcode(containerId.current)

      try {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            const now = Date.now()
            if (now - lastHapticAtRef.current > 800 && 'vibrate' in navigator) {
              navigator.vibrate(35)
              lastHapticAtRef.current = now
            }
            onDecodedRef.current(decodedText)
          },
          () => undefined,
        )
      } catch {
        // Camera permission and device support vary across devices.
      }
    }

    if (mounted) start()

    return () => {
      mounted = false
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => undefined)
      }
    }
  }, [])

  return <div id={containerId.current} className="scanner-box" />
}
