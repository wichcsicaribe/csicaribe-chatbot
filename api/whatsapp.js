const { Redis } = require("@upstash/redis");
const kv = new Redis({ url: process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN });

// === GUARDAR EN TU GOOGLE SHEET VIEJO ===
async function logToSheet({date, name, from, text, dir, fileName, post_url, post_title}){
  const url = process.env.GOOGLE_SHEET_URL;
  if(!url) return;
  try{ await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({date, name, from, text, dir, fileName, post_url, post_title}) }); }catch(e){ console.log('Sheet log fail', e); }
}

// === MANDAR WHATSAPP ===
async function sendWhatsApp(to, body){
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
  return fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }) });
}

// === BOT POR CURSO - POR TÍTULO DEL ANUNCIO, NO POR LINK ===
const MODULO_II_REPLY = `¡Muchas gracias por tu interés en el curso! 🏛️
En el siguiente enlace podrás revisar el brochure completo con el temario, fechas, precios y detalles de inscripción:
🔗 https://drive.google.com/file/d/1izd3TYuSvvbIcZ6XzjEbiIEiWXn5gD7Q/view?usp=sharing
Si tienes alguna consulta adicional o deseas confirmar tu vacante, quedo atento para ayudarte. 🤝`;

const MODULO_I_REPLY = `¡Muchas gracias por tu interés en el curso! 🏛️
En el siguiente enlace podrás revisar el brochure completo del Módulo I:
🔗 https://csicaribe.com/pages/dinamicaestructural2026
Si tienes alguna consulta adicional o deseas confirmar tu vacante, quedo atento para ayudarte. 🤝`;

const GENERIC_REPLY = `¡Muchas gracias por tu interés! 🏛️
¿Me confirma en qué curso está interesado? Así le comparto el brochure correcto con temario, fechas y precios.

1️⃣ Dinámica Estructural Módulo I
2️⃣ Dinámica Estructural Módulo II
3️⃣ Otro curso

Quedo atento para ayudarle. 🤝`;

function getReplyByReferral(post_url, post_title, text){
  const title = (post_title||'').toLowerCase();
  const msg = (text||'').toLowerCase();

  // 1. MÓDULO II - si el título del anuncio O lo que escribe dice Módulo II / N Grados
  if(title.includes('módulo ii') || title.includes('modulo ii') || title.includes('módulo 2') || title.includes('modulo 2') || title.includes('n grados') || title.includes('grados de libertad') || title.includes('(n) grados')) return MODULO_II_REPLY;
  if(msg.includes('módulo ii') || msg.includes('modulo ii') || msg.includes('módulo 2') || msg.includes('modulo 2') || msg.includes('n grados') || msg.includes('grados de libertad')) return MODULO_II_REPLY;

  // 2. MÓDULO I - si dice Módulo I
  if(title.includes('módulo i') || title.includes('modulo i')) return MODULO_I_REPLY;
  if(msg.includes('módulo i') || msg.includes('modulo i')) return MODULO_I_REPLY;

  // 3. OTRO CURSO - si viene de un anuncio pero NO es Módulo I ni II, NO le mandes el de Módulo II
  // Le mandas el genérico para que te diga qué curso quiere
  const hasReferral = !!(post_url && post_url.trim() !== '');
  if(hasReferral) return GENERIC_REPLY;

  // 4. Si escribe directo y solo dice "hola" / "info" sin decir qué curso, no responde automático
  // Lo respondes tú desde el panel para no mandarle un brochure equivocado
  return null;
}

