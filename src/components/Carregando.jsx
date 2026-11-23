// Rodinha de "carregando" (login e telas que baixam sob demanda).
export default function Carregando({ alto = '100vh' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:alto, color:'var(--text2)', gap:16 }}>
      <div style={{ width:36, height:36, border:'3px solid var(--border2)', borderTop:'3px solid var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
