import { FONT, SPACE } from './tokens'

export function Loading({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: SPACE.pageY, color: 'var(--color-muted)', fontSize: FONT.md }}>
      {message}
    </div>
  )
}
