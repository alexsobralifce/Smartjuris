import { type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { FONT, RADIUS, SPACE } from './tokens'

/** Cartão que envolve uma tabela; adiciona scroll horizontal no mobile. */
export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: RADIUS.card,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  )
}

export function Table({ children }: { children: ReactNode }) {
  return <table style={{ width: '100%', borderCollapse: 'collapse' }}>{children}</table>
}

/** Linha de cabeçalho — padrão de thead do design system. */
export function THeadRow({ children }: { children: ReactNode }) {
  return <tr style={{ background: 'var(--color-surface-2)' }}>{children}</tr>
}

export function Th({ children, style, ...props }: { children?: ReactNode; style?: CSSProperties; [key: string]: any }) {
  return (
    <th
      style={{
        padding: '12px 18px', textAlign: 'left', fontSize: FONT.xs, fontWeight: 600,
        letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)',
        fontFamily: 'var(--font-mono)', ...style,
      }}
      {...props}
    >
      {children}
    </th>
  )
}

export function Tr({ children, style, onClick, selected = false }: {
  children: ReactNode
  style?: CSSProperties
  onClick?: (event: MouseEvent<HTMLTableRowElement>) => void
  selected?: boolean
}) {
  return (
    <tr
      style={{
        borderTop: '1px solid var(--color-border)',
        background: selected ? 'var(--color-badge-tint)' : 'transparent',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'background 0.1s',
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--color-surface-2)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </tr>
  )
}

export function Td({ children, style, ...props }: { children?: ReactNode; style?: CSSProperties; [key: string]: any }) {
  return <td style={{ padding: '14px 18px', fontSize: FONT.md, ...style }} {...props}>{children}</td>
}

export function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: SPACE.xxl, textAlign: 'center', color: 'var(--color-muted)', fontSize: FONT.md }}>
        {message}
      </td>
    </tr>
  )
}
