import { supabase } from './supabase'

// Registra um erro de aparelho (sem nenhum dado financeiro) para diagnosticar
// celulares que não temos em mãos — ex.: notificação que não ativa num Android.
// Só o próprio usuário grava a linha; ninguém lê pelo app (tabela app_diagnostico,
// migração 0059). Nunca atrapalha o usuário: qualquer falha aqui é ignorada.
export async function registrarDiagnostico(tipo, detalhe, grupoId = null) {
  try {
    await supabase.from('app_diagnostico').insert({
      tipo,
      grupo_id: grupoId || null,
      detalhe: String(detalhe || '').slice(0, 600),
      user_agent: String(navigator.userAgent || '').slice(0, 300),
    })
  } catch { /* diagnóstico nunca quebra o app */ }
}
