import { type CSSProperties, type ReactNode } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { LAYOUT, SPACE } from './tokens'

export function PageContainer({ children, style }: {
  children: ReactNode
  style?: CSSProperties
}) {
  const isMobile = useIsMobile()

  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        maxWidth: LAYOUT.pageMaxW,
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
