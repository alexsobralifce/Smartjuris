import { useEffect } from 'react'
import { FONT, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'
import contatoImg from '../assets/contato-negocio.webp'

const LEAD_SRC = 'https://api-production-9390.up.railway.app/lead.js'
const SISTEMA_ID = 'b0ad54b6-a907-4106-8335-47511cc60853'
const CHAVE = 'b018ba9cdc1858c1d61547aaf4ba4d30e225fc1bd7a173f0'

// Seção de contato da landing: formulário de leads (hubMonitor) em destaque.
export default function ContatoLead() {
  const isMobile = useBreakpoint() === 'mobile'

  useEffect(() => {
    if (document.querySelector(`script[src="${LEAD_SRC}"]`)) return
    const s = document.createElement('script')
    s.src = LEAD_SRC
    s.defer = true
    s.setAttribute('data-sistema', SISTEMA_ID)
    s.setAttribute('data-chave', CHAVE)
    s.setAttribute('data-alvo', '#contato')
    document.body.appendChild(s)
  }, [])

  return (
    <section
      aria-labelledby="contato-titulo"
      style={{
        padding: '56px 24px',
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h2
          id="contato-titulo"
          style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, letterSpacing: '-0.02em', margin: 0 }}
        >
          Tem alguma dúvida?
        </h2>
        <p style={{ color: 'var(--color-muted)', fontSize: FONT.md, marginTop: SPACE.sm, marginBottom: SPACE.xl }}>
          Conte um pouco sobre o seu escritório e a equipe responde. Sem compromisso.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 380px) minmax(0, 380px)',
          gap: SPACE.xl,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src={contatoImg}
            alt="Advogada e cliente selando um acordo com aperto de mão"
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
            style={{ width: '100%', maxWidth: 380, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: RADIUS.card, justifySelf: isMobile ? 'center' : 'end' }}
          />
          <div
            id="contato"
            style={{
              width: '100%',
              maxWidth: 380,
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: RADIUS.card,
              padding: SPACE.lg,
              justifySelf: isMobile ? 'center' : 'start',
            }}
          />
        </div>
      </div>
    </section>
  )
}
