import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizarCodigo, limparConvite } from '../lib/convite'
import { identificar, resetarUsuario } from '../lib/analytics'
import * as Sentry from '@sentry/react'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erroPerfil, setErroPerfil] = useState(null) // motivo, quando o perfil não carrega (mostrado ao usuário)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) { identificar(session.user.id); carregarPerfil(session.user) }
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) { identificar(session.user.id); carregarPerfil(session.user) }
      else { setPerfil(null); setLoading(false); resetarUsuario() }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Carrega o perfil do usuário. Se ainda não existir linha em `usuarios`
  // (ex: primeiro login via Google ou após confirmar e-mail), cria a partir
  // dos metadados guardados no cadastro — inclusive criando/entrando no grupo.
  async function carregarPerfil(authUser) {
    setLoading(true)
    let { row: perfilRow, erro: erroPerfil } = await buscarPerfil(authUser.id)

    // Só cria a linha/grupo se a consulta DEU CERTO e o usuário realmente não existe. Se a consulta
    // falhou (ex.: erro de relacionamento no banco), NÃO criamos nada: antes, uma falha aqui
    // fazia o app criar um grupo novo a cada tentativa e tirava a pessoa do grupo dela.
    if (erroPerfil) console.error('[auth] não foi possível carregar o perfil:', erroPerfil.message)
    setErroPerfil(erroPerfil ? (erroPerfil.message || String(erroPerfil)) : null)
    // Avisa no Sentry (só liga no app publicado, e sem dados pessoais) — era o erro que derrubava o login.
    if (erroPerfil) Sentry.captureMessage('perfil_nao_carregou: ' + (erroPerfil.code || '') + ' ' + (erroPerfil.message || ''), 'error')
    if (!perfilRow && !erroPerfil) {
      const md = authUser.user_metadata || {}
      const nome = md.nome || authUser.email?.split('@')[0] || 'Usuário'

      // Cria a linha do usuário sem grupo; o vínculo é feito por RPC (servidor),
      // nunca por update direto de grupo_id (fechado pela RLS).
      await supabase.from('usuarios').insert({
        id: authUser.id, nome, email: authUser.email, grupo_id: null,
        telefone: md.telefone || null,
        marketing_optin: !!md.marketing_optin,
        marketing_optin_em: md.marketing_optin ? new Date().toISOString() : null,
        termos_versao: md.aceite_versao || null,
        termos_aceito_em: md.aceite_versao ? new Date().toISOString() : null,
      })
      if (md.codigo_grupo) {
        await supabase.rpc('entrar_no_grupo', { p_codigo: md.codigo_grupo })
      } else if (md.nome_grupo) {
        await supabase.rpc('criar_grupo', { p_nome: md.nome_grupo })
      }
      perfilRow = (await buscarPerfil(authUser.id)).row
    }

    // Garante a assinatura em trial do grupo (idempotente: não recria se já existe).
    // A trava de novos lançamentos por status vive no banco (RLS); aqui só
    // asseguramos que todo grupo tenha a linha de trial no 1º acesso.
    if (perfilRow?.grupo_id) {
      supabase.rpc('iniciar_trial_familia', {}).then(({ error }) => {
        if (error) console.error('[auth] iniciar_trial_familia:', error.message)
      })
    }

    setPerfil(perfilRow)
    setLoading(false)
  }

  async function buscarPerfil(userId) {
    // Hint explícito da relação (usuarios.grupo_id -> grupos): evita ambiguidade se surgir outra FK entre as tabelas.
    const { data, error } = await supabase
      .from('usuarios').select('*, grupos!usuarios_grupo_id_fkey(*)').eq('id', userId).maybeSingle()
    return { row: data, erro: error }
  }

  async function login(email, senha) {
    return supabase.auth.signInWithPassword({ email, password: senha })
  }

  // tipo 'novo'      -> cadastrar(nome, email, senha, null, nomeGrupo)
  // tipo 'existente' -> cadastrar(nome, email, senha, codigoGrupo, null)
  // A criação/entrada no grupo acontece em carregarPerfil (quando há sessão),
  // usando os metadados abaixo — assim funciona com ou sem confirmação de e-mail.
  async function cadastrar(nome, email, senha, codigoGrupo = null, nomeGrupo = null, extra = {}) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome,
          nome_grupo: nomeGrupo || null,
          codigo_grupo: codigoGrupo ? normalizarCodigo(codigoGrupo) : null,
          telefone: extra.telefone || null,
          marketing_optin: !!extra.marketingOptin,
          aceite_versao: extra.aceiteVersao || null,
        },
      },
    })
    if (error) return { error }
    return { data }
  }

  // Cria um novo grupo e vincula o usuário logado (fluxo da tela EscolhaGrupo).
  async function criarGrupo(nome) {
    if (!user) return { error: { message: 'Sem sessão ativa' } }
    const { data: gid, error } = await supabase.rpc('criar_grupo', { p_nome: nome })
    if (error) return { error }
    await carregarPerfil(user)
    return { data: { id: gid } }
  }

  // Entra num grupo existente a partir do código curto compartilhado.
  async function entrarGrupo(codigo) {
    if (!user) return { error: { message: 'Sem sessão ativa' } }
    const { data: gid, error } = await supabase.rpc('entrar_no_grupo', { p_codigo: normalizarCodigo(codigo) })
    if (error) return { error }
    limparConvite()
    await carregarPerfil(user)
    return { data: { id: gid } }
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  // Logado, perfil carregado, mas ainda sem grupo -> precisa escolher/criar grupo.
  const precisaGrupo = !!user && !!perfil && !perfil.grupo_id

  return (
    <AuthContext.Provider value={{
      user, perfil, loading, precisaGrupo, erroPerfil,
      login, cadastrar, criarGrupo, entrarGrupo, logout, carregarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
