import { useCallback, useEffect, useState } from 'react'
import { PageContainer, PageHeader, Button, FONT, RADIUS, SPACE, Loading } from '../ui'
import { api, getErrorMessage } from '../api/client'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { decidirCheckoutPromocional, resumoPrecoPlano, type PromocaoStatusApi } from '../utils/promocaoUI'

interface PlanoAssinatura {
  codigo: string
  precoMensal: number
  creditos: number
  rotulo: string
  promocao: {
    percentual: number
    valorPromocional: number
    valorPromocionalCents: number
  } | null
}

interface PromocaoStatus {
  ativa: boolean
  percentual: number
  elegivel: boolean
  motivoIneligibilidade: string | null
  valorPromocional: {
    percentual: number
    precoMensal: number
    valorPromocional: number
    valorPromocionalCents: number
  } | null
}

interface StatusAssinatura {
  plano: string | null
  planoRotulo: string | null
  precoMensal: number | null
  creditosCiclo: number | null
  creditsAvailable: number
  cycleMonth: string | null
  ativo: boolean
  promocao: PromocaoStatus
  assinatura: {
    status: string
    plano: string | null
    mercadoPagoId: string | null
    proximaCobranca: string | null
    ultimaCobranca: string | null
    expiracao: string | null
  }
  mpConfigurado: boolean
}

const STATUS_LABEL: Record<string, { label: string; cor: string; fundo: string }> = {
  nenhuma: { label: 'Sem assinatura', cor: 'var(--color-muted)', fundo: 'var(--color-surface-2)' },
  pendente: { label: 'Pagamento pendente', cor: 'var(--color-warning)', fundo: 'var(--color-warning-light)' },
  ativa: { label: 'Assinatura ativa', cor: 'var(--color-success)', fundo: 'var(--color-success-light)' },
  atrasada: { label: 'Pagamento em atraso', cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
  cancelada: { label: 'Assinatura cancelada', cor: 'var(--color-danger)', fundo: 'var(--color-danger-light)' },
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function statusBadge(status: string) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.nenhuma
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: s.fundo, color: s.cor,
      fontSize: FONT.sm, fontWeight: 600,
      padding: '5px 12px', borderRadius: RADIUS.chip,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {s.label}
    </span>
  )
}

