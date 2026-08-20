import { type ReactNode } from 'react'
import { FONT, SPACE } from './tokens'

export function Field({ label, error, children, required = false }: {
  label: string
  error?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label style={{
        fontSize: FONT.sm, fontWeight: 600,
        color: error ? 'var(--color-danger)' : 'var(--color-muted)',
        display: 'block', marginBottom: SPACE.xs,
      }}>
        {label}{required ? ' *' : ''}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: FONT.sm, color: 'var(--color-danger)', marginTop: 2, display: 'block' }}>
          ⚠️ {error}
        </span>
      )}
    </div>
  )
}
