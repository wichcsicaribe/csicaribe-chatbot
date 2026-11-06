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

      // Guardar chat para la bandeja web (se guarda en Google Sheet si lo configuras, si no solo en logs)
      if (process.env.SHEET_WEBHOOK_URL) {
        try {
          await fetch(process.env.SHEET_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, name: clientName, text, date: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }) })
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

      // MODO NOCHE: 21:00 a 07:00 hora Peru
      const horaPeru = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getHours();
      const esNoche = horaPeru >= 21 || horaPeru < 7;

      if (esNoche) {
        // De noche NO responde el bot, solo te avisa a ti
        await sendWA(OWNER_NUMBER, `🌙 MENSAJE DE NOCHE - CSI CARIBE\nDe: ${clientName} (+${from})\nMensaje: "${text}"\nHora: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}\n\nEl bot NO respondió. Para contestar desde el 992 103 781, mandame:\n${from}: tu respuesta`);
        return res.status(200).send('EVENT_RECEIVED');
      }

      // DE DIA - responde Claude normal
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

      await sendWA(from, reply);
      await sendWA(OWNER_NUMBER, `🔔 NUEVO MENSAJE - CSI CARIBE\nDe: ${clientName} (+${from})\nMensaje: "${text}"\n\nPara contestar desde el 992 103 781:\n${from}: tu respuesta`);

      return res.status(200).send('EVENT_RECEIVED');
    } catch (e) {
      console.error('Error:', e);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }
  return res.status(405).end();
};
