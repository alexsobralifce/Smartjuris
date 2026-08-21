import { type CSSProperties, type ReactNode } from 'react'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { SPACE } from './tokens'

/** Grade de formulário: 1 coluna no mobile (≤640) e 2 colunas no tablet+ (≥641). */
export function FormGrid({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const breakpoint = useBreakpoint()
  const gridTemplateColumns = breakpoint === 'mobile' ? '1fr' : '1fr 1fr'
  return (
    <div style={{ display: 'grid', gridTemplateColumns, gap: SPACE.md, ...style }}>
      {children}
    </div>
  )
}

/** Campo/linha da grade; `span` = true ocupa as duas colunas (full-width). */
export function FormRow({ children, span = false, style }: { children?: ReactNode; span?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined, ...style }}>
      {children}
    </div>
  )
}