export default function Assinatura() {
  const [status, setStatus] = useState<StatusAssinatura | null>(null)
  const [planos, setPlanos] = useState<PlanoAssinatura[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [assinarPlano, setAssinarPlano] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const breakpoint = useBreakpoint()
  const isDesktop = breakpoint === 'desktop'

  const carregar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api.billing.status(),
        api.billing.planos(),
      ])
      setStatus(s)
      setPlanos(p?.planos ?? [])
    } catch (e) {
      setErro((e as Error).message || 'Falha ao carregar assinatura.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const assinar = async (codigo: string) => {
    setAssinarPlano(codigo)
    setErro('')
    try {
      // Fase 7F — 1ª compra promocional: quando o escritório é ELEGÍVEL,
      // o checkout usa a preference avulsa com o valor promocional (50% OFF
      // na 1ª mensalidade); a recorrência integral começa no 2º mês.
      // Lógica pura e testada (promocaoUI.ts); o backend revalida.
      const decisao = decidirCheckoutPromocional(status?.promocao)
      const res = decisao.promocional
        ? await api.billing.checkoutPromocional(codigo)
        : await api.billing.checkout(codigo)
      if (!res.ok) {
        setErro(await getErrorMessage(res, 'Falha ao criar o checkout.'))
        setAssinarPlano(null)
        return
      }
      const data = await res.json()
      if (data?.initPoint) {
        window.location.href = data.initPoint
      } else {
        setErro('O Mercado Pago não retornou a URL de pagamento.')
        setAssinarPlano(null)
      }
    } catch (e) {
      setErro((e as Error).message || 'Falha ao criar o checkout.')
      setAssinarPlano(null)
    }
  }

  const cancelar = async () => {
    if (!window.confirm('Cancelar a assinatura? O escritório será desativado até uma nova assinatura.')) return
    setCancelando(true)
    setErro('')
    try {
      const res = await api.billing.cancelar()
      if (!res.ok) {
        setErro(await getErrorMessage(res, 'Falha ao cancelar a assinatura.'))
        return
      }
      await carregar()
    } catch (e) {
      setErro((e as Error).message || 'Falha ao cancelar a assinatura.')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <Loading />
      </PageContainer>
    )
  }

  const assinatura = status?.assinatura
  const assinaturaAtiva = assinatura?.status === 'ativa'

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Assinatura"
        title="Plano do Escritório"
        description="Gerencie a assinatura mensal e os créditos de IA do seu escritório via Mercado Pago."
        action={status?.mpConfigurado === false ? (
          <span style={{
            background: 'var(--color-warning-light)', color: 'var(--color-warning)',
            fontSize: FONT.sm, fontWeight: 600, padding: '6px 12px', borderRadius: RADIUS.chip,
          }}>
            Mercado Pago não configurado
          </span>
        ) : undefined}
      />

      {erro && (
        <div style={{
          marginTop: SPACE.lg,
          background: 'var(--color-danger-light)', color: 'var(--color-danger)',
          padding: '12px 16px', borderRadius: RADIUS.control, fontSize: FONT.base,
        }} role="alert">
          {erro}
        </div>
      )}

      {/* Fase 7F — Promoção de boas-vindas (1º mês 50% OFF) */}
      {status?.promocao?.ativa === true && status.promocao.elegivel === true && (
        <div style={{
          marginTop: SPACE.lg,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: 'var(--color-accent-light)',
          border: '1px solid var(--color-accent)',
          borderRadius: RADIUS.card,
          padding: '14px 18px',
        }}>
          <span style={{
            background: 'var(--color-accent)', color: 'var(--color-on-accent)',
            fontSize: FONT.xs, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', padding: '4px 10px', borderRadius: RADIUS.chip,
            flexShrink: 0,
          }}>
            Promoção
          </span>
          <div style={{ fontSize: FONT.base, lineHeight: 1.5 }}>
            <strong>{status.promocao.percentual}% OFF na 1ª mensalidade</strong> — sua assinatura
            começa com desconto e a recorrência integral vale a partir do 2º mês.
          </div>
        </div>
      )}
      {status?.promocao?.ativa === true && status.promocao.elegivel === false && status.promocao.motivoIneligibilidade && (
        <div style={{
          marginTop: SPACE.lg,
          background: 'var(--color-surface-2)', color: 'var(--color-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.card,
          padding: '12px 16px', fontSize: FONT.sm,
        }}>
          Promoção de boas-vindas indisponível para este escritório ({status.promocao.motivoIneligibilidade}).
        </div>
      )}

      {/* Estado atual */}
      {status && (
        <div style={{
          marginTop: SPACE.xxl,
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : '1fr',
          gap: SPACE.md,
        }}>
          {[
            { rotulo: 'Plano atual', valor: status.planoRotulo ?? status.plano ?? '—' },
            { rotulo: 'Valor mensal', valor: status.precoMensal ? fmtBRL(status.precoMensal) : '—' },
            { rotulo: 'Créditos do ciclo', valor: `${status.creditsAvailable} / ${status.creditosCiclo ?? '—'}` },
            { rotulo: 'Próxima cobrança', valor: fmtData(assinatura?.proximaCobranca ?? null) },
          ].map(item => (
            <div key={item.rotulo} style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: RADIUS.card,
              padding: '16px 18px',
            }}>
              <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', marginBottom: 6 }}>{item.rotulo}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, letterSpacing: '-0.01em' }}>{item.valor}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status da assinatura */}
      {assinatura && (
        <div style={{
          marginTop: SPACE.lg,
          display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.card,
          padding: '16px 18px',
        }}>
          {statusBadge(assinatura.status)}
          {assinatura.mercadoPagoId && (
            <span style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>
              Assinatura MP: {assinatura.mercadoPagoId}
            </span>
          )}
          {assinaturaAtiva && (
            <Button variant="secondary" size="sm" onClick={cancelar} disabled={cancelando} style={{ marginLeft: 'auto' }}>
              {cancelando ? 'Cancelando…' : 'Cancelar assinatura'}
            </Button>
          )}
        </div>
      )}

      {/* Escolha do plano */}
      <h2 style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400,
        letterSpacing: '-0.02em', margin: `${SPACE.xxl}px 0 ${SPACE.lg}px`,
      }}>
        Escolher / trocar de plano
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
        gap: SPACE.xl,
        alignItems: 'stretch',
      }}>
        {planos.map(plano => {
          const atual = status?.plano === plano.codigo && assinaturaAtiva
          const resumo = resumoPrecoPlano(plano, status?.promocao)
          const promoElegivel = resumo.promocional
          return (
            <div key={plano.codigo} style={{
              display: 'flex', flexDirection: 'column', gap: SPACE.lg,
              background: 'var(--color-surface)',
              border: atual ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
              borderRadius: RADIUS.card,
              padding: '26px 22px',
            }}>
              <div style={{
                alignSelf: 'flex-start',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{
                  background: atual ? 'var(--color-primary)' : 'var(--color-badge-tint)',
                  color: atual ? 'var(--color-on-primary)' : 'var(--color-primary)',
                  fontSize: FONT.xs, fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', padding: '4px 10px', borderRadius: RADIUS.chip,
                }}>
                  {atual ? 'Plano atual' : 'Plano'}
                </span>
                {promoElegivel && (
                  <span style={{
                    background: 'var(--color-accent)', color: 'var(--color-on-accent)',
                    fontSize: FONT.xs, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '4px 10px', borderRadius: RADIUS.chip,
                  }}>
                    {plano.promocao.percentual}% OFF 1º mês
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '-0.02em' }}>
                {plano.rotulo}
              </div>
              {promoElegivel ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '-0.02em' }}>
                      {fmtBRL(plano.promocao.valorPromocional)}
                    </span>
                    <span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>/mês</span>
                  </div>
                  <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)' }}>
                    1ª mensalidade com {plano.promocao.percentual}% OFF
                    <span style={{ textDecoration: 'line-through', marginLeft: 8 }}>{fmtBRL(plano.precoMensal)}</span>
                    <span style={{ marginLeft: 8 }}>depois</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '-0.02em' }}>
                    {fmtBRL(plano.precoMensal)}
                  </span>
                  <span style={{ fontSize: FONT.base, color: 'var(--color-muted)' }}>/mês</span>
                </div>
              )}
              <div style={{
                background: 'var(--color-surface-2)', color: 'var(--color-foreground)',
                fontSize: FONT.md, fontWeight: 600, padding: '8px 12px', borderRadius: RADIUS.control,
                textAlign: 'center',
              }}>
                {plano.creditos} créditos por mês
              </div>
              <Button
                variant={atual ? 'secondary' : 'primary'}
                onClick={() => assinar(plano.codigo)}
                disabled={assinarPlano !== null || !!status?.mpConfigurado === false}
                style={{ width: '100%', padding: '11px', marginTop: 'auto' }}
              >
                {assinarPlano === plano.codigo
                  ? 'Abrindo Mercado Pago…'
                  : atual
                    ? 'Assinatura ativa ✓'
                    : promoElegivel
                      ? `Assinar com ${plano.promocao.percentual}% OFF`
                      : `Assinar ${plano.rotulo}`}
              </Button>
            </div>
          )
        })}
      </div>

      <p style={{
        marginTop: SPACE.xxl, fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.6,
      }}>
        💳 Pagamento recorrente mensal processado pelo Mercado Pago. Ao assinar, você será
        redirecionado para a página de pagamento. O escritório é ativado automaticamente após a
        confirmação do pagamento e desativado em caso de atraso ou cancelamento.
      </p>
    </PageContainer>
  )
}
