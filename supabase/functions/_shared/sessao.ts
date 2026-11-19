// Nível da sessão ("aal") que vem no JWT do Supabase: 'aal1' = entrou só com a senha;
// 'aal2' = passou também pelo código do celular (verificação em 2 etapas).
// O painel do dono exige 'aal2' no servidor (L37, 19/11/2026).
// Ler SÓ depois de validar o token (auth.getUser), porque aqui não conferimos a assinatura.
export function nivelDaSessao(jwt: string): string {
  try {
    const p = (jwt.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/')
    const dados = JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4)))
    return typeof dados?.aal === 'string' ? dados.aal : ''
  } catch {
    return ''
  }
}
