import { useState } from 'react'
import { getApiBaseUrl } from '../api/config'

interface LandingPageProps {
  onLoginSuccess: (token: string, user: { name: string; role: string; email: string }) => void
}

export default function LandingPage({ onLoginSuccess }: LandingPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const apiBase = getApiBaseUrl()
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas.')
      }

      onLoginSuccess(data.token, data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-background)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-foreground)'
    }}>
      {/* Navbar Minimalista */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 40px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#18170f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>SmartJuris</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 500 }}>
          SISTEMA JURÍDICO COM IA
        </div>
      </header>

      {/* Grid Principal Swiss Design */}
      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 450px',
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        padding: '60px 40px',
        gap: 60,
        alignItems: 'center'
      }}>
        {/* Lado Esquerdo: Conteúdo Profissional */}
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 48,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: 24,
            fontWeight: 400
          }}>
            Inteligência Artificial de precisão para escritórios jurídicos.
          </h1>
          <p style={{
            color: 'var(--color-muted)',
            fontSize: 16,
            lineHeight: 1.6,
            marginBottom: 40,
            maxWidth: 600
          }}>
            O SmartJuris unifica a gestão do seu escritório com tecnologia RAG proprietária e modelos generativos avançados. Automatize a elaboração de peças processuais com base na sua própria base histórica, mantendo o controle total através de uma fila de aprovação humana e jurimetria preditiva.
          </p>

          {/* Destaques / Features */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {[
              { title: 'Geração de Peças via RAG', desc: 'Busca semântica no banco de julgados e leis com pgvector e Ollama para criar peças hiper-personalizadas.' },
              { title: 'Fila de Validação Humana', desc: 'Controle de auditoria absoluto. Nenhuma peça sai do sistema sem o crivo e assinatura do advogado.' },
              { title: 'Previsões Jurimétricas', desc: 'Previsão estatística de êxito e tempo médio de julgamento por juiz e matéria.' },
              { title: 'Base RAG Vetorizada', desc: 'Gerencie coleções inteiras de PDFs do escritório e sincronize com a jurisprudência atualizada.' },
            ].map(f => (
              <div key={f.title} style={{ borderLeft: '2px solid var(--color-accent)', paddingLeft: 16 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{f.title}</h3>
                <p style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Lado Direito: Formulário de Login Stance Swiss */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'none'
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            letterSpacing: '-0.02em',
            marginBottom: 8
          }}>Acessar Plataforma</h2>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 24 }}>
            Insira suas credenciais corporativas.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '12px 16px',
                fontSize: 12,
                fontWeight: 500
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Email Institucional</label>
              <input
                type="email"
                placeholder="exemplo@smartjuris.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-foreground)',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Senha de Acesso</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-foreground)',
                  fontSize: 13,
                  outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--color-primary)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 8,
                transition: 'background 0.2s',
                fontFamily: 'var(--font-sans)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-primary-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--color-primary)'}
            >
              {loading ? 'Validando...' : 'Entrar no Sistema'}
            </button>
          </form>

          {/* Dicas de Acesso para Testadores */}
          <div style={{
            marginTop: 32,
            paddingTop: 24,
            borderTop: '1px solid var(--color-border)',
            fontSize: 11,
            color: 'var(--color-muted)',
            lineHeight: 1.5
          }}>
            <strong>Credenciais de demonstração (seeds):</strong>
            <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)' }}>
              <div>Admin: <code>admin@smartjuris.com</code> / <code>admin123</code></div>
              <div style={{ marginTop: 4 }}>Normal: <code>aline@smartjuris.com</code> / <code>user123</code></div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Minimalista */}
      <footer style={{
        padding: '30px 40px',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--color-muted)',
        background: 'var(--color-surface)'
      }}>
        © {new Date().getFullYear()} SmartJuris Tecnologia Legal. Todos os direitos reservados. Estética Vignelli & Grid Suíço.
      </footer>
    </div>
  )
}
