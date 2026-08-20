import { type CSSProperties } from 'react'
import { FONT, RADIUS } from './tokens'

/** Estilo padrão de input/select/textarea do design system. */
export function inputStyle(hasError = false): CSSProperties {
  return {
    width: '100%',
    padding: '9px 12px',
    border: hasError ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
    borderRadius: RADIUS.control,
    fontSize: FONT.md,
    background: 'var(--color-surface)',
    color: 'var(--color-foreground)',
    outline: 'none',
  }
}
