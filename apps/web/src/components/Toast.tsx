import { useEffect } from 'react'

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
      zIndex: 9999,
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
          : '#eef0f7'

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
              borderRadius: 8,
              padding: '12px 16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.4,
              animation: 'slideIn 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <div>
                <strong>{toast.type === 'error' ? 'Atenção / Campo Pendente' : toast.type === 'success' ? 'Sucesso' : 'Aviso'}</strong>
                <div style={{ marginTop: 2, fontSize: 12 }}>{toast.text}</div>
              </div>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              style={{ border: 'none', background: 'transparent', color: color, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
