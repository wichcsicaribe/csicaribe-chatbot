module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const msg = value?.messages?.[0];
      if (!msg || msg.type !== 'text') return res.status(200).send('EVENT_RECEIVED');

      const from = msg.from;
      const text = msg.text?.body || '';
      const clientName = value?.contacts?.[0]?.profile?.name || 'Sin nombre';
      const OWNER_NUMBER = '51984722555';
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_P_NUMBER_ID;

      const sendWA = async (to, body) => {
        await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: to, type: 'text', text: { body: body } })
        });
      };

      // === 2. DETECTAR SI VIENE DE UN POST / ANUNCIO DE FACEBOOK ===
      // Meta manda esto cuando el cliente da clic en "WhatsApp" desde un post/anuncio
      const referral = msg.referral || msg.context?.referral || null;
      let linkPost = '';
      let infoPost = '';
      if (referral) {
        // source_url = link del post, headline = titulo del anuncio, source_id = id del post
        linkPost = referral.source_url || '';
        const titulo = referral.headline || '';
        const idPost = referral.source_id || '';
        infoPost = `\n🔗 Viene del post: ${linkPost || idPost || 'Facebook Ad'}${titulo ? `\n📌 Anuncio: ${titulo}` : ''}`;
      }

      // Texto que guardamos en el Sheet (con el link incluido para que lo veas en la web)
      const textParaGuardar = linkPost ? `${text}${infoPost}` : text;

      // Guardar chat para la bandeja web
      if (process.env.SHEET_WEBHOOK_URL) {
        try {
          await fetch(process.env.SHEET_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, name: clientName, text: textParaGuardar, date: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }) })
          });
        } catch(e) {}
      }

      // SI ERES TU RESPONDIENDO
      if (from === OWNER_NUMBER) {
        const match = text.match(/^(\+?51\d{9}|\d{9,15})\s*:\s*([\s\S]+)/);
        if (match) {
          let target = match[1].replace('+', '');
          if (target.length === 9) target = '51' + target;
          await sendWA(target, match[2].trim());
          await sendWA(OWNER_NUMBER, `✅ Enviado a +${target} desde 992 103 781`);
          return res.status(200).send('EVENT_RECEIVED');
        } else {
          await sendWA(OWNER_NUMBER, `Para responder: numero: mensaje\nEj: 51987654321: Hola`);
          return res.status(200).send('EVENT_RECEIVED');
        }
      }

      // === 1. MODO NOCHE: AHORA SI RESPONDE ===
      const horaPeru = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getHours();
      const esNoche = horaPeru >= 21 || horaPeru < 7;

      // DE DIA Y DE NOCHE - responde Claude normal
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          system: 'Eres el asistente de CSI CARIBE+. Cuando alguien te salude, responde exactamente con este mensaje y nada mas: Hola! Bienvenido, te saludamos de CSI CARIBE+ Gracias por contactarnos, a la brevedad posible responderemos tu solicitud. Para cualquier otro mensaje, responde de forma amable y corta.',
          messages: [{ role: 'user', content: text }]
        })
      });
      const data = await response.json();
      let reply = 'Perdona, no pude procesar tu mensaje. ¿Puedes intentarlo de nuevo?';
      if (data?.content?.[0]?.text) reply = data.content[0].text;

      // Si es de noche, le agregamos el aviso de noche al inicio
      if (esNoche) {
        reply = `Hola, gracias por escribirnos de noche 🌙 Soy el asistente de CSI CARIBE+ y te atiendo ahora mismo.\n\n${reply}`;
      }

      await sendWA(from, reply);

      // Aviso para ti - con link del post si vino de Facebook
      const icono = esNoche ? '🌙' : '🔔';
      const tituloAviso = esNoche ? 'MENSAJE DE NOCHE - CSI CARIBE (Bot ya respondió)' : 'NUEVO MENSAJE - CSI CARIBE';
      await sendWA(OWNER_NUMBER, `${icono} ${tituloAviso}\nDe: ${clientName} (+${from})\nMensaje: "${text}"${infoPost}\n\nEl bot respondió: "${reply}"\n\nPara contestar desde el 992 103 781:\n${from}: tu respuesta`);

      return res.status(200).send('EVENT_RECEIVED');
    } catch (e) {
      console.error('Error:', e);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }
  return res.status(405).end();
};
