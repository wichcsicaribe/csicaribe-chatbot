const { Redis } = require("@upstash/redis");
const kv = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });

async function sendWhatsApp(to, text, replyId) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  const body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  if (replyId) body.context = { message_id: replyId };
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // BORRAR CHAT COMPLETO: DELETE /api/messages?phone=519...
  if (req.method === 'DELETE') {
    const { phone, index } = req.query;
    if (index !== undefined) {
      // Borrar 1 mensaje por índice
      const list = await kv.lrange(`chat:${phone}`, 0, -1);
      const idx = parseInt(index);
      const item = list[idx];
      if (item) {
        // Redis no borra por índice directo, marcamos como eliminado
        await kv.lset(`chat:${phone}`, idx, JSON.stringify({ ...JSON.parse(item), deleted: true, text: '🗑️ Mensaje eliminado' }));
      }
      return res.json({ ok: true });
    }
    await kv.del(`chat:${phone}`);
    await kv.del(`contact:${phone}`);
    await kv.zrem('chats', phone);
    return res.json({ ok: true });
  }

  if (req.method === 'GET') {
    if (req.query.phone) {
      const msgs = await kv.lrange(`chat:${req.query.phone}`, 0, -1);
      return res.json(msgs.map((m, i) => ({ ...JSON.parse(m), _index: i })));
    }
    const phones = await kv.zrange('chats', 0, -1, { rev: true });
    const out = [];
    for (const p of phones) { const c = await kv.hgetall(`contact:${p}`); if (c && c.phone) out.push(c); }
    return res.json(out);
  }

  if (req.method === 'POST') {
    const { phone, text, post_url, replyTo, replyText, file, fileName, fileType } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });
    // Adjunto: lo guardamos como mensaje con archivo (base64) y lo mandamos como link/texto si no hay media ID
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
};
