import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

// ?novo=1 na URL abre o formulário de "novo" da tela uma vez e limpa o endereço (A8.10: os
// primeiros passos guiados levam a pessoa direto pro formulário). `pronto` espera a tela carregar
// o que o formulário precisa (ex.: cartões).
export function useAbrirNovoPeloLink(abrirNovo, pronto = true) {
  const [params, setParams] = useSearchParams()
  const abriu = useRef(false)
  useEffect(() => {
    if (abriu.current || params.get('novo') !== '1' || !pronto) return
    abriu.current = true
    const resto = new URLSearchParams(params)
    resto.delete('novo')
    setParams(resto, { replace: true })
    abrirNovo()
  }, [params, pronto]) // eslint-disable-line react-hooks/exhaustive-deps
}
