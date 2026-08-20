import { type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import { FONT, RADIUS } from './tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'
type ButtonType = 'button' | 'submit' | 'reset'

interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: ButtonType
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  children: ReactNode
  title?: string
  style?: CSSProperties
  ariaLabel?: string
}

const variantStyles: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none' },
  secondary: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-foreground)' },
  ghost: { background: 'transparent', border: 'none', color: 'var(--color-muted)' },
  danger: { background: 'var(--color-danger)', color: 'var(--color-on-primary)', border: 'none' },
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '7px 14px', fontSize: FONT.base },
  md: { padding: '9px 18px', fontSize: FONT.md },
}

export function Button({
  variant = 'primary', size = 'md', type = 'button', onClick,
  disabled = false, children, title, style, ariaLabel,
}: ButtonProps) {
  const isMobile = useIsMobile()

  // Sem texto visível ⇒ botão só de ícone, ganha min-width 44 no mobile.
  const hasTextLabel = typeof children === 'string' && children.trim().length > 0

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: RADIUS.control,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    ...variantStyles[variant],
    ...sizeStyles[size],
  }

  if (isMobile) {
    base.minHeight = 44
    if (!hasTextLabel) base.minWidth = 44
  }

  const hoverHandlers = variant === 'primary' && !disabled
    ? {
        onMouseEnter: (event: MouseEvent<HTMLButtonElement>) => {
          event.currentTarget.style.background = 'var(--color-primary-hover)'
        },
        onMouseLeave: (event: MouseEvent<HTMLButtonElement>) => {
          event.currentTarget.style.background = 'var(--color-primary)'
        },
      }
    : {}

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{ ...base, ...style }}
      {...hoverHandlers}
    >
      {children}
    </button>
  )
}
