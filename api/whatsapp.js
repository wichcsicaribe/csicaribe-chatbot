const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  // Verificación de WhatsApp
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    try {
      const entry = req.body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const msgs = value?.messages || [];
      const contacts = value?.contacts || [];

      for (const m of msgs) {
        const phone = m.from;
        const name = contacts.find(c => c.wa_id === phone)?.profile?.name || phone;
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '[mensaje sin texto]';

        // *** AQUÍ ESTÁ LA CLAVE: el link del post viene en referral, no en el texto ***
        // Cuando Pilar le da clic al anuncio en Facebook, WhatsApp manda:
        // referral = { source_url: "https://fb.me/aq979DDXX", source_id: "...", headline: "...", body: "..." }
        const referral = m.referral || m.context?.referral || null;
        const post_url = referral?.source_url || referral?.source_id || m.context?.referred_product?.catalog_id || '';

        // Si trae link, guardamos también el título del anuncio
        const post_title = referral?.headline || referral?.body || '';

        console.log('Mensaje de', phone, 'post_url:', post_url);

        // 1. Guardar mensaje CON post_url
        await kv.rpush(`chat:${phone}`, JSON.stringify({
          from: phone, name, text, dir: 'in', time: Date.now(),
          post_url: post_url || '',
          post_title: post_title || ''
        }));
        await kv.zadd('chats', { score: Date.now(), member: phone });

        // 2. Guardar contacto - NO borrar post_url viejo si este mensaje no trae link
        const existing = await kv.hgetall(`contact:${phone}`) || {};
        await kv.hset(`contact:${phone}`, {
          phone: phone,
          name: name || existing.name || phone,
          lastMessage: text,
          lastTime: String(Date.now()),
          post_url: post_url || existing.post_url || '',
          post_title: post_title || existing.post_title || ''
        });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.json({ ok: true });
    }
  }
};
