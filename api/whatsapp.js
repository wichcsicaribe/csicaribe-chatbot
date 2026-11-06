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
      console.log('WA webhook recibido:', JSON.stringify(req.body || {}));
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const msg = value?.messages?.[0];

      // Si no es mensaje de texto, solo responder OK
      if (!msg || msg.type !== 'text') {
        return res.status(200).send('EVENT_RECEIVED');
      }

      const from = msg.from;
      const text = msg.text?.body || '';

      // Llamar a Claude igual que en chat.js
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 500,
          system: 'Eres el asistente de CSI CARIBE+. Cuando alguien te salude, responde exactamente con este mensaje y nada mas: Hola! Bienvenido, te saludamos de CSI CARIBE+ Gracias por contactarnos, a la brevedad posible responderemos tu solicitud. Para cualquier otro mensaje, responde de forma amable y corta.',
          messages: [{ role: 'user', content: text }]
        })
      });

      const data = await response.json();
      let reply = 'Perdona, no pude procesar tu mensaje. ¿Puedes intentarlo de nuevo?';
      if (data?.content?.[0]?.text) {
        reply = data.content[0].text;
      }
      console.log('Respuesta Claude:', reply);

      // Enviar respuesta por WhatsApp
      const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_P_NUMBER_ID;
      const waRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: reply }
        })
      });
      const waData = await waRes.json();
console.log('Respuesta Meta WhatsApp:', JSON.stringify(waData));
console.log('Mensaje enviado a', from);

      return res.status(200).send('EVENT_RECEIVED');
    } catch (e) {
      console.error('Error en whatsapp:', e);
      return res.status(200).send('EVENT_RECEIVED');
    }
  }

  return res.status(405).end();
};