// Descargar foto/video/documento de Meta y convertirlo a base64 para guardarlo en el panel
async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  const r1 = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  const j1 = await r1.json();
  if (!j1.url) return null;
  const r2 = await fetch(j1.url, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await r2.arrayBuffer());
  const mime = j1.mime_type || 'image/jpeg';
  if (buf.length > 4 * 1024 * 1024) return { tooBig: true, mime, url: j1.url };
  return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime, fileName: j1.filename || 'archivo' };
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']; const token = req.query['hub.verify_token']; const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send('Forbidden');
  }
  if (req.method === 'POST') {
    try {
      const entry = req.body.entry?.[0]; const change = entry?.changes?.[0]; const value = change?.value;
      const msgs = value?.messages || []; const contacts = value?.contacts || [];
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
      const MY_PHONE = process.env.MY_PHONE || '';

      for (const m of msgs) {
        const phone = m.from;
        const name = contacts.find(c => c.wa_id === phone)?.profile?.name || phone;

        let text = '';
        let file = ''; let fileName = ''; let fileType = '';
        if (m.type === 'text') text = m.text?.body || '';
        else if (m.type === 'image') { text = m.image?.caption || '📷 Foto'; const d = m.image?.id ? await downloadMedia(m.image.id) : null; if (d?.dataUrl) { file = d.dataUrl; fileName = 'foto.jpg'; fileType = d.mime; } else if (d?.tooBig) text = '📷 Foto muy grande (más de 4MB) - pídele que la mande más pequeña'; }
        else if (m.type === 'video') { text = m.video?.caption || '🎥 Video'; const d = m.video?.id ? await downloadMedia(m.video.id) : null; if (d?.dataUrl) { file = d.dataUrl; fileName = 'video.mp4'; fileType = d.mime; } }
        else if (m.type === 'document') { text = m.document?.caption || `📄 ${m.document?.filename || 'Documento'}`; const d = m.document?.id ? await downloadMedia(m.document.id) : null; if (d?.dataUrl) { file = d.dataUrl; fileName = m.document.filename || 'documento'; fileType = d.mime; } }
        else if (m.type === 'audio') { text = '🎤 Audio'; const d = m.audio?.id ? await downloadMedia(m.audio.id) : null; if (d?.dataUrl) { file = d.dataUrl; fileName = 'audio.ogg'; fileType = d.mime; } }
        else if (m.type === 'sticker') { text = '😀 Sticker'; }
        else text = m.text?.body || `[${m.type || 'mensaje'}]`;

        if (!text) text = '[mensaje sin texto]';

        const referral = m.referral || m.context?.referral || null;
        const post_url = referral?.source_url || referral?.source_id || '';
        const post_title = referral?.headline || referral?.body || '';

        await kv.rpush(`chat:${phone}`, JSON.stringify({ from: phone, name, text, dir: 'in', time: Date.now(), post_url: post_url || '', post_title: post_title || '', file, fileName, fileType }));
        await kv.zadd('chats', { score: Date.now(), member: phone });
        const existing = await kv.hgetall(`contact:${phone}`) || {};
        await kv.hset(`contact:${phone}`, { phone, name: name || existing.name || phone, lastMessage: text, lastTime: String(Date.now()), post_url: post_url || existing.post_url || '', post_title: post_title || existing.post_title || '' });

        // Guardar mensaje entrante en Google Sheet
        await logToSheet({ date: new Date().toLocaleString('es-PE'), name, from: phone, text, dir: 'in', fileName, post_url: post_url||'', post_title: post_title||'' });

        // === RESPUESTA AUTOMÁTICA POR REFERRAL ===
        const autoReply = getReplyByReferral(post_url, post_title, text);
        if(autoReply){
          // 1. Guardar respuesta del bot en el panel para que la veas
          await kv.rpush(`chat:${phone}`, JSON.stringify({ from: phone, name: 'CSI CARIBE+ (Bot)', text: autoReply, dir: 'out', time: Date.now(), post_url: '', post_title: '', file: '', fileName: '', fileType: '' }));
          // 2. Mandar respuesta por WhatsApp al cliente
          await sendWhatsApp(phone, autoReply).catch(e => console.log('No se pudo mandar auto-reply', e));
          // 3. Guardar respuesta del bot en Google Sheet
          await logToSheet({ date: new Date().toLocaleString('es-PE'), name: 'CSI CARIBE+ (Bot)', from: phone, text: autoReply, dir: 'out', fileName: '', post_url: post_url||'', post_title: post_title||'' });
        }

        if (MY_PHONE && phone !== MY_PHONE) {
          const notif = `🔔 Nuevo mensaje en CSI CARIBE+\n\nDe: ${name} (${phone})\nMensaje: ${text}` + (file ? `\n📎 Trae archivo adjunto, míralo en el panel` : '') + (post_url ? `\nPost: ${post_url}` : '');
          await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: MY_PHONE, type: 'text', text: { body: notif } }) }).catch(e => console.log('No se pudo notificar', e));
        }
      }
      return res.json({ ok: true });
    } catch (e) { console.error(e); return res.json({ ok: true }); }
  }
};
