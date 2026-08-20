import { useState } from 'react'
import { api, getErrorMessage } from '../api/client'
import { Button, FONT, Field, inputStyle, RADIUS, SPACE } from '../ui'
import { useBreakpoint } from '../hooks/useBreakpoint'

// Tipografia do hero — exceção de marketing permitida (46px).
const HERO_FONT_SIZE = 46

// UFs brasileiras para o cadastro da OAB (registro nacional).
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

// Máscaras: mantêm apenas os dígitos e reformatam, o que suporta colagem
// (onChange recebe o texto inteiro) e nunca "trava" o backspace (um caractere a menos = um dígito a menos).
const onlyDigits = (v: string) => v.replace(/\D/g, '')

const maskCnpj = (v: string): string => {
  const d = onlyDigits(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

const maskTelefone = (v: string): string => {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  paddingBottom: SPACE.xs,
  borderBottom: '1px solid var(--color-border)',
}

interface CadastroValues {
  nome: string
  email: string
  senha: string
  confirmarSenha: string
  oab: string
  oabUf: string
  escritorioNome: string
  cnpj: string
  telefone: string
}

const CADASTRO_INICIAL: CadastroValues = {
  nome: '', email: '', senha: '', confirmarSenha: '', oab: '', oabUf: '', escritorioNome: '', cnpj: '', telefone: '',
}

interface LandingPageProps {
  onLoginSuccess: (user: { name: string; role: string; email: string }) => void
}

function CadastroSucesso({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: '12px 0 4px', gap: SPACE.lg,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: 'var(--color-success-light)',
        border: '1px solid var(--color-success)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 13l4 4L19 7" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, letterSpacing: '-0.02em', margin: 0 }}>
        Cadastro recebido
      </h3>
      <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', lineHeight: 1.6, margin: 0, maxWidth: 340 }}>
        Cadastro recebido com sucesso. Seu acesso será habilitado em breve pelo administrador da plataforma.
      </p>
      <Button onClick={onBackToLogin} style={{ marginTop: SPACE.xs }}>
        Entrar
      </Button>
    </div>
  )
}

function CadastroForm({ isMobile, onSuccess }: { isMobile: boolean; onSuccess: () => void }) {
  const [values, setValues] = useState<CadastroValues>(CADASTRO_INICIAL)
  const [errors, setErrors] = useState<Partial<Record<keyof CadastroValues, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof CadastroValues, boolean>>>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = (v: CadastroValues): Partial<Record<keyof CadastroValues, string>> => {
    const e: Partial<Record<keyof CadastroValues, string>> = {}
    if (!v.nome.trim()) e.nome = 'Informe seu nome completo.'
    if (!v.email.trim()) e.email = 'Informe seu e-mail.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'E-mail inválido.'
    if (!v.senha) e.senha = 'Informe uma senha.'
    else if (v.senha.length < 8) e.senha = 'A senha deve ter no mínimo 8 caracteres.'
    if (!v.confirmarSenha) e.confirmarSenha = 'Confirme sua senha.'
    else if (v.confirmarSenha !== v.senha) e.confirmarSenha = 'As senhas não coincidem.'
    if (!v.oab.trim()) e.oab = 'Informe o número da OAB.'
    else if (v.oab.trim().length < 4) e.oab = 'Número da OAB inválido.'
    if (!v.oabUf) e.oabUf = 'Selecione a UF.'
    if (!v.escritorioNome.trim()) e.escritorioNome = 'Informe o nome do escritório.'
    return e
  }

  const setField = (field: keyof CadastroValues, raw: string, transform?: (v: string) => string) => {
    const next = transform ? transform(raw) : raw
    const updated = { ...values, [field]: next }
    setValues(updated)
    if (touched[field]) {
      const nextErrors = validate(updated)
      setErrors(prev => ({ ...prev, [field]: nextErrors[field] }))
    }
  }

  const handleBlur = (field: keyof CadastroValues) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    const nextErrors = validate(values)
    setErrors(prev => ({ ...prev, [field]: nextErrors[field] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    const nextErrors = validate(values)
    setErrors(nextErrors)
    const allTouched = (Object.keys(CADASTRO_INICIAL) as (keyof CadastroValues)[]).reduce<Partial<Record<keyof CadastroValues, boolean>>>((acc, k) => {
      acc[k] = true
      return acc
    }, {})
    setTouched(allTouched)
    if (Object.keys(nextErrors).length > 0) return

    setLoading(true)
    try {
      const res = await api.auth.registro({
        nome: values.nome.trim(),
        email: values.email.trim(),
        senha: values.senha,
        oab: values.oab.trim(),
        oabUf: values.oabUf.toUpperCase(),
        escritorioNome: values.escritorioNome.trim(),
        cnpj: values.cnpj ? onlyDigits(values.cnpj) : undefined,
        telefone: values.telefone ? onlyDigits(values.telefone) : undefined,
      })
      if (!res.ok) {
        setSubmitError(await getErrorMessage(res, 'Não foi possível concluir o cadastro. Tente novamente.'))
        return
      }
      onSuccess()
    } catch (err: any) {
      setSubmitError(err?.message || 'Não foi possível concluir o cadastro. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
    gap: SPACE.md,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xl }}>
      {submitError && (
        <div style={{
          background: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.control,
          padding: '12px 14px',
          fontSize: FONT.base,
          fontWeight: 500,
        }}>
          ⚠️ {submitError}
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <div style={sectionLabelStyle}>Dados do advogado</div>
        <div style={gridStyle}>
          <Field label="Nome completo" error={errors.nome} required>
            <input type="text" autoComplete="name" placeholder="Maria Silva" value={values.nome}
              onChange={e => setField('nome', e.target.value)} onBlur={() => handleBlur('nome')}
              style={inputStyle(!!errors.nome)} />
          </Field>
          <Field label="E-mail" error={errors.email} required>
            <input type="email" autoComplete="email" placeholder="voce@escritorio.com" value={values.email}
              onChange={e => setField('email', e.target.value)} onBlur={() => handleBlur('email')}
              style={inputStyle(!!errors.email)} />
          </Field>
          <Field label="Senha" error={errors.senha} required>
            <input type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={values.senha}
              onChange={e => setField('senha', e.target.value)} onBlur={() => handleBlur('senha')}
              style={inputStyle(!!errors.senha)} />
          </Field>
          <Field label="Confirmar senha" error={errors.confirmarSenha} required>
            <input type="password" autoComplete="new-password" placeholder="Repita a senha" value={values.confirmarSenha}
              onChange={e => setField('confirmarSenha', e.target.value)} onBlur={() => handleBlur('confirmarSenha')}
              style={inputStyle(!!errors.confirmarSenha)} />
          </Field>
          <Field label="Nº OAB" error={errors.oab} required>
            <input type="text" maxLength={20} placeholder="Ex.: 123456" value={values.oab}
              onChange={e => setField('oab', e.target.value)} onBlur={() => handleBlur('oab')}
              style={inputStyle(!!errors.oab)} />
          </Field>
          <Field label="UF da OAB" error={errors.oabUf} required>
            <select value={values.oabUf}
              onChange={e => setField('oabUf', e.target.value)} onBlur={() => handleBlur('oabUf')}
              style={inputStyle(!!errors.oabUf)}>
              <option value="">Selecione</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <div style={sectionLabelStyle}>Dados do escritório</div>
        <div style={gridStyle}>
          <Field label="Nome do escritório" error={errors.escritorioNome} required>
            <input type="text" autoComplete="organization" placeholder="Silva & Advogados" value={values.escritorioNome}
              onChange={e => setField('escritorioNome', e.target.value)} onBlur={() => handleBlur('escritorioNome')}
              style={inputStyle(!!errors.escritorioNome)} />
          </Field>
          <Field label="CNPJ (opcional)" error={errors.cnpj}>
            <input type="text" inputMode="numeric" placeholder="00.000.000/0000-00" value={values.cnpj}
              onChange={e => setField('cnpj', e.target.value, maskCnpj)} onBlur={() => handleBlur('cnpj')}
              style={inputStyle(!!errors.cnpj)} />
          </Field>
          <Field label="Telefone (opcional)" error={errors.telefone}>
            <input type="tel" inputMode="tel" placeholder="(00) 00000-0000" value={values.telefone}
              onChange={e => setField('telefone', e.target.value, maskTelefone)} onBlur={() => handleBlur('telefone')}
              style={inputStyle(!!errors.telefone)} />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={loading} style={{ width: '100%', padding: '13px' }}>
        {loading ? 'Enviando cadastro…' : 'Solicitar acesso →'}
      </Button>

      <p style={{ fontSize: FONT.sm, color: 'var(--color-muted)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
        Seus dados pessoais e do escritório são tratados em conformidade com a LGPD (Lei nº 13.709/2018) e utilizados exclusivamente para a prestação dos serviços da plataforma.
      </p>
    </form>
  )
}

export default function LandingPage({ onLoginSuccess }: LandingPageProps) {
  const breakpoint = useBreakpoint()
  const isMobile = breakpoint === 'mobile'
  const isTablet = breakpoint === 'tablet'
  const isDesktop = breakpoint === 'desktop'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [cadastroConcluido, setCadastroConcluido] = useState(false)

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m)
    setCadastroConcluido(false)
  }

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
        lineHeight: 1.5,
        borderBottom: '1px solid color-mix(in srgb, var(--color-on-primary) 10%, transparent)'
      }}>
        ✨ <strong style={{ color: 'var(--color-accent)' }}>SmartJuris v2.5 (LexOS Edition)</strong> — A Primeira Plataforma Jurídica com IA Nativa e Validação Auditável do Brasil.
      </div>

      {/* Navbar Minimalista Swiss */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: isMobile ? '16px 20px' : isTablet ? '18px 32px' : '20px 48px',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, minWidth: 0 }}>
          {/* Logo SVG Elegante: Balança da Justiça + Tecnologia IA */}
          <div style={{
            width: 40, height: 40, borderRadius: RADIUS.card,
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
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
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: FONT.cardTitle, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              SmartJuris <span style={{ color: 'var(--color-accent)', fontSize: FONT.lg }}>LexOS</span>
            </div>
            <div style={{ fontSize: FONT.xs, color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2, lineHeight: 1.4 }}>
              Inteligência Jurídica & Gestão Integrada
            </div>
          </div>
        </div>

        {isDesktop && (
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
        gridTemplateColumns: isDesktop ? '1fr 440px' : '1fr',
        maxWidth: 1240,
        margin: '0 auto',
        width: '100%',
        padding: isMobile ? '32px 20px' : isTablet ? '40px 32px' : '50px 48px',
        gap: isMobile ? 32 : isTablet ? 40 : 56,
        alignItems: 'center'
      }}>
        {/* Lado Esquerdo: Marca, Posicionamento e Ilustração SVG de Advogados */}
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--color-badge-tint)', color: 'var(--color-primary)',
            padding: '6px 12px', borderRadius: 20, fontSize: FONT.sm, fontWeight: 600,
            marginBottom: SPACE.xl, border: '1px solid var(--color-border)',
            flexWrap: 'wrap'
          }}>
            <span>⚖️</span> Peticionamento, Contratos e Jurimetria sem Alucinações
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: `clamp(30px, 7.5vw, ${HERO_FONT_SIZE}px)`,
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
            flexDirection: isDesktop ? 'row' : 'column',
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: SPACE.lg }}>
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
          <p style={{ fontSize: FONT.base, color: 'var(--color-muted)', marginBottom: SPACE.lg }}>
            {mode === 'login'
              ? 'Digite suas credenciais de advogado ou administrador.'
              : 'Solicite o acesso do seu escritório. A aprovação é feita pelo administrador da plataforma.'}
          </p>

          {/* Toggle Entrar / Criar conta */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 4,
            padding: 4,
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: RADIUS.control,
            marginBottom: SPACE.xxl,
          }}>
            {(['login', 'signup'] as const).map(m => {
              const active = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  style={{
                    padding: '9px 0',
                    border: 'none',
                    borderRadius: RADIUS.chip,
                    cursor: 'pointer',
                    fontSize: FONT.md,
                    fontWeight: 600,
                    background: active ? 'var(--color-surface)' : 'transparent',
                    color: active ? 'var(--color-primary)' : 'var(--color-muted)',
                    boxShadow: active ? '0 1px 3px color-mix(in srgb, var(--color-foreground) 12%, transparent)' : 'none',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                >
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              )
            })}
          </div>

          {mode === 'login' ? (
            <>
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
            </>
          ) : cadastroConcluido ? (
            <CadastroSucesso onBackToLogin={() => switchMode('login')} />
          ) : (
            <CadastroForm isMobile={isMobile} onSuccess={() => setCadastroConcluido(true)} />
          )}
        </div>
      </main>

      {/* Footer Swiss */}
      <footer style={{
        padding: isMobile ? '24px 20px' : isTablet ? '24px 32px' : '24px 48px',
        borderTop: '1px solid var(--color-border)',
        textAlign: 'center',
        fontSize: FONT.sm,
        lineHeight: 1.6,
        color: 'var(--color-muted)',
        background: 'var(--color-surface)'
      }}>
        © {new Date().getFullYear()} SmartJuris LexOS. Inteligência Artificial Jurídica & Gestão para Advocacia Contemporânea. Suporte Técnico via WhatsApp: <a href="https://wa.me/5588993573809" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>88 99357-3809</a>. Estética Vignelli.
      </footer>
    </div>
  )
}
