const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  // 1. Verificación de Meta
  if (req.method === 'GET') {
    if (req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('No verificado');
  }

  // 2. Llega un mensaje nuevo
  if (req.method === 'POST') {
    try {
      const entry = req.body.entry?.[0]?.changes?.[0]?.value;
      const msg = entry?.messages?.[0];
      if (!msg) return res.json({ ok: true });

      const from = msg.from;
      const texto = msg.text?.body || '';
      const nombre = entry.contacts?.[0]?.profile?.name || from;

      // Guardar contacto
      await kv.hset(`contact:${from}`, { phone: from, name: nombre, lastMessage: texto, post_url: '' });
      // Guardar mensaje
      await kv.rpush(`chat:${from}`, JSON.stringify({ from, name: nombre, text: texto, dir: 'in', time: Date.now() }));
      // Agregar a lista
      await kv.zadd('chats', { score: Date.now(), member: from });

      // Notificación a tu personal
      const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: '51984722555', type: 'template',
          template: { name: 'csi_caribe_info', language: { code: 'es' },
            components: [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'nombre', text: 'Nuevo mensaje de ' + nombre }] }]
          }
        })
      });

      return res.json({ ok: true });
    } catch(e) { console.log(e); return res.json({ ok: true }); }
  }
};
