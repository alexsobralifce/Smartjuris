import { FONT, SPACE } from './tokens'

export function EmptyState({ message, icon }: { message: string; icon?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: SPACE.pageY, color: 'var(--color-muted)', fontSize: FONT.md }}>
      {icon && <div style={{ fontSize: 28, marginBottom: SPACE.sm }}>{icon}</div>}
      <div>{message}</div>
    </div>
  )
}
