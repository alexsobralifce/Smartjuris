import { type CSSProperties, type ReactNode } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { SPACE } from './tokens'

const PAGE_MAX_WIDTH = 1150

export function PageContainer({ children, style }: {
  children: ReactNode
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()

  return (
    <div
      style={{
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: isMobile
          ? `${SPACE.xxl}px ${SPACE.lg}px`
          : `${SPACE.pageY}px ${SPACE.pageX}px`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
