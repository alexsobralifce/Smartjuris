import { useState } from 'react'
import { api } from '../api/client'
import Toast, { ToastMessage } from './Toast'
import { Button, FONT, Field, inputStyle, RADIUS, SPACE, useIsMobile } from '../ui'

interface TrocarSenhaProps {
  user: { name: string; email: string; role: string; [key: string]: any }
  onSuccess: (newUser: any) => void
}

export default function TrocarSenha({ user, onSuccess }: TrocarSenhaProps) {
  const isMobile = useIsMobile()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [errors, setErrors] = useState<{ senhaAtual?: string; novaSenha?: string; confirmar?: string }>({})
  const [loading, setLoading] = useState(false)

  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const addToast = (type: 'error' | 'success' | 'warning' | 'info', text: string) => {
    const id = String(Date.now())
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500)
  }
  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  const validate = () => {
    const next: typeof errors = {}
    if (!senhaAtual.trim()) next.senhaAtual = 'Informe sua senha atual.'
    if (novaSenha.length < 8) next.novaSenha = 'A nova senha deve ter no mínimo 8 caracteres.'
    if (!confirmar) next.confirmar = 'Confirme a nova senha.'
    else if (confirmar !== novaSenha) next.confirmar = 'As senhas não coincidem.'
    return next
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setLoading(true)
    try {
      // Fase 7 implementará o endpoint — shape esperado:
      // POST /api/auth/trocar-senha { senhaAtual, novaSenha } → { user }
      const res = await api.auth.trocarSenha(senhaAtual, novaSenha)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = data?.code
        if (code === 'SENHA_ATUAL_INCORRETA' || code === 'PASSWORD_CHANGE_REQUIRED' || res.status === 403 || res.status === 401) {
          addToast('error', data?.error || 'Senha atual incorreta. Verifique e tente novamente.')
        } else {
          addToast('error', data?.error || 'Não foi possível atualizar a senha.')
        }
        return
      }
      addToast('success', 'Senha atualizada com sucesso')
      onSuccess(data?.user ?? { ...user, precisaTrocarSenha: false })
    } catch {
      addToast('error', 'Não foi possível atualizar a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const firstName = (user?.name || 'Advogado').split(' ')[0]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-background)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      color: 'var(--color-foreground)',
    }}>
      {/* Barra superior da marca */}
      <div style={{
        background: 'var(--color-primary)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid var(--color-primary-hover)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <div style={{
            width: 26, height: 26, borderRadius: RADIUS.control,
            background: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="var(--color-on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-display)', color: 'var(--color-on-primary)', fontSize: FONT.lg, letterSpacing: '-0.02em' }}>
            SmartJuris <span style={{ color: 'var(--color-accent)', fontSize: FONT.base }}>LexOS</span>
          </span>
        </div>
      </div>

      {/* Card centralizado */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '24px 16px' : '40px 20px' }}>
        <div style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: RADIUS.card,
          padding: isMobile ? '28px 20px' : '40px 40px 36px',
        }}>
          {/* Ícone de segurança */}
          <div style={{
            width: 40, height: 40, borderRadius: RADIUS.card,
            background: 'var(--color-badge-tint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-primary)',
            marginBottom: SPACE.lg,
          }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: FONT.pageTitle,
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
            fontWeight: 400,
            lineHeight: 1.15,
          }}>
            Bem-vindo — defina sua nova senha
          </h1>

          <p style={{ color: 'var(--color-muted)', fontSize: FONT.md, margin: '0 0 6px', lineHeight: 1.55 }}>
            Olá, <strong style={{ color: 'var(--color-foreground)', fontWeight: 600 }}>{firstName}</strong>. Por segurança, crie uma nova senha antes de acessar o sistema.
          </p>
          <div style={{ fontSize: FONT.sm, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', marginBottom: SPACE.xxl }}>
            {user?.email}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
            <Field label="Senha atual" error={errors.senhaAtual}>
              <input
                type="password"
                value={senhaAtual}
                onChange={e => {
                  setSenhaAtual(e.target.value)
                  if (errors.senhaAtual) setErrors(p => ({ ...p, senhaAtual: undefined }))
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
                style={inputStyle(!!errors.senhaAtual)}
              />
            </Field>

            <Field label="Nova senha" error={errors.novaSenha}>
              <input
                type="password"
                value={novaSenha}
                onChange={e => {
                  setNovaSenha(e.target.value)
                  if (errors.novaSenha) setErrors(p => ({ ...p, novaSenha: undefined }))
                }}
                placeholder="Mínimo de 8 caracteres"
                autoComplete="new-password"
                style={inputStyle(!!errors.novaSenha)}
              />
            </Field>

            <Field label="Confirmar nova senha" error={errors.confirmar}>
              <input
                type="password"
                value={confirmar}
                onChange={e => {
                  setConfirmar(e.target.value)
                  if (errors.confirmar) setErrors(p => ({ ...p, confirmar: undefined }))
                }}
                placeholder="Repita a nova senha"
                autoComplete="new-password"
                style={inputStyle(!!errors.confirmar)}
              />
            </Field>

            <Button
              type="submit"
              disabled={loading}
              style={{ width: '100%', marginTop: SPACE.xs }}
            >
              {loading ? 'Atualizando senha…' : 'Salvar nova senha'}
            </Button>
          </form>

          <div style={{
            marginTop: SPACE.xl,
            paddingTop: SPACE.lg,
            borderTop: '1px solid var(--color-border)',
            fontSize: FONT.sm,
            color: 'var(--color-muted)',
            lineHeight: 1.55,
          }}>
            🔒 Use uma combinação forte — letras, números e símbolos. Sua nova senha deve ter no mínimo 8 caracteres.
          </div>
        </div>
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
