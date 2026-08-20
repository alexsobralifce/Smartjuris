import { type ReactNode } from 'react'
import { FONT, SPACE } from './tokens'

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      gap: SPACE.lg, flexWrap: 'wrap',
      borderBottom: '1px solid var(--color-border)', paddingBottom: SPACE.xxl,
    }}>
      <div>
        <div style={{
          fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: SPACE.xs,
        }}>
          {eyebrow}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, margin: 0,
          fontWeight: 400, letterSpacing: '-0.02em',
        }}>
          {title}
        </h1>
        {description && (
          <p style={{ color: 'var(--color-muted)', fontSize: FONT.lg, marginTop: SPACE.xs }}>
            {description}
          </p>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
