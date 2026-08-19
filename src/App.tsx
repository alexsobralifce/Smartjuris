import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Processos from './components/Processos'
import GeradorPecas from './components/GeradorPecas'
import Validacao from './components/Validacao'
import Jurimetria from './components/Jurimetria'
import Base from './components/Base'

type Route = 'dashboard' | 'processos' | 'pecas' | 'validacao' | 'jurimetria' | 'base'

const nav: { id: Route; label: string; icon: string; badge?: number }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'processos', label: 'Processos', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { id: 'pecas', label: 'Gerar Peças', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { id: 'validacao', label: 'Validação', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', badge: 3 },
  { id: 'jurimetria', label: 'Jurimetria', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'base', label: 'Base RAG', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
]

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
                <div style={{ fontFamily: 'var(--font-display)', color: '#fff', fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1 }}>LexIA</div>
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

          {sidebarOpen && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 2px' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--color-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#18170f', flexShrink: 0,
              }}>MC</div>
              <div>
                <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>Dr. Marcos Costa</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>Administrador</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {route === 'dashboard' && <Dashboard />}
        {route === 'processos' && <Processos />}
        {route === 'pecas' && <GeradorPecas />}
        {route === 'validacao' && <Validacao />}
        {route === 'jurimetria' && <Jurimetria />}
        {route === 'base' && <Base />}
      </main>
    </div>
  )
}
