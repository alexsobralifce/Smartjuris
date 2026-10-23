export function redactPII(text: string): string {
  if (!text) return text;
  return String(text)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP]')
    .replace(/(?:\(\d{2}\)\s?)?\d{4,5}-\d{4}\b/g, '[TEL]');
}

// ---------------------------------------------------------------------------
// Pseudonimização de partes (nomes do processo) antes do envio ao provedor de IA.
// Os nomes reais são trocados por marcadores `[PARTE_n]` no prompt e restaurados
// na saída do modelo. Nomes curtos (< 4 caracteres) são ignorados para evitar
// substituições indevidas.
// ---------------------------------------------------------------------------

export interface Pseudonimizador {
  /** Redige identificadores e troca os nomes das partes por marcadores. */
  sanitize(texto: string): string;
  /** Restaura os nomes reais em um texto completo. */
  restaurar(texto: string): string;
  /**
   * Restaura em streaming: devolve o trecho já seguro para emitir e retém um
   * eventual marcador incompleto (ex.: `[PARTE_` na fronteira de um chunk).
   * Chame `finalizar()` ao fim do stream para liberar o que restou.
   */
  streamRestaurador(): { processar(delta: string): string; finalizar(): string };
}

const MARCADOR_MAX = 16;

export function criarPseudonimizador(nomes: Array<string | null | undefined>): Pseudonimizador {
  const unicos = [...new Set(nomes.map((n) => (n ?? '').trim()).filter((n) => n.length >= 4))]
    .sort((a, b) => b.length - a.length);
  const marcadorPorNome = new Map<string, string>();
  const nomePorMarcador = new Map<string, string>();
  unicos.forEach((nome, i) => {
    const marcador = `[PARTE_${i + 1}]`;
    marcadorPorNome.set(nome.toLowerCase(), marcador);
    nomePorMarcador.set(marcador, nome);
  });

  const reNomes = unicos.length
    ? new RegExp(unicos.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi')
    : null;

  const restaurar = (texto: string): string => {
    let saida = texto;
    for (const [marcador, nome] of nomePorMarcador) saida = saida.split(marcador).join(nome);
    return saida;
  };

  return {
    sanitize(texto: string): string {
      if (!texto) return texto;
      const semIdentificadores = redactPII(texto);
      return reNomes ? semIdentificadores.replace(reNomes, (m) => marcadorPorNome.get(m.toLowerCase()) ?? m) : semIdentificadores;
    },
    restaurar,
    streamRestaurador() {
      let pendente = '';
      return {
        processar(delta: string): string {
          const buf = pendente + delta;
          const ultimoAbre = buf.lastIndexOf('[');
          // Retém o final só se for um possível marcador ainda não fechado.
          if (ultimoAbre !== -1 && !buf.slice(ultimoAbre).includes(']') && buf.length - ultimoAbre < MARCADOR_MAX) {
            pendente = buf.slice(ultimoAbre);
            return restaurar(buf.slice(0, ultimoAbre));
          }
          pendente = '';
          return restaurar(buf);
        },
        finalizar(): string {
          const resto = restaurar(pendente);
          pendente = '';
          return resto;
        },
      };
    },
  };
}
