import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Processos from './components/Processos'
import GeradorPecas from './components/GeradorPecas'
import Validacao from './components/Validacao'
import Jurimetria from './components/Jurimetria'
import Decisoes from './components/Decisoes'
import Base from './components/Base'
import Documentacao from './components/Documentacao'
import Financeiro from './components/Financeiro'
import Contratos from './components/Contratos'
import Crm from './components/Crm'
import Clientes from './components/Clientes'
import TrocarSenha from './components/TrocarSenha'
import AdminEscritorio from './components/AdminEscritorio'
import RootPainel from './components/RootPainel'
import LandingPage from './components/LandingPage'
import Agenda from './components/Agenda'
import { api } from './api/client'
import { useTheme } from './hooks/useTheme'

type Route = 'dashboard' | 'agenda' | 'processos' | 'clientes' | 'pecas' | 'validacao' | 'jurimetria' | 'decisoes' | 'financeiro' | 'contratos' | 'crm' | 'base' | 'documentacao' | 'admin'

interface User {
  id?: string
  name: string
  role: string
  email: string
  escritorioId?: string
  permissoes?: string[]
  precisaTrocarSenha?: boolean
  tokensMes?: number | null
  limiteTokensMes?: number | null
}

const nav: { id: Route; label: string; icon: string; badge?: number }[] = [
  { id: 'dashboard', label: 'Painel', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'agenda', label: 'Agenda', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'processos', label: 'Processos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'clientes', label: 'Clientes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'pecas', label: 'Gerar Peças', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { id: 'validacao', label: 'Validação', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'jurimetria', label: 'Jurimetria', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'decisoes', label: 'Decisões & Tribunais', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { id: 'financeiro', label: 'Financeiro', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'contratos', label: 'Revisão Contratual', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'crm', label: 'Funil de Clientes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'base', label: 'Base de Conhecimento', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { id: 'documentacao', label: 'Documentação', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { id: 'admin', label: 'Administração', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
]

const readCachedUser = (): User | null => {
  try {
    const cachedUser = localStorage.getItem('smartjuris_user')
    return cachedUser ? JSON.parse(cachedUser) : null
  } catch {
    return null
  }
}

const fmtNum = (v: number | null | undefined) => {
  if (v == null) return '0'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isNaN(n)) return '0'
  return n.toLocaleString('pt-BR')
}

export default function App() {
  const [user, setUser] = useState<User | null>(readCachedUser)
  const [precisaTrocar, setPrecisaTrocar] = useState<boolean>(() => readCachedUser()?.precisaTrocarSenha === true)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<Route>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    let cancelled = false

    api.auth.me()
      .then(async res => {
        if (cancelled) return
        if (res.ok) {
          try {
            const data = await res.json()
            if (data?.user) {
              setUser(data.user)
              setPrecisaTrocar(data.user.precisaTrocarSenha === true)
              localStorage.setItem('smartjuris_user', JSON.stringify(data.user))
            } else {
              setUser(null)
              localStorage.removeItem('smartjuris_user')
            }
          } catch (err) {
            // 200 sem corpo JSON válido: mantém a sessão atual
            console.warn('Resposta inválida de /me:', err)
          }
        } else if (res.status === 401) {
          // Sessão genuinamente ausente/inválida — comportamento original
          setUser(null)
          localStorage.removeItem('smartjuris_user')
        } else {
          // Falha transitória (5xx etc.): NÃO desloga o usuário
          console.warn(`Falha ao validar sessão (/me) — status ${res.status}. Mantendo sessão atual.`)
        }
      })
      .catch(err => {
        if (cancelled) return
        // Falha de rede / servidor indisponível: NÃO desloga o usuário
        console.warn('Erro de rede ao validar sessão (/me). Mantendo sessão atual.', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const handleNav = () => setRoute('pecas')
    window.addEventListener('nav-pecas', handleNav)
    return () => window.removeEventListener('nav-pecas', handleNav)
  }, [])

  const handleLoginSuccess = (newUser: User) => {
    localStorage.setItem('smartjuris_user', JSON.stringify(newUser))
    setUser(newUser)
    setRoute('dashboard')
    setPrecisaTrocar(newUser.precisaTrocarSenha === true)
  }

  const handleTrocaSenhaSuccess = (newUser: User) => {
    localStorage.setItem('smartjuris_user', JSON.stringify(newUser))
    setUser(newUser)
    setPrecisaTrocar(false)
    setRoute('dashboard')
  }

  const handleLogout = () => {
    api.auth.logout().catch(() => {})
    localStorage.removeItem('smartjuris_user')
    setUser(null)
    setPrecisaTrocar(false)
  }

  // Enquanto valida a sessão com /me, exibe estado de carregamento
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-background)' }}>
        <div style={{ padding: 24 }}>Carregando...</div>
      </div>
    )
  }

  // Se não estiver logado, exibe Landing Page
  if (!user) {
    return <LandingPage onLoginSuccess={handleLoginSuccess} />
  }

  // Fluxo de troca de senha obrigatória — impede o acesso ao shell até concluir
  if (precisaTrocar) {
    return <TrocarSenha user={user} onSuccess={handleTrocaSenhaSuccess} />
  }

  // Iniciais do usuário
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U'

  // Indicador de consumo de tokens (apenas usuários do modo demonstração)
  let tokenBadge: React.ReactNode = null
  if (user && user.limiteTokensMes != null) {
    const tokens = user.tokensMes ?? 0
    const limite = user.limiteTokensMes
    const pct = limite > 0 ? Math.round((tokens / limite) * 100) : 100
    const badgeStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      lineHeight: 1,
      borderRadius: 4,
      padding: '3px 6px',
      marginTop: 6,
      whiteSpace: 'nowrap',
    }
    if (pct >= 100) {
      tokenBadge = (
        <span
          title="Geração de peças/resumos por IA bloqueada até o próximo mês."
          style={{ ...badgeStyle, color: 'var(--color-danger)', background: 'var(--color-danger-light)' }}
        >
          🔋 Limite de tokens atingido ({pct}%)
        </span>
      )
    } else if (pct >= 80) {
      tokenBadge = (
        <span style={{ ...badgeStyle, color: 'var(--color-warning)', background: 'var(--color-warning-light)' }}>
          🔋 {fmtNum(tokens)} / {fmtNum(limite)} tokens ({pct}%)
        </span>
      )
    } else {
      tokenBadge = (
        <span style={{ ...badgeStyle, color: 'var(--color-muted)', background: 'rgba(255,255,255,0.08)' }}>
          🔋 {fmtNum(tokens)} / {fmtNum(limite)} tokens
        </span>
      )
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-background)' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 240 : 64,
        minWidth: sidebarOpen ? 240 : 64,
        background: 'var(--color-sidebar)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        overflow: 'hidden',
        position: 'sticky',
        top: 0,
        height: '100vh',
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#18170f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            {sidebarOpen && (
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1 }}>SmartJuris</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>Sistema Jurídico</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.filter(item => {
            if (!user) return false
            if (user.role === 'admin' || user.role === 'root') return true // admin e root veem todos os módulos
            // user comum: dashboard, documentacao e decisoes sempre liberados; demais só se estiver em permissoes
            return item.id === 'dashboard' || item.id === 'agenda' || item.id === 'documentacao' || item.id === 'decisoes' || (user.permissoes ?? []).includes(item.id)
          }).map(item => (
            <button
              key={item.id}
              onClick={() => setRoute(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px',
                borderRadius: 6,
                border: 'none', cursor: 'pointer',
                width: '100%', textAlign: 'left',
                background: route === item.id ? 'rgba(200, 168, 75, 0.15)' : 'transparent',
                color: route === item.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.55)',
                transition: 'background 0.15s, color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (route !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={e => {
                if (route !== item.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path d={item.icon} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {sidebarOpen && (
                <>
                  <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      marginLeft: 'auto',
                      background: 'var(--color-accent)',
                      color: '#18170f',
                      fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: '1px 6px',
                    }}>{item.badge}</span>
                  )}
                </>
              )}
              {!sidebarOpen && item.badge && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--color-accent)',
                }}/>
              )}
            </button>
          ))}
        </nav>

        {/* Suporte Técnico */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {sidebarOpen ? (
            <div style={{
              padding: '10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)'
            }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Suporte Técnico</div>
              <a
                href="https://wa.me/5588993573809"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--color-accent)',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.733-1.455L0 24zm6.59-4.846c1.66.986 3.292 1.503 5.343 1.504 5.518 0 10.005-4.486 10.008-10.004.002-2.673-1.04-5.184-2.937-7.082C17.16 1.671 14.654.626 12.012.626 6.495.626 2.006 5.111 2.003 10.63c-.001 2.083.548 4.115 1.591 5.922L2.557 20.3l3.96-1.036c.057.031.114.062.17.09z" />
                </svg>
                <span>(88) 99357-3809</span>
              </a>
            </div>
          ) : (
            <a
              href="https://wa.me/5588993573809"
              target="_blank"
              rel="noopener noreferrer"
              title="Suporte Técnico (WhatsApp): (88) 99357-3809"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--color-accent)',
                textDecoration: 'none',
                margin: '0 auto',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.733-1.455L0 24zm6.59-4.846c1.66.986 3.292 1.503 5.343 1.504 5.518 0 10.005-4.486 10.008-10.004.002-2.673-1.04-5.184-2.937-7.082C17.16 1.671 14.654.626 12.012.626 6.495.626 2.006 5.111 2.003 10.63c-.001 2.083.548 4.115 1.591 5.922L2.557 20.3l3.96-1.036c.057.031.114.062.17.09z" />
              </svg>
            </a>
          )}
        </div>

        {/* Toggle + User */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 6,
              border: 'none', cursor: 'pointer', width: '100%',
              background: 'transparent', color: 'rgba(255,255,255,0.35)',
            }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
              <path d={sidebarOpen ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M13 5l7 7-7 7M5 5l7 7-7 7'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {sidebarOpen && <span style={{ fontSize: 12 }}>Recolher</span>}
          </button>

          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 6,
              border: 'none', cursor: 'pointer', width: '100%',
              background: 'transparent', color: 'rgba(255,255,255,0.55)',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              {theme === 'dark' ? (
                <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              ) : (
                <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              )}
            </svg>
            {sidebarOpen && <span style={{ fontSize: 12 }}>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 2px', justifyContent: sidebarOpen ? 'flex-start' : 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#18170f', flexShrink: 0,
            }}>{initials}</div>
            {sidebarOpen && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Dr. Advogado'}</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'capitalize' }}>{user?.role === 'root' ? 'Operações' : user?.role === 'admin' ? 'Administrador' : 'Advogado'}</div>
                {tokenBadge}
              </div>
            )}
          </div>

          {sidebarOpen && (
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 6,
                border: 'none', cursor: 'pointer', width: '100%',
                background: 'transparent', color: 'var(--color-danger)',
                fontSize: 12, fontWeight: 500, marginTop: 8
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 0, 0, 0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Sair da Conta</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {route === 'dashboard' && <Dashboard />}
        {route === 'agenda' && <Agenda />}
        {route === 'processos' && <Processos />}
        {route === 'clientes' && <Clientes />}
        {route === 'pecas' && <GeradorPecas />}
        {route === 'validacao' && <Validacao />}
        {route === 'jurimetria' && <Jurimetria />}
        {route === 'decisoes' && <Decisoes />}
        {route === 'financeiro' && <Financeiro />}
        {route === 'contratos' && <Contratos />}
        {route === 'crm' && <Crm />}
        {route === 'base' && <Base />}
        {route === 'documentacao' && <Documentacao />}
        {route === 'admin' && user?.role === 'root' && <RootPainel />}
        {route === 'admin' && user?.role === 'admin' && <AdminEscritorio />}
      </main>
    </div>
  )
}
