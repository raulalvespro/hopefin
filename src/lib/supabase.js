import { createClient } from '@supabase/supabase-js'
import { criarFetchComMemoria, limparLeituras } from './cacheLeitura'
import { ehHostAdmin } from '../admin/host'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Leituras com memória: as abas abrem na hora e conferem o banco por trás (cacheLeitura.js).
// O painel do dono (admin) sempre lê direto do banco.
const opcoes = ehHostAdmin() ? {} : { global: { fetch: criarFetchComMemoria() } }
export const supabase = createClient(supabaseUrl, supabaseAnonKey, opcoes)

// Sair da conta apaga a memória das leituras (nada de um usuário fica pro próximo).
supabase.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') limparLeituras() })
