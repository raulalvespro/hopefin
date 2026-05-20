import { useState, useRef, useCallback } from 'react'

export function useVoz(onTranscricao) {
  const [gravando, setGravando] = useState(false)
  const [suportado] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  const reconhecimentoRef = useRef(null)

  const iniciar = useCallback(() => {
    if (!suportado) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = false

    rec.onstart = () => setGravando(true)
    rec.onend = () => setGravando(false)
    rec.onerror = () => setGravando(false)
    rec.onresult = (e) => {
      const texto = e.results[0][0].transcript
      onTranscricao(texto)
    }

    rec.start()
    reconhecimentoRef.current = rec
  }, [suportado, onTranscricao])

  const parar = useCallback(() => {
    reconhecimentoRef.current?.stop()
    setGravando(false)
  }, [])

  return { gravando, suportado, iniciar, parar }
}

// Interpreta texto falado e extrai dados do gasto
export function interpretarFala(texto) {
  const t = texto.toLowerCase()

  // Valor — ex: "87 reais", "87,50", "R$ 45"
  const valorMatch = t.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:reais?|real|r\$)?/)
  const valor = valorMatch ? parseFloat(valorMatch[1].replace(',', '.')) : null

  // Categoria
  let categoria = 'outros'
  if (/mercado|supermercado|feira|hortifruti/.test(t)) categoria = 'mercado'
  else if (/gasolina|combustível|posto|álcool|etanol/.test(t)) categoria = 'transporte'
  else if (/farmácia|remédio|médico|consulta|exame/.test(t)) categoria = 'saude'
  else if (/restaurante|lanche|comida|pizza|ifood|almoço|jantar/.test(t)) categoria = 'alimentacao'
  else if (/uber|99|ônibus|metrô|táxi/.test(t)) categoria = 'transporte'
  else if (/roupa|sapato|loja|shopping/.test(t)) categoria = 'vestuario'
  else if (/academia|esporte|lazer|cinema|show/.test(t)) categoria = 'lazer'

  // Cartão mencionado
  let cartaoNome = null
  const cartoes = ['nubank', 'inter', 'itaú', 'bradesco', 'santander', 'bb', 'caixa', 'c6', 'xp', 'next']
  for (const c of cartoes) {
    if (t.includes(c)) { cartaoNome = c; break }
  }

  // Tipo de pagamento
  let tipoPagamento = 'cartao'
  if (/pix/.test(t)) tipoPagamento = 'pix'
  else if (/dinheiro|espécie/.test(t)) tipoPagamento = 'dinheiro'

  // Descrição — usa o texto original capitalizado
  const descricao = texto.charAt(0).toUpperCase() + texto.slice(1)

  return { valor, categoria, cartaoNome, tipoPagamento, descricao }
}
