import { format as fnsFormat } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ---------- Moeda ----------
export const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Versão curta para eixos de gráfico (1.2k)
export const fmtCurto = v => {
  const n = Number(v || 0)
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k`
  return String(Math.round(n))
}

// ---------- Datas ----------
// Converte 'yyyy-MM-dd' (ou Date) para um Date local ao meio-dia,
// evitando o deslocamento de fuso que joga a data para o dia anterior.
export const parseDataLocal = d => (d instanceof Date ? d : new Date(d + 'T12:00:00'))

// Formata uma data de forma segura. Aceita 'yyyy-MM-dd' ou Date.
export const fmtData = (d, pattern = 'dd/MM/yyyy') => fnsFormat(parseDataLocal(d), pattern, { locale: ptBR })

// Data de hoje no formato do banco.
export const hojeISO = () => fnsFormat(new Date(), 'yyyy-MM-dd')
