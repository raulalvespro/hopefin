// Auto-atualização do app instalado (PWA).
// Sem isto, a versão nova só entrava depois de fechar e abrir o app mais de uma vez. Agora:
//  1) toda vez que o app volta para a frente (e a cada 30 min), pergunta ao servidor se há versão nova;
//  2) quando a versão nova assume, recarrega sozinho — a menos que a pessoa esteja digitando num campo;
//     nesse caso espera ela sair do app e recarrega então.
export function iniciarAutoAtualizacao() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  const tinhaControlador = !!navigator.serviceWorker.controller // 1ª instalação não recarrega
  let pendente = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador) return
    const el = document.activeElement
    const digitando = !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    if (digitando) { pendente = true; return }
    window.location.reload()
  })

  const verificar = () => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {})

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificar()
    else if (pendente) window.location.reload()
  })
  setInterval(verificar, 30 * 60 * 1000)
  verificar()
}
