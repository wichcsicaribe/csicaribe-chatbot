const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
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
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_P_NUMBER_ID;
      const MY_PHONE = process.env.MY_PHONE || ''; // tu personal, ej: 51984763356

      for (const m of msgs) {
        const phone = m.from;
        const name = contacts.find(c => c.wa_id === phone)?.profile?.name || phone;
        const text = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || '[mensaje sin texto]';
        const referral = m.referral || m.context?.referral || null;
        const post_url = referral?.source_url || referral?.source_id || '';
        const post_title = referral?.headline || referral?.body || '';

        await kv.rpush(`chat:${phone}`, JSON.stringify({
          from: phone, name, text, dir: 'in', time: Date.now(),
          post_url: post_url || '', post_title: post_title || ''
        }));
        await kv.zadd('chats', { score: Date.now(), member: phone });

        const existing = await kv.hgetall(`contact:${phone}`) || {};
        await kv.hset(`contact:${phone}`, {
          phone: phone,
          name: name || existing.name || phone,
          lastMessage: text,
          lastTime: String(Date.now()),
          post_url: post_url || existing.post_url || '',
          post_title: post_title || existing.post_title || ''
        });

        // *** NOTIFICACIÓN A TU PERSONAL ***
        // Solo si te escribe un cliente, no si te escribes tú mismo
        if (MY_PHONE && phone !== MY_PHONE) {
          const notif = `🔔 Nuevo mensaje en CSI CARIBE+\n\nDe: ${name} (${phone})\nMensaje: ${text}` + (post_url ? `\nPost: ${post_url}` : '');
          await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: MY_PHONE, type: 'text', text: { body: notif } })
          }).catch(e => console.log('No se pudo notificar', e));
        }
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.json({ ok: true });
    }
  }
};
