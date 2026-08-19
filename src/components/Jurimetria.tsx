import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const taxaSucesso = [
  { mes: 'Fev', taxa: 78 }, { mes: 'Mar', taxa: 82 }, { mes: 'Abr', taxa: 80 },
  { mes: 'Mai', taxa: 85 }, { mes: 'Jun', taxa: 88 }, { mes: 'Jul', taxa: 87 },
  { mes: 'Ago', taxa: 91 },
]

const porArea = [
  { area: 'Trabalhista', processos: 58, sucesso: 89 },
  { area: 'Cível', processos: 47, sucesso: 74 },
  { area: 'Tributário', processos: 29, sucesso: 86 },
  { area: 'Previdenciário', processos: 13, sucesso: 92 },
]

const distribuicao = [
  { name: 'Trabalhista', value: 58, color: '#1a2744' },
  { name: 'Cível', value: 47, color: '#c8a84b' },
  { name: 'Tributário', value: 29, color: '#2d6a4f' },
  { name: 'Previdenciário', value: 13, color: '#6b7280' },
]

const previsoes = [
  { processo: '0001234-56.2024.5.02.0001', tipo: 'Reclamação Trabalhista', cliente: 'Fernanda Oliveira', chance: 84, prazo: '6–12 meses', valor: 'R$ 87.500' },
  { processo: '0009876-12.2024.8.26.0100', tipo: 'Ação de Cobrança', cliente: 'Construtora Alfa', chance: 71, prazo: '12–18 meses', valor: 'R$ 420.000' },
  { processo: '0005432-78.2024.4.03.6100', tipo: 'Mandado de Segurança', cliente: 'Importadora Beta', chance: 79, prazo: '3–6 meses', valor: 'R$ 1.250.000' },
  { processo: '0007654-32.2024.5.15.0001', tipo: 'Rescisão Indireta', cliente: 'Paulo Fernandes', chance: 91, prazo: '4–8 meses', valor: 'R$ 124.000' },
]

function ChanceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'var(--color-success)' : value >= 65 ? 'var(--color-accent)' : 'var(--color-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }}/>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color, minWidth: 32 }}>{value}%</span>
    </div>
  )
}

export default function Jurimetria() {
  const [activeTab, setActiveTab] = useState<'overview' | 'previsao'>('overview')

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, letterSpacing: '-0.02em' }}>Jurimetria & Analytics</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 2 }}>Inteligência sobre processos · Período: Jan–Ago 2026</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['overview', 'previsao'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--color-border)', cursor: 'pointer',
              background: activeTab === t ? 'var(--color-primary)' : 'var(--color-surface)',
              color: activeTab === t ? '#fff' : 'var(--color-muted)',
            }}>
              {t === 'overview' ? 'Visão Geral' : 'Previsão de Êxito'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Taxa de Êxito Geral', value: '87%', sub: 'vs. 79% média mercado' },
              { label: 'Tempo Médio Encerramento', value: '11,4 m', sub: 'Trabalhista: 8,2m' },
              { label: 'Valor Recuperado (2026)', value: 'R$ 3,2M', sub: 'Contencioso ativo' },
              { label: 'Peças por Processo', value: '4,7', sub: 'Média do escritório' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '18px 20px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>{k.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-success)', marginTop: 6 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, marginBottom: 18 }}>
            {/* Line chart */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Taxa de Êxito Mensal (%)</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={taxaSucesso}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="taxa" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Pie */}
            <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px' }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Distribuição por Área</div>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={distribuicao} cx="50%" cy="50%" outerRadius={60} dataKey="value" strokeWidth={0}>
                    {distribuicao.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {distribuicao.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color }}/>
                      <span style={{ fontSize: 12 }}>{d.name}</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>{d.value} proc.</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '20px 20px 12px' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 20 }}>Taxa de Êxito por Área do Direito (%)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={porArea} barSize={36}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="area" tick={{ fontSize: 12, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 6 }} />
                <Bar dataKey="sucesso" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Taxa de Êxito (%)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {activeTab === 'previsao' && (
        <div>
          <div style={{ background: 'var(--color-accent-light)', border: '1px solid var(--color-accent)', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
            <strong>Modelo preditivo:</strong> Random Forest treinado em 12.847 processos históricos. Acurácia: 85%. Variáveis: tipo de ação, vara, perfil das partes, jurisprudência prevalente.
          </div>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Processo', 'Tipo / Cliente', 'Valor da Causa', 'Prazo Estimado', 'Probabilidade de Êxito'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previsoes.map(p => (
                  <tr key={p.processo} style={{ borderTop: '1px solid var(--color-border)' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-surface-2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  >
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-muted)' }}>{p.processo.slice(0, 18)}...</td>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.tipo}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>{p.cliente}</div>
                    </td>
                    <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.valor}</td>
                    <td style={{ padding: '14px 20px', fontSize: 12, color: 'var(--color-muted)' }}>{p.prazo}</td>
                    <td style={{ padding: '14px 20px', minWidth: 200 }}>
                      <ChanceBar value={p.chance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
