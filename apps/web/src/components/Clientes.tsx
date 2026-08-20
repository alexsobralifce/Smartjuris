import { useState, useEffect } from 'react'
import { api, getErrorMessage } from '../api/client'
import { maskCpfCnpj, maskCEP, maskPhone, isValidEmail } from '../utils/masks'
import Toast, { ToastMessage } from './Toast'
import Pagination, { usePagination } from './Pagination'

const initialClientes = [
  {
    id: 'c1',
    tipo: 'PF',
    nome: 'Fernanda Oliveira',
    cpfCnpj: '321.654.987-00',
    email: 'fernanda.oliveira@email.com',
    telefone: '(11) 98765-4321',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, solteira, auxiliar administrativa, inscrita no CPF sob o nº 321.654.987-00, residente e domiciliada na Praça da Sé, nº 100, Sé, São Paulo/SP, CEP 01001-000'
  },
  {
    id: 'c2',
    tipo: 'PF',
    nome: 'Roberto Souza',
    cpfCnpj: '123.456.789-11',
    email: 'roberto.souza@email.com',
    telefone: '(11) 97654-3210',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileiro, casado, engenheiro civil, inscrito no CPF sob o nº 123.456.789-11, residente e domiciliado na Rua Vergueiro, nº 500, Vila Mariana, São Paulo/SP, CEP 04001-000'
  },
  {
    id: 'c3',
    tipo: 'PJ',
    nome: 'Construtora Alfa',
    cpfCnpj: '12.345.678/0001-99',
    email: 'contato@construtoraalfa.com.br',
    telefone: '(11) 3344-5566',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-99, com sede na Avenida Paulista, nº 1500, Conj 81, Bela Vista, São Paulo/SP, CEP 01310-100'
  },
  {
    id: 'c4',
    tipo: 'PF',
    nome: 'Lúcia Ferreira',
    cpfCnpj: '456.789.012-33',
    email: 'lucia.ferreira@email.com',
    telefone: '(11) 96543-2109',
    cidade: 'São Paulo',
    uf: 'SP',
    qualificacao: 'brasileira, viúva, aposentada, inscrita no CPF sob o nº 456.789.012-33, residente e domiciliada na Rua Teodoro Sampaio, nº 800, Pinheiros, São Paulo/SP, CEP 05401-000'
  },
  {
    id: 'c5',
    tipo: 'PJ',
    nome: 'Indústria Metalúrgica Sul',
    cpfCnpj: '98.765.432/0001-10',
    email: 'diretoria@metalsul.com.br',
    telefone: '(11) 4004-9988',
    cidade: 'Santo André',
    uf: 'SP',
    qualificacao: 'pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 98.765.432/0001-10, com sede na Avenida Industrial, nº 2000, Santo André/SP, CEP 09010-000'
  }
]

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>(initialClientes)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<'Todos' | 'PF' | 'PJ'>('Todos')
  const [showModal, setShowModal] = useState(false)

  // Sistema de Mensageria / Toast
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }
  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

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
  const [dataNascimento, setDataNascimento] = useState('')

  // Erros de validação inline
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      setClientes([])
      addToast('error', 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadClientes()
  }, [])

  // Função para buscar endereço por CEP na API publica ViaCEP
  const handleBuscarCep = async (cepInput: string) => {
    const masked = maskCEP(cepInput)
    setCep(masked)
    const cleanCep = masked.replace(/\D/g, '')
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

    // Validação estrita dos campos obrigatórios
    const newErrors: Record<string, string> = {}
    if (tipo === 'PF' && dataNascimento && new Date(dataNascimento) > new Date()) {
      newErrors.dataNascimento = 'A data de nascimento não pode ser futura.'
    }
    if (!nome.trim()) newErrors.nome = 'O Nome / Razão Social é obrigatório.'
    if (!cpfCnpj.trim()) newErrors.cpfCnpj = `O ${tipo === 'PF' ? 'CPF' : 'CNPJ'} é obrigatório.`
    if (email.trim() && !isValidEmail(email)) newErrors.email = 'Insira um e-mail válido.'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      const msg = Object.values(newErrors)[0]
      addToast('error', msg)
      return
    }

    setErrors({})

    const qualifText = qualificacao.trim() || (tipo === 'PF' 
      ? `brasileiro(a), inscrito(a) no CPF sob o nº ${cpfCnpj}, residente e domiciliado(a) na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}, CEP ${cep || '00000-000'}`
      : `pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${cpfCnpj}, com sede na ${logradouro || 'Rua'}, nº ${numero || 'S/N'}, ${bairro || 'Bairro'}, ${cidade || 'São Paulo'}/${uf || 'SP'}`)

    try {
      const res = await api.clientes.create({
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
        qualificacao: qualifText,
        dataNascimento: tipo === 'PF' ? dataNascimento : undefined
      })
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao salvar cliente no banco de dados.'))
        return
      }
      setShowModal(false)
      resetForm()
      addToast('success', 'Cliente cadastrado com sucesso!')
      loadClientes()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao salvar cliente no banco de dados.')
    }
  }

  const handleDeleteCliente = async (id: string) => {
    try {
      const res = await api.clientes.delete(id)
      if (!res.ok) {
        addToast('error', await getErrorMessage(res, 'Erro ao remover cliente.'))
        return
      }
      addToast('info', 'Cliente removido.')
      loadClientes()
    } catch (e) {
      console.error(e)
      addToast('error', 'Erro ao remover cliente.')
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
    setDataNascimento('')
    setCepMsg('')
  }

  const filtered = clientes.filter(c => {
    const matchTipo = tipoFilter === 'Todos' || c.tipo === tipoFilter
    const matchSearch = !search || c.nome.toLowerCase().includes(search.toLowerCase()) || (c.cpfCnpj && c.cpfCnpj.includes(search))
    return matchTipo && matchSearch
  })

  const clientesPagination = usePagination(filtered, 10)

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
              clientesPagination.pageItems.map(c => (
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
        <Pagination {...clientesPagination} onPageChange={clientesPagination.setPage} />
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
                  <label style={{ fontSize: 10, fontWeight: 600, color: errors.nome ? 'var(--color-danger)' : 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Nome completo ou razão social *</label>
                  <input
                    type="text"
                    placeholder="Ex: Fernanda Oliveira"
                    value={nome}
                    onChange={e => {
                      setNome(e.target.value)
                      if (errors.nome) setErrors(prev => ({ ...prev, nome: '' }))
                    }}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: errors.nome ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
                      borderRadius: 6, fontSize: 13, background: 'var(--color-surface)'
                    }}
                  />
                  {errors.nome && <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 2, display: 'block' }}>⚠️ {errors.nome}</span>}
                </div>

                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: errors.cpfCnpj ? 'var(--color-danger)' : 'var(--color-muted)', display: 'block', marginBottom: 4 }}>{tipo === 'PF' ? 'CPF *' : 'CNPJ *'}</label>
                  <input
                    type="text"
                    placeholder={tipo === 'PF' ? '000.000.000-00' : '00.000.000/0001-00'}
                    value={cpfCnpj}
                    onChange={e => {
                      setCpfCnpj(maskCpfCnpj(e.target.value, tipo))
                      if (errors.cpfCnpj) setErrors(prev => ({ ...prev, cpfCnpj: '' }))
                    }}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: errors.cpfCnpj ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
                      borderRadius: 6, fontSize: 13, fontFamily: 'var(--font-mono)', background: 'var(--color-surface)'
                    }}
                  />
                  {errors.cpfCnpj && <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 2, display: 'block' }}>⚠️ {errors.cpfCnpj}</span>}
                </div>

                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="(11) 98877-6655"
                    value={telefone}
                    onChange={e => setTelefone(maskPhone(e.target.value))}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: errors.email ? 'var(--color-danger)' : 'var(--color-muted)', display: 'block', marginBottom: 4 }}>E-mail institucional</label>
                  <input
                    type="email"
                    placeholder="cliente@email.com"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      if (errors.email) setErrors(prev => ({ ...prev, email: '' }))
                    }}
                    style={{
                      width: '100%', padding: '9px 12px',
                      border: errors.email ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
                      borderRadius: 6, fontSize: 13
                    }}
                  />
                  {errors.email && <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 2, display: 'block' }}>⚠️ {errors.email}</span>}
                </div>

                {tipo === 'PF' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: errors.dataNascimento ? 'var(--color-danger)' : 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Data de Nascimento</label>
                    <input
                      type="date"
                      value={dataNascimento}
                      onChange={e => {
                        setDataNascimento(e.target.value)
                        if (errors.dataNascimento) setErrors(prev => ({ ...prev, dataNascimento: '' }))
                      }}
                      style={{
                        width: '100%', padding: '9px 12px',
                        border: errors.dataNascimento ? '1.5px solid var(--color-danger)' : '1px solid var(--color-border)',
                        borderRadius: 6, fontSize: 13, background: 'var(--color-surface)'
                      }}
                    />
                    {errors.dataNascimento && <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 2, display: 'block' }}>⚠️ {errors.dataNascimento}</span>}
                  </div>
                )}
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
                <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>Qualificação jurídica completa para petições (autopreenchida)</label>
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

      {/* Componente Toast de Mensageria Flutuante */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
