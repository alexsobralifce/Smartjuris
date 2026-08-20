import { useEffect } from 'react'
import { FONT, RADIUS, Z } from '../ui'

export interface ToastMessage {
  id: string
  type: 'error' | 'success' | 'warning' | 'info'
  text: string
}

interface ToastProps {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: Z.toast,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxWidth: 380,
      width: '100%'
    }}>
      {toasts.map(toast => {
        const bg = toast.type === 'error' ? 'var(--color-danger-light)'
          : toast.type === 'success' ? 'var(--color-success-light)'
          : toast.type === 'warning' ? 'var(--color-warning-light)'
          : 'var(--color-badge-tint)'

        const color = toast.type === 'error' ? 'var(--color-danger)'
          : toast.type === 'success' ? 'var(--color-success)'
          : toast.type === 'warning' ? 'var(--color-warning)'
          : 'var(--color-primary)'

        const icon = toast.type === 'error' ? '⚠️'
          : toast.type === 'success' ? '✅'
          : toast.type === 'warning' ? '⚡'
          : 'ℹ️'

        return (
          <div
            key={toast.id}
            style={{
              background: bg,
              color: color,
              border: `1px solid ${color}`,
              borderRadius: RADIUS.card,
              padding: '12px 16px',
              boxShadow: 'var(--shadow-soft)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: FONT.md,
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.4,
              animation: 'slideIn 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: FONT.xl }}>{icon}</span>
              <div>
                <strong>{toast.type === 'error' ? 'Erro' : toast.type === 'success' ? 'Sucesso' : toast.type === 'warning' ? 'Atenção' : 'Aviso'}</strong>
                <div style={{ marginTop: 2, fontSize: FONT.base }}>{toast.text}</div>
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              style={{ border: 'none', background: 'transparent', color: color, cursor: 'pointer', fontSize: FONT.xl, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
