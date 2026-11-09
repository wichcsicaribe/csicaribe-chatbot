module.exports = async function handler(req, res) {
  const TOKEN = process.env.WHATSAPP_TOKEN;
  const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;

  if (!TOKEN || !PHONE_ID) return res.json({ error: 'Falta WHATSAPP_TOKEN o PHONE_NUMBER_ID en Vercel' });

  const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: '51984722555',
      type: 'template',
      template: {
        name: 'csi_caribe_info',
        language: { code: 'es' },
        components: [{
          type: 'body',
          parameters: [{ type: 'text', parameter_name: 'nombre', text: 'Prueba' }]
        }]
      }
    })
  });
  const data = await r.json();
  return res.json({ ok: r.ok, data });
};
