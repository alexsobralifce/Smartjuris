// Lógica pura de exibição de preço dos planos (sem I/O).

const DIAS_NO_MES = 30

export function custoPorCredito(precoMensal: number, creditos: number): number {
  if (creditos <= 0) throw new Error('creditos deve ser maior que zero')
  return precoMensal / creditos
}

export function custoPorDia(precoMensal: number): number {
  return precoMensal / DIAS_NO_MES
}

// Quanto (em %) o custo de `novo` fica abaixo do custo de `referencia`.
export function reducaoPercentual(referencia: number, novo: number): number {
  if (novo >= referencia) return 0
  return Math.round(((referencia - novo) / referencia) * 100)
}

export function formatarReais(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`
}
