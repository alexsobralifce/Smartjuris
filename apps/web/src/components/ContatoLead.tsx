import { useEffect } from 'react'
import { FONT, RADIUS, SPACE } from '../ui'

const LEAD_SRC = 'https://api-production-9390.up.railway.app/lead.js'
const SISTEMA_ID = 'b0ad54b6-a907-4106-8335-47511cc60853'
const CHAVE = 'b018ba9cdc1858c1d61547aaf4ba4d30e225fc1bd7a173f0'

// Seção de contato da landing: formulário de leads (hubMonitor) em destaque.
export default function ContatoLead() {
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
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2
          id="contato-titulo"
          style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, letterSpacing: '-0.02em', margin: 0 }}
        >
          Tem alguma dúvida?
        </h2>
        <p style={{ color: 'var(--color-muted)', fontSize: FONT.md, marginTop: SPACE.sm, marginBottom: SPACE.xl }}>
          Conte um pouco sobre o seu escritório e a equipe responde. Sem compromisso.
        </p>
        <div
          id="contato"
          style={{
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: RADIUS.card,
            padding: SPACE.xl,
          }}
        />
      </div>
    </section>
  )
}
