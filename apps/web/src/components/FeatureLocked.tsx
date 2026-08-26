import { Button, FONT, SPACE } from '../ui'

interface FeatureLockedProps {
  title: string
  description: string
  onNavigateAssinatura: () => void
}

export default function FeatureLocked({ title, description, onNavigateAssinatura }: FeatureLockedProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: SPACE.xxl,
      textAlign: 'center',
    }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: 'var(--color-warning-light)',
        border: '2px solid var(--color-warning)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 36,
        marginBottom: SPACE.xl,
      }}>
        🔒
      </div>

      <h2 style={{
        fontSize: FONT.xl,
        fontWeight: 700,
        color: 'var(--color-foreground)',
        marginBottom: SPACE.sm,
      }}>
        {title}
      </h2>

      <p style={{
        fontSize: FONT.base,
        color: 'var(--color-muted)',
        maxWidth: 480,
        lineHeight: 1.6,
        marginBottom: SPACE.xl,
      }}>
        {description}
      </p>

      <Button onClick={onNavigateAssinatura} size="md" style={{ padding: '13px 22px', fontSize: FONT.md }}>
        Assinar Agora →
      </Button>

      <p style={{
        fontSize: FONT.sm,
        color: 'var(--color-muted)',
        marginTop: SPACE.md,
      }}>
        Recursos avançados do sistema estão limitados para não assinantes.
      </p>
    </div>
  )
}