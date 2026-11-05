// api/whatsapp.js - PASO 1: verificacion del webhook de Meta + registro de mensajes entrantes
// Variable de entorno requerida en Vercel: WHATSAPP_VERIFY_TOKEN

module.exports = async function handler(req, res) {
  // Meta verifica el webhook con un GET al configurar la URL de callback
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  // Meta envia cada mensaje entrante por POST
  if (req.method === 'POST') {
    try {
      console.log('WA webhook recibido:', JSON.stringify(req.body || {}));
    } catch (e) {
      console.error('Error al registrar:', e);
    }
    return res.status(200).send('EVENT_RECEIVED');
  }

  return res.status(405).end();
};
