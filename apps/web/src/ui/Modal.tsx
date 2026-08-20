import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { Button } from './Button'
import { FONT, RADIUS, SPACE, Z } from './tokens'

export function Modal({ open, onClose, title, children, width = 560, footer }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  width?: number
  footer?: ReactNode
}) {
  const isMobile = useIsMobile()

  // Fecha com Esc enquanto aberto.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const cardStyle: CSSProperties = isMobile
    ? {
        background: 'var(--color-surface)',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        padding: SPACE.xl,
      }
    : {
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: RADIUS.modal,
        padding: SPACE.pageY,
        width: `min(${width}px, 92vw)`,
        maxHeight: '90vh',
        overflowY: 'auto',
      }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--color-overlay)', zIndex: Z.modal,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? 0 : SPACE.lg,
      }}
      onClick={onClose}
    >
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xl }}>
          <h3 style={{ margin: 0, fontSize: FONT.cardTitle, fontFamily: 'var(--font-display)', fontWeight: 400 }}>
            {title}
          </h3>
          <Button variant="ghost" ariaLabel="Fechar" onClick={onClose}>×</Button>
        </div>

        {children}

        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.sm, marginTop: SPACE.xxl }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
