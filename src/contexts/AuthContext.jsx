import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) carregarPerfil(session.user)
      else { setPerfil(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Carrega o perfil do usuário. Se ainda não existir linha em `usuarios`
  // (ex: primeiro login via Google ou após confirmar e-mail), cria a partir
  // dos metadados guardados no cadastro — inclusive criando/entrando no grupo.
  async function carregarPerfil(authUser) {
    setLoading(true)
    let perfilRow = await buscarPerfil(authUser.id)

    if (!perfilRow) {
      const md = authUser.user_metadata || {}
      const nome = md.nome || authUser.email?.split('@')[0] || 'Usuário'

      // Cria a linha do usuário sem grupo; o vínculo é feito por RPC (servidor),
      // nunca por update direto de grupo_id (fechado pela RLS).
      const { error: insErro } = await supabase.from('usuarios').insert({
        id: authUser.id, nome, email: authUser.email, grupo_id: null,
      })
      // Não engolir falhas: se o insert falhar, o resto não tem como funcionar.
      // Se o grupo falhar aqui, o usuário cai na tela EscolhaGrupo e tenta de novo lá.
      if (insErro) {
        console.error('[HopeFin] falha ao criar perfil em usuarios:', insErro)
      } else if (md.codigo_grupo) {
        const { error } = await supabase.rpc('entrar_no_grupo', { p_codigo: md.codigo_grupo })
        if (error) console.error('[HopeFin] falha ao entrar no grupo pelo código do cadastro:', error)
      } else if (md.nome_grupo) {
        const { error } = await supabase.rpc('criar_grupo', { p_nome: md.nome_grupo })
        if (error) console.error('[HopeFin] falha ao criar o grupo do cadastro:', error)
      }
      perfilRow = await buscarPerfil(authUser.id)
    }

    setPerfil(perfilRow)
    setLoading(false)
  }

  async function buscarPerfil(userId) {
    const { data } = await supabase
      .from('usuarios').select('*, grupos(*)').eq('id', userId).maybeSingle()
    return data
  }

  async function login(email, senha) {
    return supabase.auth.signInWithPassword({ email, password: senha })
  }

  // tipo 'novo'      -> cadastrar(nome, email, senha, null, nomeGrupo)
  // tipo 'existente' -> cadastrar(nome, email, senha, codigoGrupo, null)
  // A criação/entrada no grupo acontece em carregarPerfil (quando há sessão),
  // usando os metadados abaixo — assim funciona com ou sem confirmação de e-mail.
  async function cadastrar(nome, email, senha, codigoGrupo = null, nomeGrupo = null) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome,
          nome_grupo: nomeGrupo || null,
          codigo_grupo: codigoGrupo || null,
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
    const { data: gid, error } = await supabase.rpc('entrar_no_grupo', { p_codigo: codigo.trim() })
    if (error) return { error }
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
      user, perfil, loading, precisaGrupo,
      login, cadastrar, criarGrupo, entrarGrupo, logout, carregarPerfil,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
