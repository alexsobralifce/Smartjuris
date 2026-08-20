import { useEffect, useState } from 'react'

export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

const MOBILE_QUERY = '(max-width: 640px)'
const TABLET_QUERY = '(min-width: 641px) and (max-width: 1024px)'

function resolveBreakpoint(): Breakpoint {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop'
  if (window.matchMedia(MOBILE_QUERY).matches) return 'mobile'
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet'
  return 'desktop'
}

/**
 * Breakpoint responsivo em 3 estados, seguindo a skill `dontMake`:
 * mobile (≤640px), tablet (641–1024px) e desktop (>1024px).
 * Reage a resize/rotação via `matchMedia` (mesmo padrão do `useIsMobile`).
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(resolveBreakpoint)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mobileMq = window.matchMedia(MOBILE_QUERY)
    const tabletMq = window.matchMedia(TABLET_QUERY)
    const update = () => setBreakpoint(resolveBreakpoint())
    update()
    mobileMq.addEventListener('change', update)
    tabletMq.addEventListener('change', update)
    return () => {
      mobileMq.removeEventListener('change', update)
      tabletMq.removeEventListener('change', update)
    }
  }, [])

  return breakpoint
}
