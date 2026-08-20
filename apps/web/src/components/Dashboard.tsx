import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import type { Processo, Peca } from '@lexia/shared'

const statusLabel: Record<string, { label: string; color: string; bg: string }> = {
  revisao:    { label: 'Aguardando Revisão', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  aprovado:   { label: 'Aprovado',           color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  protocolado:{ label: 'Protocolado',        color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  reprovado:  { label: 'Reprovado',          color: 'var(--color-danger)',  bg: 'var(--color-danger-light)' },
}

export default function Dashboard() {
  const [processos, setProcessos] = useState<Processo[]>([])
  const [pecas, setPecas] = useState<Peca[]>([])
  const [erro, setErro] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Root não acessa dados de negócio (modelo multi-tenant): detecta via sessão cacheada
  // para não disparar chamadas a /api/processos e /api/pecas (que retornariam 403).
  const [isRoot] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('smartjuris_user')
      if (!raw) return false
      return JSON.parse(raw)?.role === 'root'
    } catch {
      return false
    }
  })

  // Sistema de Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      try {
        const [procData, pecasData] = await Promise.all([
          api.processos.list(),
          api.pecas.list()
        ])
        if (cancelled) return
        setProcessos(Array.isArray(procData) ? procData : [])
        setPecas(Array.isArray(pecasData) ? pecasData : [])
        setErro(false)
      } catch (error) {
        if (cancelled) return
        console.error(error)
        setErro(true)
        addToast('error', 'Erro ao carregar dados do painel. Tente novamente.')
      }
    }
    if (!isRoot) {
      loadData()
    } else {
      // Root: sem dados de negócio — mantém o painel limpo.
      setProcessos([])
      setPecas([])
      setErro(false)
    }
    return () => { cancelled = true }
  }, [reloadKey, isRoot])

  if (isRoot) {
    return (
      <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', color: 'var(--color-foreground)' }}>
            Painel de Operações
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>
            SmartJuris Operações · administração da plataforma
          </div>
        </div>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '32px 36px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-foreground)', marginBottom: 8 }}>
            Você está no painel de Operações.
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
            Use a aba <strong style={{ color: 'var(--color-foreground)' }}>Administração &gt; Escritórios</strong> para gestão de tenants (criação, limites e auditoria da plataforma).
            Os dados de processos, peças e clientes são restritos aos escritórios.
          </div>
        </div>
      </div>
    )
  }

  const ativos = processos.filter(p => p.status === 'ativo').length
  const emRevisao = pecas.filter(p => p.status === 'revisao').length
  const aprovados = pecas.filter(p => p.status === 'aprovado' || p.status === 'protocolado').length
  const taxaAprovacao = pecas.length > 0 ? Math.round((aprovados / pecas.length) * 100) : 0

  const stats = [
    { label: 'Processos Ativos',    value: String(ativos),           delta: `${processos.length} no total`,    up: true },
    { label: 'Peças Geradas',       value: String(pecas.length),     delta: `${aprovados} aprovadas`,          up: true },
    { label: 'Aguardando Revisão',  value: String(emRevisao),        delta: emRevisao > 0 ? 'Revisar hoje' : 'Nenhuma pendente', up: emRevisao === 0 },
    { label: 'Taxa de Aprovação',   value: `${taxaAprovacao}%`,      delta: 'Peças aprovadas / total',         up: true },
  ]

  const urgentes = processos.filter(p => p.status === 'ativo' && p.prazo !== '—').slice(0, 3)

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.02em', color: 'var(--color-foreground)' }}>
            Bom dia, Dr. Marcos
          </div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>
            Segunda-feira, 17 de agosto de 2026
            {emRevisao > 0 && ` · ${emRevisao} ${emRevisao === 1 ? 'item aguardando' : 'itens aguardando'} revisão`}
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '4px 10px', flexShrink: 0 }}>
          DADOS DEMONSTRATIVOS
        </div>
      </div>

      {/* Erro de carregamento */}
      {erro && (
        <div style={{ background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ color: 'var(--color-danger)' }}>
            ⚠️ Não foi possível carregar os dados do painel.
          </div>
          <button
            onClick={() => setReloadKey(k => k + 1)}
            style={{
              background: 'var(--color-danger)', color: '#fff', border: 'none',
              padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 22px' }}>
            <div style={{ color: 'var(--color-muted)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, marginTop: 8, color: s.up ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 500 }}>{s.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Peças recentes */}
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Peças Recentes</div>
            <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{pecas.length} total</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                {['ID', 'Tipo de Peça', 'Área', 'Cliente', 'Status', 'Prazo'].map(h => (
                  <th key={h} style={{ padding: '8px 22px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pecas.slice(0, 5).map(p => {
                const s = statusLabel[p.status]
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{p.id}</td>
                    <td style={{ padding: '12px 22px', fontSize: 13, fontWeight: 500 }}>{p.tipo}</td>
                    <td style={{ padding: '12px 22px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: 4 }}>{p.area}</span>
                    </td>
                    <td style={{ padding: '12px 22px', fontSize: 12, color: 'var(--color-muted)' }}>{p.cliente}</td>
                    <td style={{ padding: '12px 22px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 4 }}>{s.label}</span>
                    </td>
                    <td style={{ padding: '12px 22px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.prazo}</td>
                  </tr>
                )
              })}
              {pecas.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>Nenhuma peça gerada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Prazos + RAG status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: 13 }}>Prazos Críticos</div>
            {urgentes.length === 0 && (
              <div style={{ padding: '24px 22px', color: 'var(--color-muted)', fontSize: 13 }}>Nenhum prazo crítico.</div>
            )}
            {urgentes.map(p => (
              <div key={p.id} style={{ padding: '14px 22px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)', marginBottom: 4 }}>{p.id}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0, background: 'var(--color-accent-light)', color: 'var(--color-warning)' }}>{p.prazo}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{p.tipo}</div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{p.cliente} · {p.vara}</div>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '16px 22px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Status do Motor RAG</div>
            {[
              { label: 'Documentos indexados', value: '12.847' },
              { label: 'Último sync jurisprudência', value: 'Hoje 06:00' },
              { label: 'Modelo ativo', value: 'DeepSeek Chat' },
              { label: 'Embeddings', value: 'BGE-M3 · PT-BR' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{item.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-success)', fontWeight: 500 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Componente Toast de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
