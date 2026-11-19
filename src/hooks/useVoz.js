import { useState, useRef, useCallback, useEffect } from 'react'

// Erro do reconhecimento de voz → motivo (chave do texto em copy.voz.erroMic). null = sem aviso
// ('aborted' é a pessoa parando ou fechando; os demais raros caem no aviso genérico).
export function motivoErroVoz(codigo) {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed': return 'bloqueado'
    case 'no-speech': return 'semFala'
    case 'audio-capture': return 'semMicrofone'
    case 'network': return 'semInternet'
    case 'aborted': return null
    default: return 'falhou'
  }
}

// iPhone/iPad com o app instalado na tela inicial. Nesse modo o iOS NÃO guarda a permissão do
// microfone: pergunta de novo quando muda de tela ou depois de um tempo sem usar (regra da Apple
// pra app web — WebKit bug 215884). Não dá pra evitar pelo app; só avisar e oferecer o texto.
export function ehIosInstalado(nav = globalThis.navigator, win = globalThis.window) {
  if (!nav || !win) return false
  const ios = /iP(hone|ad|od)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const instalado = nav.standalone === true || win.matchMedia?.('(display-mode: standalone)')?.matches === true
  return ios && instalado
}

// Onde a pessoa está, pra explicar como liberar o microfone: 'iosApp' | 'iosSafari' | 'outro'.
export function ondeLiberarMic(nav = globalThis.navigator, win = globalThis.window) {
  if (ehIosInstalado(nav, win)) return 'iosApp'
  const ios = !!nav && (/iP(hone|ad|od)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1))
  return ios ? 'iosSafari' : 'outro'
}

// Voz → texto pelo reconhecimento do próprio navegador (Web Speech API).
// A5.2 (19/11/2026): UM reconhecimento por tela, reaproveitado a cada toque; toque duplo não
// pede o microfone 2 vezes; microfone bloqueado vira aviso (antes o botão só "desligava");
// cancelar() descarta o que estava sendo ouvido (fechar a janela não chama a IA à toa).
export function useVoz(onTranscricao) {
  const [gravando, setGravando] = useState(false)
  const [parcial, setParcial] = useState('') // texto reconhecido até agora (a fala ainda não terminou)
  const [erro, setErro] = useState(null)     // motivo do último erro (motivoErroVoz) ou null
  const [suportado] = useState(() => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window))
  const recRef = useRef(null)          // o reconhecimento desta tela
  const ativoRef = useRef(false)       // já pediu pra começar e ainda não terminou
  const descartarRef = useRef(false)   // cancelado: ignora qualquer resultado que ainda chegue
  const permissaoRef = useRef(null)    // 'granted' | 'denied' | 'prompt' | null (navegador não informa)
  const cbRef = useRef(onTranscricao)
  useEffect(() => { cbRef.current = onTranscricao }, [onTranscricao])

  // Situação do microfone, quando o navegador informa (Chrome; Safari 16+). Consulta ANTES do
  // toque, porque o start() precisa sair direto do toque (sem esperar nada no meio).
  useEffect(() => {
    let status = null
    const atualizar = () => { permissaoRef.current = status?.state || null }
    navigator.permissions?.query({ name: 'microphone' })
      .then((s) => { status = s; atualizar(); s.onchange = atualizar })
      .catch(() => { /* navegador sem essa consulta: segue sem saber */ })
    return () => { if (status) status.onchange = null }
  }, [])

  // Saiu da tela: solta o microfone sem entregar nada.
  useEffect(() => () => {
    descartarRef.current = true
    try { recRef.current?.abort() } catch { /* já parado */ }
  }, [])

  const iniciar = useCallback(() => {
    if (!suportado || ativoRef.current) return
    setErro(null); setParcial('')
    if (permissaoRef.current === 'denied') { setErro('bloqueado'); return }

    let rec = recRef.current
    if (!rec) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      rec = new SR()
      rec.lang = 'pt-BR'
      rec.continuous = false
      rec.interimResults = true // transcrição ao vivo; só o resultado final é interpretado
      recRef.current = rec
    }
    rec.onstart = () => setGravando(true)
    rec.onend = () => { ativoRef.current = false; setGravando(false); setParcial('') }
    rec.onerror = (e) => {
      ativoRef.current = false; setGravando(false); setParcial('')
      const motivo = descartarRef.current ? null : motivoErroVoz(e?.error)
      if (motivo) setErro(motivo)
    }
    rec.onresult = (e) => {
      if (descartarRef.current) return
      // Junta os trechos reconhecidos; só interpreta quando a fala termina.
      let texto = ''
      let final = false
      for (let i = 0; i < e.results.length; i++) {
        texto += e.results[i][0].transcript
        if (e.results[i].isFinal) final = true
      }
      if (final) { setParcial(''); cbRef.current?.(texto) }
      else setParcial(texto)
    }

    descartarRef.current = false
    ativoRef.current = true
    try {
      rec.start()
    } catch {
      // Ainda terminando a escuta anterior (InvalidStateError): solta e deixa tocar de novo.
      ativoRef.current = false
      try { rec.abort() } catch { /* ignora */ }
    }
  }, [suportado])

  // Parar de ouvir e interpretar o que já foi dito.
  const parar = useCallback(() => {
    try { recRef.current?.stop() } catch { /* já parado */ }
    setGravando(false)
  }, [])

  // Fechar/desistir: para e descarta (não chama a IA).
  const cancelar = useCallback(() => {
    descartarRef.current = true
    if (ativoRef.current) { try { recRef.current?.abort() } catch { /* já parado */ } }
    setGravando(false); setParcial(''); setErro(null)
  }, [])

  return { gravando, parcial, erro, suportado, iniciar, parar, cancelar }
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
