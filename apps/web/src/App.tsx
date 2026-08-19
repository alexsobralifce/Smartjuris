import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Processos from './components/Processos'
import GeradorPecas from './components/GeradorPecas'
import Validacao from './components/Validacao'
import Jurimetria from './components/Jurimetria'
import Base from './components/Base'
import Documentacao from './components/Documentacao'
import Financeiro from './components/Financeiro'
import Contratos from './components/Contratos'
import Crm from './components/Crm'
import Clientes from './components/Clientes'
import LandingPage from './components/LandingPage'

type Route = 'dashboard' | 'processos' | 'clientes' | 'pecas' | 'validacao' | 'jurimetria' | 'financeiro' | 'contratos' | 'crm' | 'base' | 'documentacao'

const nav: { id: Route; label: string; icon: string; badge?: number }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'processos', label: 'Processos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'clientes', label: 'Clientes', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'pecas', label: 'Gerar Peças', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { id: 'validacao', label: 'Validação', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', badge: 3 },
  { id: 'jurimetria', label: 'Jurimetria', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'financeiro', label: 'Financeiro', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'contratos', label: 'Revisão Contratual', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'crm', label: 'CRM & Funil', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  { id: 'base', label: 'Base RAG', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { id: 'documentacao', label: 'Documentação', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
]

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('smartjuris_token'))
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null)
  const [route, setRoute] = useState<Route>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const cachedUser = localStorage.getItem('smartjuris_user')
    if (cachedUser) {
      setUser(JSON.parse(cachedUser))
    }
  }, [token])

  useEffect(() => {
    const handleNav = () => setRoute('pecas')
    window.addEventListener('nav-pecas', handleNav)
    return () => window.removeEventListener('nav-pecas', handleNav)
  }, [])

  const handleLoginSuccess = (newToken: string, newUser: { name: string; role: string; email: string }) => {
    localStorage.setItem('smartjuris_token', newToken)
    localStorage.setItem('smartjuris_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
    setRoute('dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('smartjuris_token')
    localStorage.removeItem('smartjuris_user')
    setToken(null)
    setUser(null)
  }

  // Se não estiver logado, exibe Landing Page
  if (!token) {
    return <LandingPage onLoginSuccess={handleLoginSuccess} />
  }

  // Iniciais do usuário
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U'

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
          {nav.map(item => (
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
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'capitalize' }}>{user?.role === 'admin' ? 'Administrador' : 'Advogado'}</div>
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
        {route === 'processos' && <Processos />}
        {route === 'clientes' && <Clientes />}
        {route === 'pecas' && <GeradorPecas />}
        {route === 'validacao' && <Validacao />}
        {route === 'jurimetria' && <Jurimetria />}
        {route === 'financeiro' && <Financeiro />}
        {route === 'contratos' && <Contratos />}
        {route === 'crm' && <Crm />}
        {route === 'base' && <Base />}
        {route === 'documentacao' && <Documentacao />}
      </main>
    </div>
  )
}
