function limpiarNombre(full) {
  let n = String(full || '').replace(/M\.Sc|Ing\.|Ing|Dr\.|Dra\.|Lic\./gi, '').trim();
  let partes = n.split(/\s+/).filter(Boolean);
  if (!partes.length) return 'amigo';
  let primero = partes[0].toLowerCase();
  return primero.charAt(0).toUpperCase() + primero.slice(1);
}
function limpiarPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if ((d.startsWith('1809') || d.startsWith('1787')) && d.length === 14) d = d.slice(0, 11);
  if (d.length < 11 || d.length > 13) return null;
  return d;
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { contacts } = req.body || {};
  if (!contacts?.length) return res.status(400).json({ error: 'Sin contactos' });

  const TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;

  const results = [];
  for (const c of contacts) {
    const phone = limpiarPhone(c.phone);
    const nombre = limpiarNombre(c.nombre);
    if (!phone) { results.push({ phone: c.phone, nombre, ok: false, error: 'telefono invalido, saltado' }); continue; }
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: 'csi_caribe_info',
            language: { code: 'es' },
            components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'nombre', text: nombre }] }]
          }
        })
      });
      const data = await r.json();
      results.push({ phone, nombre, ok: r.ok, id: data.messages?.[0]?.id || null, error: data.error?.message || null });
    } catch (e) { results.push({ phone, nombre, ok: false, error: e.message }); }
    await delay(1000);
  }
  return res.json({ total: results.length, enviados: results.filter(x=>x.ok).length, results });
};
