import { fmt, fmtData } from '../lib/format'
import { agruparPorOrigem, nomeItem } from '../lib/cobranca'
import { copy } from '../copy/pt-BR'

const t = copy.aReceber

// Imagem da cobrança do A Receber (A1.16): 360px de largura no visual do HopeFin (claro,
// barra verde, Syne nos títulos e no dinheiro). Cores FIXAS (não as variáveis do tema),
// porque vira PNG pra mandar no WhatsApp — tem que sair igual no claro e no escuro.
export default function CobrancaImagem({ nome, mesNome, itens, ate = '', qr = '' }) {
  const grupos = agruparPorOrigem(itens)
  const total = Math.round(itens.reduce((s, i) => s + Number(i.valor || 0), 0) * 100) / 100
  const syne = "'Syne', system-ui, sans-serif"

  return (
    <div style={{ width: 360, boxSizing: 'border-box', background: '#ffffff', color: '#0f172a', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ height: 8, background: '#10b981' }} />
      <div style={{ padding: '20px 24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: syne, fontWeight: 700, fontSize: 18 }}>hope<span style={{ color: '#059669' }}>fin</span></span>
          <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{mesNome}</span>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 14 }}>{t.imgPara}</p>
        <p style={{ fontFamily: syne, fontWeight: 700, fontSize: 24, lineHeight: '28px' }}>{nome}</p>

        {grupos.map(g => (
          <div key={g.rotulo} style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>
              <span>{g.rotulo}</span><span>{fmt(g.total)}</span>
            </div>
            {g.itens.map(i => (
              <div key={`${i.tipo}:${i.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5, padding: '5px 0', borderBottom: '1px solid #eef1f5' }}>
                <span>{nomeItem(i)}</span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{fmt(i.valor)}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 16, background: '#ecfdf5', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{t.imgTotal}</span>
          <span style={{ fontFamily: syne, fontWeight: 700, fontSize: 24, color: '#047857' }}>{fmt(total)}</span>
        </div>
        {ate && <p style={{ fontSize: 13.5, color: '#334155', marginTop: 10, fontWeight: 500 }}>{t.imgAte(fmtData(ate, 'dd/MM'))}</p>}

        {qr && (
          <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <img src={qr} width={104} height={104} alt="" style={{ display: 'block', flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.45 }}>{t.imgPix}</p>
          </div>
        )}
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16 }}>{t.imgRodape}</p>
      </div>
    </div>
  )
}
