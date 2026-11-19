// Pix "copia e cola" — BR Code estático (padrão EMV do Banco Central), usado na cobrança
// do A Receber (A1.16). Montado só no aparelho: a chave Pix da pessoa NUNCA vai pro banco
// do HopeFin (pode ser CPF — regra do CLAUDE.md). Ver tests/pix.test.js (exemplo oficial).

const campo = (id, valor) => `${id}${String(valor.length).padStart(2, '0')}${valor}`

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como pede o padrão do Pix.
export function crc16(payload) {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Nome e cidade: sem acento e sem símbolo (o padrão aceita só o básico), no tamanho máximo.
const textoSimples = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

// Chave: e-mail em minúsculas; o resto sem espaços. Celular vai no formato +55DDDNÚMERO.
export const normalizarChave = (chave) => {
  const c = String(chave || '').trim()
  return c.includes('@') ? c.toLowerCase() : c.replace(/\s+/g, '')
}

export function pixCopiaECola({ chave, nome, cidade, valor = 0, txid = '***' }) {
  const k = normalizarChave(chave)
  if (!k) return ''
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k)
  let p = campo('00', '01') + campo('26', conta) + campo('52', '0000') + campo('53', '986')
  if (Number(valor) > 0) p += campo('54', Number(valor).toFixed(2))
  p += campo('58', 'BR') + campo('59', textoSimples(nome, 25) || 'HopeFin') + campo('60', textoSimples(cidade, 15) || 'Brasil')
  p += campo('62', campo('05', textoSimples(txid, 25) || '***'))
  p += '6304'
  return p + crc16(p)
}
