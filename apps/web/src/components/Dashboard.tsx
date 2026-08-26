import { useState, useEffect } from 'react'
import { api } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import type { Processo, Peca } from '@lexia/shared'
import {
  Button, EmptyState, EmptyRow, FONT, PageContainer, PageHeader, RADIUS, SPACE,
  Table, TableShell, Td, Th, THeadRow, Tr, useIsMobile,
} from '../ui'

const statusLabel: Record<string, { label: string; color: string; bg: string }> = {
  revisao:    { label: 'Aguardando Revisão', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  aprovado:   { label: 'Aprovado',           color: 'var(--color-success)', bg: 'var(--color-success-light)' },
  protocolado:{ label: 'Protocolado',        color: 'var(--color-primary)', bg: 'var(--color-badge-tint)' },
  reprovado:  { label: 'Reprovado',          color: 'var(--color-danger)',  bg: 'var(--color-danger-light)' },
}

function saudacaoDoDia(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Bom dia'
  if (h >= 12 && h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function dataHoje(): string {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Dashboard() {
  const isMobile = useIsMobile()
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

  // Usuário não assinante (conta demo sem assinatura ativa): mostra aviso de
  // recursos avançados limitados. Admin/root são isentos do aviso.
  const [isNonSubscriber] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('smartjuris_user')
      if (!raw) return false
      const u = JSON.parse(raw)
      if (u?.role === 'root' || u?.role === 'admin') return false
      return u?.isDemo === true && u?.assinaturaStatus !== 'ativa'
    } catch {
      return false
    }
  })

  // Usuário logado (nome/e-mail) para a saudação dinâmica — lido da sessão cacheada.
  const [usuarioAtual] = useState<{ nome: string; email: string }>(() => {
    try {
      const raw = localStorage.getItem('smartjuris_user')
      const u = raw ? JSON.parse(raw) : {}
      return { nome: u?.name || '', email: u?.email || '' }
    } catch {
      return { nome: '', email: '' }
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
      <PageContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
          <PageHeader
            eyebrow="VISÃO GERAL"
            title="Painel de Operações"
            description="SmartJuris Operações · administração da plataforma"
          />
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '32px 36px' }}>
            <div style={{ fontSize: FONT.lg, fontWeight: 600, color: 'var(--color-foreground)', marginBottom: SPACE.sm }}>
              Você está no painel de Operações.
            </div>
            <div style={{ fontSize: FONT.md, color: 'var(--color-muted)', lineHeight: 1.6 }}>
              Use a aba <strong style={{ color: 'var(--color-foreground)' }}>Administração &gt; Escritórios</strong> para gestão de tenants (criação, limites e auditoria da plataforma).
              Os dados de processos, peças e clientes são restritos aos escritórios.
            </div>
          </div>
        </div>
      </PageContainer>
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
    <PageContainer>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xxl }}>
        <PageHeader
          eyebrow="VISÃO GERAL"
          title={`${saudacaoDoDia()}, ${usuarioAtual.nome || 'Advogado'}`}
          description={`${usuarioAtual.email ? `${usuarioAtual.email} · ` : ''}${dataHoje()}${emRevisao > 0 ? ` · ${emRevisao} ${emRevisao === 1 ? 'item aguardando' : 'itens aguardando'} revisão` : ''}`}
          action={(
            <span style={{
              fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--color-muted)', background: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)', borderRadius: RADIUS.chip, padding: '4px 10px', flexShrink: 0,
            }}>
              DADOS DEMONSTRATIVOS
            </span>
          )}
        />

        {/* Erro de carregamento */}
        {erro && (
          <div style={{
            background: 'var(--color-danger-light)', border: '1px solid var(--color-danger)',
            borderRadius: RADIUS.control, padding: '12px 16px', fontSize: FONT.base,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          }}>
            <div style={{ color: 'var(--color-danger)' }}>
              ⚠️ Não foi possível carregar os dados do painel.
            </div>
            <Button variant="danger" size="sm" onClick={() => setReloadKey(k => k + 1)}>Tentar novamente</Button>
          </div>
        )}

        {/* Aviso de recursos avançados limitados para não assinantes */}
        {isNonSubscriber && (
          <div style={{
            background: 'var(--color-warning-light)',
            border: '1px solid var(--color-warning)',
            borderRadius: RADIUS.control,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 220, flex: 1 }}>
              <span style={{ fontSize: FONT.lg, flexShrink: 0, marginTop: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: FONT.md, fontWeight: 700, color: 'var(--color-warning)', marginBottom: 2 }}>
                  Recursos avançados limitados
                </div>
                <div style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                  Recursos de IA (geração de peças, base de conhecimento, busca de jurisprudência e revisão contratual)
                  estão limitados para não assinantes. Assine um plano para desbloquear acesso completo.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('nav', { detail: 'assinatura' }))}
              style={{ flexShrink: 0 }}
            >
              Assinar Agora →
            </Button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 16 }}>
          {stats.map(s => (
            <div key={s.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '20px 22px' }}>
              <div style={{ color: 'var(--color-muted)', fontSize: FONT.sm, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.pageTitle, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: FONT.sm, marginTop: 8, color: s.up ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 500 }}>{s.delta}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 20 }}>
          {/* Peças recentes */}
          <TableShell>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: FONT.md }}>Peças Recentes</div>
              <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{pecas.length} total</span>
            </div>
            <Table>
              <thead>
                <THeadRow>
                  {['ID', 'Tipo de Peça', 'Área', 'Cliente', 'Status', 'Prazo'].map(h => (
                    <Th key={h}>{h}</Th>
                  ))}
                </THeadRow>
              </thead>
              <tbody>
                {pecas.slice(0, 5).map(p => {
                  const s = statusLabel[p.status]
                  return (
                    <Tr key={p.id}>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm, color: 'var(--color-muted)' }}>{p.id}</Td>
                      <Td style={{ fontSize: FONT.md, fontWeight: 500 }}>{p.tipo}</Td>
                      <Td>
                        <span style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-primary)', background: 'var(--color-badge-tint)', padding: '2px 8px', borderRadius: RADIUS.chip }}>{p.area}</span>
                      </Td>
                      <Td style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>{p.cliente}</Td>
                      <Td>
                        <span style={{ fontSize: FONT.xs, fontWeight: 600, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: RADIUS.chip }}>{s.label}</span>
                      </Td>
                      <Td style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.sm }}>{p.prazo}</Td>
                    </Tr>
                  )
                })}
                {pecas.length === 0 && (
                  <EmptyRow colSpan={6} message="Nenhuma peça gerada ainda." />
                )}
              </tbody>
            </Table>
          </TableShell>

          {/* Prazos + RAG status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, overflow: 'hidden' }}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)', fontWeight: 600, fontSize: FONT.md }}>Prazos Críticos</div>
              {urgentes.length === 0 ? (
                <EmptyState message="Nenhum prazo crítico." />
              ) : (
                urgentes.map(p => (
                  <div key={p.id} style={{ padding: '14px 22px', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-muted)', marginBottom: 4 }}>{p.id}</div>
                      <span style={{ fontSize: FONT.xs, fontWeight: 700, padding: '2px 8px', borderRadius: RADIUS.chip, flexShrink: 0, background: 'var(--color-accent-light)', color: 'var(--color-warning)' }}>{p.prazo}</span>
                    </div>
                    <div style={{ fontSize: FONT.base, fontWeight: 500, lineHeight: 1.4, marginBottom: 2 }}>{p.tipo}</div>
                    <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{p.cliente} · {p.vara}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: RADIUS.card, padding: '16px 22px' }}>
              <div style={{ fontSize: FONT.sm, fontWeight: 600, color: 'var(--color-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>Status do Motor RAG</div>
              {[
                { label: 'Documentos indexados', value: '12.847' },
                { label: 'Último sync jurisprudência', value: 'Hoje 06:00' },
                { label: 'Modelo ativo', value: 'Qwen' },
                { label: 'Embeddings', value: 'BGE-M3 · PT-BR' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: FONT.xs, color: 'var(--color-success)', fontWeight: 500 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Componente Toast de Mensageria Flutuante */}
        <Toast toasts={toasts} onDismiss={dismissToast} />
      </div>
    </PageContainer>
  )
}
