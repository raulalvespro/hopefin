// Pessoas sem nome repetido (A8.5, 19/11/2026): "Jack", "Jacqueline" e "Jak" escritos em
// lançamentos diferentes viravam 3 pessoas. Aqui fica a conta pura de "nome parecido" (usada
// pra avisar antes de criar uma pessoa nova). Testes: tests/pessoas.test.js.

// Minúsculas, sem acento e sem espaço sobrando.
export const nomeNormal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Distância de edição (quantas letras trocar/pôr/tirar pra virar a outra).
function distancia(a, b) {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let ant = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const atual = [i]
    for (let j = 1; j <= n; j++) {
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    ant = atual
  }
  return ant[n]
}

// Dois nomes parecem a mesma pessoa? Iguais sem acento; um começa com o outro (Jack ×
// Jacqueline, Pai × Pai do Raul); apelido curto com as 3 primeiras letras do nome (Jack ×
// Jacqueline); ou até 1-2 letras de diferença no 1º nome (Jak × Jack, Jaqueline × Jacqueline).
export function nomesParecidos(a, b) {
  const x = nomeNormal(a), y = nomeNormal(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.startsWith(y) || y.startsWith(x)) return true
  const px = x.split(' ')[0], py = y.split(' ')[0]
  // Apelido curto (3-4 letras) com as mesmas 3 primeiras letras do nome longo: Jack × Jacqueline.
  const curto = px.length <= py.length ? px : py, longo = curto === px ? py : px
  if (curto.length >= 3 && curto.length <= 4 && longo.startsWith(curto.slice(0, 3))) return true
  const lim = Math.min(px.length, py.length) <= 4 ? 1 : 2
  return distancia(px, py) <= lim
}

// Pessoas já cadastradas que parecem a mesma de `nome` (exceto a idêntica, que o app reaproveita).
export function pessoasParecidas(nome, pessoas) {
  const n = nomeNormal(nome)
  if (n.length < 2) return []
  return (pessoas || []).filter((p) => nomeNormal(p.nome) !== n && nomesParecidos(nome, p.nome))
}
