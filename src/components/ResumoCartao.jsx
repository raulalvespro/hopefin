import { fmt } from '../lib/format'
import { copy } from '../copy/pt-BR'

const t = copy.resumoMes

// Cartão "noite" do resumo do mês (prompt 19). Usado na tela Fechamento e, com
// `exportar`, numa versão 360×640 (formato story/WhatsApp) que vira imagem pra compartilhar.
// Todos os números chegam prontos por props (dados reais do grupo).
export default function ResumoCartao({
  nomeMes, nomeMesAnterior, grupoNome, positivo, resultado, difAnt = null, delta = null,
  meta = null, fixasTotal = 0, fixasPagas = 0, vozPct = null, exportar = false,
}) {
  const circ = 251 // 2·π·40
  const painelInterno = { background: 'rgba(255,255,255,.07)', borderRadius: 16, padding: 16 }
  const caixa = exportar
    ? { width: 360, minHeight: 640, boxSizing: 'border-box', padding: '40px 28px 32px', borderRadius: 0 }
    : { padding: 24, borderRadius: 'var(--radius-xl)', marginBottom: 16 }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--panel-ink)', color: '#ffffff', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: "'DM Sans', system-ui, sans-serif", ...caixa }}>
      {/* Barrinhas decorativas (mesma marca do painel do Início) */}
      <svg width="160" height="160" viewBox="0 0 480 240" aria-hidden="true" style={{ position: 'absolute', right: -30, top: -16, opacity: 0.16 }}>
        <g fill="#10b981"><rect x="248" y="72" width="32" height="192" rx="16" /><rect x="304" y="48" width="32" height="216" rx="16" /><rect x="360" y="24" width="32" height="240" rx="16" /><rect x="416" y="0" width="32" height="264" rx="16" /></g>
      </svg>
      <span style={{ position: 'relative', fontSize: 13, color: '#94a3b8', textTransform: 'capitalize' }}>
        {t.mesNaCasa(nomeMes, grupoNome || t.grupoFallback)}
      </span>

      <div className={exportar ? undefined : 'hf-count'} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 15, color: '#94a3b8' }}>{positivo ? t.sobrou : t.faltou}</span>
        <span style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, fontSize: exportar ? 52 : 44, lineHeight: exportar ? '54px' : '48px', color: positivo ? '#34d399' : '#fca5a5' }}>
          {fmt(Math.abs(resultado))}
        </span>
        {difAnt != null && (
          <span style={{ fontSize: 14, color: '#e2e8f0' }}>
            {Math.abs(difAnt) < 0.01 ? t.igualA(nomeMesAnterior) : difAnt > 0 ? t.aMaisQue(fmt(difAnt), nomeMesAnterior) : t.aMenosQue(fmt(Math.abs(difAnt)), nomeMesAnterior)}
          </span>
        )}
        {!exportar && delta && <span style={{ marginTop: 2 }}>{delta}</span>}
      </div>

      {meta && (
        <div className={exportar ? undefined : 'hf-count'} style={{ ...painelInterno, position: 'relative', display: 'flex', gap: 16, alignItems: 'center', animationDelay: '.2s' }}>
          <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={t.metaAria(meta.pct)} style={{ flexShrink: 0 }}>
            <circle cx="46" cy="46" r="40" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="10" />
            <circle className={exportar ? undefined : 'hf-arc'} cx="46" cy="46" r="40" fill="none" stroke="#a78bfa" strokeWidth="10" strokeLinecap="round" transform="rotate(-90 46 46)"
              style={{ strokeDasharray: circ, strokeDashoffset: circ - (circ * meta.pct) / 100 }} />
            <text x="46" y="52" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight="700" fontSize="18" fill="#ffffff">{meta.pct}%</text>
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{t.metaDe(meta.nome)}</span>
            <span style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, fontSize: 18 }}>{t.metaDeTotal(fmt(meta.saldo), fmt(meta.meta))}</span>
          </div>
        </div>
      )}

      {(fixasTotal > 0 || vozPct != null) && (
        <div className={exportar ? undefined : 'hf-count'} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, animationDelay: '.35s' }}>
          {fixasTotal > 0 && (
            <div style={{ ...painelInterno, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{t.contasFixasPagas}</span>
              <span style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, fontSize: 22 }}>{t.contasFixasDe(fixasPagas, fixasTotal)}</span>
            </div>
          )}
          {vozPct != null && (
            <div style={{ ...painelInterno, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{t.lancadoPorVoz}</span>
              <span style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, fontSize: 22 }}>{vozPct}%</span>
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative', marginTop: exportar ? 'auto' : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>{t.rodapeMarca}</span>
        <span style={{ fontFamily: 'Syne, system-ui, sans-serif', fontWeight: 700, fontSize: 14 }}>{t.rodapeSite}</span>
      </div>
    </div>
  )
}
