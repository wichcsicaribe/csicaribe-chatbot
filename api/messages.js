const { Redis } = require("@upstash/redis");
const kv = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });

function safeParse(m) {
  try { return typeof m === 'string' ? JSON.parse(m) : m; } catch (e) { return { text: String(m), dir: 'in', time: Date.now() }; }
}

async function sendWhatsApp(to, text) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  if (!phoneId || !process.env.WHATSAPP_TOKEN) return;
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }) });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // BORRAR
    if (req.method === 'DELETE') {
      const { phone, index } = req.query;
      if (!phone) return res.json({ ok: false });
      if (index !== undefined) {
        const list = await kv.lrange(`chat:${phone}`, 0, -1);
        const idx = parseInt(index);
        if (list[idx]) await kv.lset(`chat:${phone}`, idx, JSON.stringify({ ...safeParse(list[idx]), deleted: true, text: '🗑️ Mensaje eliminado' }));
        return res.json({ ok: true });
      }
      await kv.del(`chat:${phone}`);
      await kv.del(`contact:${phone}`);
      try { await kv.zrem('chats', phone); } catch (e) {}
      return res.json({ ok: true });
    }

    // LEER
    if (req.method === 'GET') {
      if (req.query.phone) {
        const msgs = await kv.lrange(`chat:${req.query.phone}`, 0, -1);
        console.log('GET chat', req.query.phone, 'encontrados', msgs.length);
        return res.json(msgs.map((m, i) => ({ ...safeParse(m), _index: i })));
      }
      // CORREGIDO: sin {rev:true}, lo volteamos en JS
      let phones = [];
      try { phones = await kv.zrange('chats', 0, -1); } catch (e) { phones = []; }
      phones = phones.reverse();
      const out = [];
      for (const p of phones) { const c = await kv.hgetall(`contact:${p}`); if (c && c.phone) out.push(c); }
      return res.json(out);
    }

    // ENVIAR
    if (req.method === 'POST') {
      const { phone, text, post_url, replyText, file, fileName, fileType } = req.body || {};
      if (!phone) return res.status(400).json({ error: 'phone required' });
      let finalText = text || '';
      if (file) finalText = (finalText ? finalText + '\n' : '') + `📎 Archivo: ${fileName || 'archivo'}`;
      if (replyText) finalText = `↩️ Respondiendo a: "${replyText}"\n${finalText}`;
      try { if (finalText) await sendWhatsApp(phone, finalText); } catch (e) { console.log('WhatsApp send fail', e); }
      const contact = await kv.hgetall(`contact:${phone}`) || {};
      await kv.rpush(`chat:${phone}`, JSON.stringify({ from: phone, name: contact.name || phone, text: finalText, dir: 'out', time: Date.now(), post_url: post_url || '', file: file || '', fileName: fileName || '', fileType: fileType || '' }));
      await kv.zadd('chats', { score: Date.now(), member: phone });
      await kv.hset(`contact:${phone}`, { phone, name: contact.name || phone, lastMessage: finalText, lastTime: String(Date.now()), post_url: post_url || contact.post_url || '' });
      return res.json({ ok: true });
    }
  } catch (e) {
    console.error('messages.js error', e);
    return res.status(500).json({ error: String(e) });
  }
};
