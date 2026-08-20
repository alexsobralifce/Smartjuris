import { useState } from 'react'
import { api } from '../api/client'
import { Button, FONT, inputStyle, RADIUS, SPACE, useIsMobile } from '../ui'

// Tipografia do hero — exceção de marketing permitida (46px).
const HERO_FONT_SIZE = 46

interface LandingPageProps {
  onLoginSuccess: (user: { name: string; role: string; email: string }) => void
}

export default function LandingPage({ onLoginSuccess }: LandingPageProps) {
  const isMobile = useIsMobile()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await api.auth.login(email, password)

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Credenciais inválidas.')
      }

      onLoginSuccess(data.user)
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
      {/* Top Banner de Destaque */}
      <div style={{
        background: 'var(--color-primary)',
        color: 'var(--color-on-primary)',
        padding: '10px 24px',
        fontSize: FONT.base,
        textAlign: 'center',
        fontWeight: 500,
        letterSpacing: '0.03em',
        borderBottom: '1px solid color-mix(in srgb, var(--color-on-primary) 10%, transparent)'
      }}>
        ✨ <strong style={{ color: 'var(--color-accent)' }}>SmartJuris v2.5 (LexOS Edition)</strong> — A Primeira Plataforma Jurídica com IA Nativa e Validação Auditável do Brasil.
      </div>

      {/* Navbar Minimalista Swiss */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: isMobile ? '16px 20px' : '20px 48px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
          {/* Logo SVG Elegante: Balança da Justiça + Tecnologia IA */}
          <div style={{
            width: 40, height: 40, borderRadius: RADIUS.card,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px color-mix(in srgb, var(--color-primary) 15%, transparent)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3V21" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 7H19" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 7L2 13C2 14.6569 3.34315 16 5 16C6.65685 16 8 14.6569 8 13L5 7Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M19 7L16 13C16 14.6569 17.3431 16 19 16C20.6569 16 22 14.6569 22 13L19 7Z" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="12" cy="7" r="2" fill="var(--color-accent)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              SmartJuris <span style={{ color: 'var(--color-accent)', fontSize: FONT.lg }}>LexOS</span>
            </div>
            <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              Inteligência Jurídica & Gestão Integrada
            </div>
          </div>
        </div>

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xxl, fontSize: FONT.base, fontWeight: 500, color: 'var(--color-muted)' }}>
            <span>RAG BGE-M3 + DeepSeek</span>
            <span>•</span>
            <span>Supervisão Ética OAB</span>
            <span>•</span>
            <span>Design Swiss Vignelli</span>
          </div>
        )}
      </header>

      {/* Hero Grid Principal */}
      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 440px',
        maxWidth: 1240,
        margin: '0 auto',
        width: '100%',
        padding: isMobile ? '32px 20px' : '50px 48px',
        gap: isMobile ? 32 : 56,
        alignItems: 'center'
      }}>
        {/* Lado Esquerdo: Marca, Posicionamento e Ilustração SVG de Advogados */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--color-badge-tint)', color: 'var(--color-primary)',
            padding: '6px 12px', borderRadius: 20, fontSize: FONT.sm, fontWeight: 600,
            marginBottom: SPACE.xl, border: '1px solid var(--color-border)'
          }}>
            <span>⚖️</span> Peticionamento, Contratos e Jurimetria sem Alucinações
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: HERO_FONT_SIZE,
            lineHeight: 1.12,
            letterSpacing: '-0.03em',
            marginBottom: SPACE.xl,
            fontWeight: 400,
            color: 'var(--color-foreground)'
          }}>
            Acelerador Operacional para Advogados e Escritórios de Alta Performance.
          </h1>

          <p style={{
            color: 'var(--color-muted)',
            fontSize: FONT.xl,
            lineHeight: 1.6,
            marginBottom: 32,
            maxWidth: 620
          }}>
            O <strong>SmartJuris LexOS</strong> unifica contencioso, consultivo, financeiro e relacionamento em uma única plataforma com <strong>IA Nativa</strong>. Crie minutas de peças em segundos com RAG vetorial, revise contratos com scanner de risco e acompanhe a linha do tempo do processo e prazos.
          </p>

          {/* Ilustração SVG de Advogados e Tecnologia da Justiça */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '24px',
            marginBottom: 32,
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            gap: SPACE.xl
          }}>
            <svg width="110" height="90" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              {/* Ilustração Representativa de Advogado/Advogada com Pasta e Documento de IA */}
              <rect x="10" y="20" width="40" height="65" rx="6" fill="var(--color-primary)"/>
              <circle cx="30" cy="35" r="10" fill="var(--color-accent-light)"/>
              <path d="M18 65C18 55 23 50 30 50C37 50 42 55 42 65V80H18V65Z" fill="var(--color-accent)"/>

              {/* Documento Digital Jurídico */}
              <rect x="60" y="15" width="50" height="70" rx="6" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2"/>
              <line x1="68" y1="28" x2="98" y2="28" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round"/>
              <line x1="68" y1="38" x2="102" y2="38" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="68" y1="46" x2="95" y2="46" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="68" y1="54" x2="88" y2="54" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="95" cy="70" r="10" fill="var(--color-success)"/>
              <path d="M91 70L94 73L99 67" stroke="var(--color-on-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            <div>
              <div style={{ fontSize: FONT.lg, fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>
                Arquitetura em 4 Camadas de Segurança
              </div>
              <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                1. Geração LLM · 2. RAG Vetorial (BGE-M3) · 3. Banco de Cláusulas · 4. Validação e Crivo Humano Obrigatório.
              </div>
            </div>
          </div>

          {/* Destaques dos 6 Módulos */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: SPACE.lg }}>
            {[
              { title: 'Gerador RAG', desc: 'Peças fundamentadas na base do escritório.' },
              { title: 'Painel do Processo', desc: 'Linha do tempo & intimações resumidas por IA.' },
              { title: 'Validação Humana', desc: 'Trilha de auditoria e crivo ético OAB.' },
              { title: 'Jurimetria Preditiva', desc: 'Simulador de probabilidade de êxito.' },
              { title: 'Financeiro & Horas', desc: 'Honorários e gravação de horas faturáveis.' },
              { title: 'Revisão Contratual', desc: 'Scanner autônomo de cláusulas abusivas.' },
            ].map(f => (
              <div key={f.title} style={{ borderLeft: '2px solid var(--color-accent)', paddingLeft: SPACE.md }}>
                <div style={{ fontSize: FONT.base, fontWeight: 600, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.4 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Lado Direito: Formulário de Acesso Stance Swiss */}
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: isMobile ? '24px 20px' : '36px 32px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 30px color-mix(in srgb, var(--color-foreground) 4%, transparent)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: FONT.cardTitle }}>🔐</span>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: FONT.cardTitle,
              letterSpacing: '-0.02em',
              margin: 0
            }}>Acessar o SmartJuris</h2>
          </div>
          <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.xxl }}>
            Digite suas credenciais de advogado ou administrador.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
            {error && (
              <div style={{
                background: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-border)',
                borderRadius: RADIUS.control,
                padding: '12px 14px',
                fontSize: FONT.base,
                fontWeight: 500
              }}>
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Email Institucional</label>
              <input
                type="email"
                placeholder="admin@smartjuris.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ ...inputStyle(!!error), fontFamily: 'var(--font-mono)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)' }}>Senha de Acesso</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={inputStyle(!!error)}
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '13px', marginTop: 6 }}
            >
              {loading ? 'Validando Autenticação...' : 'Entrar no Sistema →'}
            </Button>
          </form>

          {/* Dicas de Acesso Rápido com Clique Direto */}
          <div style={{
            marginTop: 28,
            paddingTop: SPACE.xl,
            borderTop: '1px solid var(--color-border)',
            fontSize: FONT.sm,
            color: 'var(--color-muted)',
            lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 600, color: 'var(--color-foreground)', marginBottom: 8 }}>
              🔑 Credenciais Prontas para Teste:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-mono)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEmail('admin@smartjuris.com')
                  setPassword('admin123')
                }}
                style={{
                  textAlign: 'left', justifyContent: 'flex-start', width: '100%',
                  background: 'var(--color-background)', padding: '6px 10px',
                  borderRadius: RADIUS.chip, fontSize: FONT.sm, fontWeight: 400
                }}
              >
                👤 <strong>Admin:</strong> <code>admin@smartjuris.com</code> (Preencher)
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEmail('user@smartjuris.com')
                  setPassword('user123')
                }}
                style={{
                  textAlign: 'left', justifyContent: 'flex-start', width: '100%',
                  background: 'var(--color-background)', padding: '6px 10px',
                  borderRadius: RADIUS.chip, fontSize: FONT.sm, fontWeight: 400
                }}
              >
                ⚖️ <strong>Advogado/Usuário:</strong> <code>user@smartjuris.com</code> (Preencher)
              </Button>
            </div>

            <div style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}>
              <span style={{ color: 'var(--color-accent)', flexShrink: 0 }}>🔋</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-foreground)' }}>Modo demonstração: 10.000 tokens/mês por usuário.</div>
                <div style={{ color: 'var(--color-muted)' }}>A geração de peças e resumos com IA consome tokens.</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Swiss */}
      <footer style={{
        padding: isMobile ? '24px 20px' : '24px 48px',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center',
        fontSize: FONT.sm,
        color: 'var(--color-muted)',
        background: 'var(--color-surface)'
      }}>
        © {new Date().getFullYear()} SmartJuris LexOS. Inteligência Artificial Jurídica & Gestão para Advocacia Contemporânea. Suporte Técnico via WhatsApp: <a href="https://wa.me/5588993573809" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>88 99357-3809</a>. Estética Vignelli.
      </footer>
    </div>
  )
}
