import { useState, useEffect } from 'react'
import { api } from '../api/client'

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'Todos' | 'PF' | 'PJ'>('Todos')
  const [showModal, setShowModal] = useState(false)

  // Formulário
  const [tipo, setTipo] = useState<'PF' | 'PJ'>('PF')
  const [nome, setNome] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [qualificacao, setQualificacao] = useState('')

  // Estado de consulta do ViaCEP
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [cepMsg, setCepMsg] = useState('')

  const loadClientes = async () => {
    setLoading(true)
    try {
      const data = await api.clientes.list()
      if (Array.isArray(data)) setClientes(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClientes()
  }, [])

  // Função para buscar endereço por CEP na API publica ViaCEP
  const handleBuscarCep = async (cepInput: string) => {
    setCep(cepInput)
    const cleanCep = cepInput.replace(/\D/g, '')
    if (cleanCep.length === 8) {
      setBuscandoCep(true)
      setCepMsg('Buscando endereço via ViaCEP...')
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        const data = await res.json()
        if (!data.erro) {
          setLogradouro(data.logradouro || '')
          setBairro(data.bairro || '')
          setCidade(data.localidade || '')
          setUf(data.uf || '')
          setCepMsg('✅ Endereço localizado!')
        } else {
          setCepMsg('⚠️ CEP não encontrado.')
        }
      } catch (err) {
        console.error('Erro na consulta ViaCEP:', err)
        setCepMsg('⚠️ Erro ao consultar o ViaCEP.')
      } finally {
        setBuscandoCep(false)
      }
    } else {
      setCepMsg('')
    }
  }

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return

    const qualifText = qualificacao.trim() || (tipo === 'PF' 
      ? `brasileiro(a), inscrito(a) no CPF sob o nº ${cpfCnpj || '000.000.000-00'}, residente e domiciliado(a) na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}, CEP ${cep || '00000-000'}`
      : `pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cpfCnpj || '00.000.000/0001-00'}, com sede na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}`)

    try {
      await api.clientes.create({
        tipo,
        nome,
        cpfCnpj,
        email,
        telefone,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        qualificacao: qualifText
      })
      setShowModal(false)
      resetForm()
      loadClientes()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteCliente = async (id: string) => {
    try {
      await api.clientes.delete(id)
      loadClientes()
    } catch (e) {
      console.error(e)
    }
  }

  const resetForm = () => {
    setTipo('PF')
    setNome('')
    setCpfCnpj('')
    setEmail('')
    setTelefone('')
    setCep('')
    setLogradouro('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('')
    setQualificacao('')
    setCepMsg('')
  }

  const filtered = clientes.filter(c => {
    const matchTipo = tipoFilter === 'Todos' || c.tipo === tipoFilter
    const matchSearch = !search || c.nome.toLowerCase().includes(search.toLowerCase()) || (c.cpfCnpj && c.cpfCnpj.includes(search))
    return matchTipo && matchSearch
  })

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1150, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 4 }}>
            CADASTRO E PRONTUÁRIO DE CLIENTES
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, margin: 0, fontWeight: 400, letterSpacing: '-0.02em' }}>
            Gestão de Clientes
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 4 }}>
            Cadastro unificado de pessoas físicas e jurídicas com consulta automática de CEP via ViaCEP.
          </p>
        </div>

        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Novo Cliente
        </button>
      </div>

      {/* Barra de Filtros */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou CNPJ..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 14px 9px 36px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, background: 'var(--color-surface)', outline: 'none' }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13 }}>🔍</span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {(['Todos', 'PF', 'PJ'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipoFilter(t)}
              style={{
                padding: '7px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: '1px solid var(--color-border)', cursor: 'pointer',
                background: tipoFilter === t ? 'var(--color-primary)' : 'var(--color-surface)',
                color: tipoFilter === t ? '#fff' : 'var(--color-muted)'
              }}
            >
              {t === 'Todos' ? 'Todos os Clientes' : t === 'PF' ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Clientes */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)' }}>
              {['Tipo', 'Nome do Cliente', 'CPF / CNPJ', 'Contato / Email', 'Endereço (Cidade/UF)', 'Ações'].map(h => (
                <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-muted)' }}>Carregando clientes...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--color-muted)' }}>Nenhum cliente cadastrado.</td></tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: c.tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-accent)', color: '#fff' }}>
                      {c.tipo}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                    {c.qualificacao && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2, maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.qualificacao}</div>}
                  </td>
                  <td style={{ padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.cpfCnpj}</td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 12 }}>{c.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{c.telefone}</div>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 12 }}>
                    {c.cidade ? `${c.cidade}/${c.uf}` : '—'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <button
                      onClick={() => handleDeleteCliente(c.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: 14 }}
                      title="Excluir cliente"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Novo Cliente com ViaCEP */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: 32, width: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)' }}>Cadastrar Novo Cliente</h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--color-muted)' }}>×</button>
            </div>

            <form onSubmit={handleSaveCliente} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Tipo PF ou PJ */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setTipo('PF')}
                  style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--color-border)', background: tipo === 'PF' ? 'var(--color-primary)' : 'var(--color-surface)', color: tipo === 'PF' ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  👤 Pessoa Física (PF)
                </button>
                <button
                  type="button"
                  onClick={() => setTipo('PJ')}
                  style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--color-border)', background: tipo === 'PJ' ? 'var(--color-primary)' : 'var(--color-surface)', color: tipo === 'PJ' ? '#fff' : 'var(--color-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  🏢 Pessoa Jurídica (PJ)
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>NOME COMPLETO OU RAZÃO SOCIAL</label>
                  <input required type="text" placeholder="Ex: Fernanda Oliveira" value={nome} onChange={e => setNome(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
                </div>

                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>{tipo === 'PF' ? 'CPF' : 'CNPJ'}</label>
                  <input type="text" placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'} value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)' }} />
                </div>

                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>TELEFONE / WHATSAPP</label>
                  <input type="text" placeholder="(11) 98877-6655" value={telefone} onChange={e => setTelefone(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>EMAIL</label>
                  <input type="email" placeholder="cliente@email.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>

              {/* Seção Endereço com Busca por CEP via ViaCEP */}
              <div style={{ background: 'var(--color-background)', border: '1px solid var(--color-border)', padding: 14, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.05em' }}>📍 ENDEREÇO (CONSULTA VIA VIACEP)</label>
                  {cepMsg && <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 500 }}>{cepMsg}</span>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px', gap: 10 }}>
                  <div>
                    <input type="text" placeholder="CEP (00000-000)" value={cep} onChange={e => handleBuscarCep(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <div>
                    <input type="text" placeholder="Rua / Avenida / Logradouro" value={logradouro} onChange={e => setLogradouro(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12 }} />
                  </div>
                  <div>
                    <input type="text" placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12 }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: 10 }}>
                  <input type="text" placeholder="Bairro" value={bairro} onChange={e => setBairro(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12 }} />
                  <input type="text" placeholder="Cidade / Município" value={cidade} onChange={e => setCidade(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12 }} />
                  <input type="text" placeholder="UF" value={uf} onChange={e => setUf(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 12, textTransform: 'uppercase' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>QUALIFICAÇÃO JURÍDICA COMPLETA PARA PETIÇÕES (AUTOPREENCHIDA)</label>
                <textarea
                  value={qualificacao}
                  onChange={e => setQualificacao(e.target.value)}
                  placeholder="Ex: brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 000.000.000-00..."
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 11, outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '8px 16px', border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', border: 'none', background: 'var(--color-primary)', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Salvar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
