import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 640px)'

/**
 * Retorna `true` quando a viewport está no breakpoint mobile (≤ 640px).
 * Reage a redimensionamento/rotação via `matchMedia`.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isMobile
}
