// Regras da publicação automática da agência (supabase/functions/mkt-publicar/regras.js).
// Nada aqui chama a Meta nem o banco.
import { describe, it, expect } from 'vitest'
import {
  relogioNoFuso, instanteNoFuso, estaVencida, travaLivre, escolherPecas, planoDaPeca, camposFalha, mensagemErroMeta,
} from '../supabase/functions/mkt-publicar/regras.js'

const peca = (o = {}) => ({ id: 'x', status: 'agendado', data: '2026-11-23', horario: '19:00:00', formato: 'estatico',
  midia: [{ tipo: 'imagem', path: 'a/1.jpg' }], pub_tentativas: 0, pub_iniciada_em: null, ...o })

describe('fuso de Brasília', () => {
  it('19:00 em Brasília = 22:00 UTC (sem horário de verão)', () => {
    expect(instanteNoFuso('2026-11-23', '19:00:00').toISOString()).toBe('2026-11-23T22:00:00.000Z')
  })
  it('virada de dia: 22:30 em Brasília já é o dia seguinte em UTC', () => {
    expect(instanteNoFuso('2026-12-31', '22:30').toISOString()).toBe('2027-01-01T01:30:00.000Z')
  })
  it('relógio de parede em Brasília', () => {
    expect(relogioNoFuso(new Date('2026-11-24T02:10:00Z'))).toEqual({ data: '2026-11-23', hora: '23:10:00' })
  })
  it('acertaria o horário de verão se ele voltasse (teste com Nova York)', () => {
    expect(instanteNoFuso('2026-07-01', '12:00', 'America/New_York').toISOString()).toBe('2026-07-01T16:00:00.000Z')
    expect(instanteNoFuso('2026-12-01', '12:00', 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z')
  })
})

describe('peça vencida', () => {
  it('sai às 19:00 de Brasília, nem um minuto antes', () => {
    expect(estaVencida(peca(), new Date('2026-11-23T21:59:00Z'))).toBe(false)
    expect(estaVencida(peca(), new Date('2026-11-23T22:00:00Z'))).toBe(true)
  })
  it('não confunde UTC com Brasília: às 19:00 UTC (16:00 BRT) ainda não saiu', () => {
    expect(estaVencida(peca(), new Date('2026-11-23T19:00:00Z'))).toBe(false)
  })
  it('peça de ontem à noite continua vencida hoje', () => {
    expect(estaVencida(peca({ data: '2026-11-22', horario: '23:30' }), new Date('2026-11-23T10:00:00Z'))).toBe(true)
  })
  it('só status agendado e com horário', () => {
    const depois = new Date('2026-11-24T12:00:00Z')
    expect(estaVencida(peca({ status: 'pronto' }), depois)).toBe(false)
    expect(estaVencida(peca({ status: 'postado' }), depois)).toBe(false)
    expect(estaVencida(peca({ horario: null }), depois)).toBe(false)
  })
})

describe('trava e escolha', () => {
  const agora = new Date('2026-11-23T23:00:00Z')
  it('trava recente segura; trava velha (15 min+) libera', () => {
    expect(travaLivre(peca({ pub_iniciada_em: '2026-11-23T22:50:00Z' }), agora)).toBe(false)
    expect(travaLivre(peca({ pub_iniciada_em: '2026-11-23T22:45:00Z' }), agora)).toBe(true)
    expect(travaLivre(peca(), agora)).toBe(true)
  })
  it('até 3, das mais antigas, sem travadas nem esgotadas', () => {
    const lista = [
      peca({ id: 'c', horario: '19:30' }), peca({ id: 'a', data: '2026-11-22', horario: '12:00' }),
      peca({ id: 'futura', horario: '21:00' }), peca({ id: 'travada', horario: '18:00', pub_iniciada_em: '2026-11-23T22:58:00Z' }),
      peca({ id: 'esgotada', horario: '08:00', pub_tentativas: 3 }), peca({ id: 'b', horario: '09:00' }), peca({ id: 'd', horario: '19:45' }),
    ]
    expect(escolherPecas(lista, agora).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('plano por formato', () => {
  it('reel precisa de vídeo; capa é opcional', () => {
    expect(planoDaPeca(peca({ formato: 'reel', midia: [{ tipo: 'video', path: 'r/v.mp4' }, { tipo: 'capa', path: 'r/c.jpg' }] })))
      .toEqual({ tipo: 'reel', video: 'r/v.mp4', capa: 'r/c.jpg' })
    expect(planoDaPeca(peca({ formato: 'reel', midia: [] })).erro).toMatch(/vídeo/)
  })
  it('carrossel/tirinha: 2–10 imagens na ordem; 1 imagem vira post simples', () => {
    const m = [1, 2, 3].map((i) => ({ tipo: 'imagem', path: `t/${i}.jpg` }))
    expect(planoDaPeca(peca({ formato: 'tirinha', midia: m }))).toEqual({ tipo: 'carrossel', imagens: ['t/1.jpg', 't/2.jpg', 't/3.jpg'] })
    expect(planoDaPeca(peca({ formato: 'carrossel', midia: m.slice(0, 1) })).tipo).toBe('imagem')
    const onze = Array.from({ length: 11 }, (_, i) => ({ tipo: 'imagem', path: `${i}.jpg` }))
    expect(planoDaPeca(peca({ formato: 'carrossel', midia: onze })).erro).toMatch(/máximo 10/)
  })
  it('estático e story', () => {
    expect(planoDaPeca(peca())).toEqual({ tipo: 'imagem', imagens: ['a/1.jpg'] })
    expect(planoDaPeca(peca({ formato: 'story', midia: [{ tipo: 'video', path: 's.mp4' }] })).tipo).toBe('story_video')
  })
})

describe('falhas', () => {
  it('3ª falha vira atrasado', () => {
    expect(camposFalha(peca(), 'x')).toMatchObject({ pub_tentativas: 1, status: 'agendado' })
    expect(camposFalha(peca({ pub_tentativas: 2 }), 'x')).toMatchObject({ pub_tentativas: 3, status: 'atrasado' })
  })
  it('mensagem da Meta curta e sem o token', () => {
    const msg = mensagemErroMeta({ error: { message: 'Invalid token EAAsegredo123', code: 190 } }, 'EAAsegredo123')
    expect(msg).toBe('[190] Invalid token ***')
    expect(mensagemErroMeta('falhou em https://x?access_token=abc&y=1')).toBe('falhou em https://x?access_token=***&y=1')
  })
})
