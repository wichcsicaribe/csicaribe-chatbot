const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
});

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const phone = req.query.phone;
    if (phone) {
      const msgs = await kv.lrange(`chat:${phone}`, 0, -1);
      return res.json(msgs.map(m => typeof m === 'string' ? JSON.parse(m) : m));
    }
    const phones = await kv.zrange('chats', 0, -1, { rev: true });
    const contacts = [];
    for (const p of phones) {
      const c = await kv.hgetall(`contact:${p}`);
      if (c && c.phone) contacts.push(c);
    }
    return res.json(contacts);
  }
  if (req.method === 'POST') {
    const { phone, text, post_url, name } = req.body;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_P_NUMBER_ID;
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } })
    });
    // 1. Guardar mensaje CON post_url y hora
    await kv.rpush(`chat:${phone}`, JSON.stringify({ from: phone, name: 'Tu (Panel)', text, dir: 'out', time: Date.now(), post_url: post_url || '' }));
    await kv.zadd('chats', { score: Date.now(), member: phone });
    // 2. Guardar / actualizar contacto CON post_url para que el panel lo muestre arriba
    const existing = await kv.hgetall(`contact:${phone}`) || {};
    await kv.hset(`contact:${phone}`, {
      phone: phone,
      name: name || existing.name || phone,
      lastMessage: text,
      lastTime: String(Date.now()),
      post_url: post_url || existing.post_url || ''
    });
    return res.json({ ok: true });
  }
};
