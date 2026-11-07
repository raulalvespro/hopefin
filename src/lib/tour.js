// Tour guiado do app ("Conheça o HopeFin"). Mostrado uma vez para cada conta, logo depois do
// cadastro (ou no 1º acesso de contas que já existiam). O "visto" fica no aparelho, por usuário.
const chave = userId => `hopefin_tour_visto_${userId || 'anon'}`

export function tourVisto(userId) {
  try { return localStorage.getItem(chave(userId)) === '1' } catch { return true } // sem storage: não insiste
}

export function marcarTourVisto(userId) {
  try { localStorage.setItem(chave(userId), '1') } catch { /* ignore */ }
}
