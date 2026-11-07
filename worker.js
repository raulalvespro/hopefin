// Worker do app HopeFin (Cloudflare, static assets). O Cloudflare serve os arquivos da pasta dist/ sozinho
// (sem custo de execução). Este código só roda quando o arquivo pedido NÃO existe, e repete a regra que a
// Vercel tinha no vercel.json:
//   - endereço de TELA (ex.: /gastos, /entrar?c=...) -> devolve o index.html (o React Router resolve);
//   - endereço de ARQUIVO (/assets/..., ou qualquer nome com extensão) que não existe -> 404 de verdade.
// Sem isso, um arquivo velho que sumiu depois de um deploy viraria "HTML com cache de 1 ano" e travaria o PWA.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const ultimo = url.pathname.split('/').pop() || ''
    const pareceArquivo = url.pathname.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(ultimo)
    const leitura = request.method === 'GET' || request.method === 'HEAD'

    if (leitura && !pareceArquivo) {
      return env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
    return new Response('Não encontrado', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } })
  },
}
