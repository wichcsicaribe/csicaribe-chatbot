export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.csicaribe.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { message, history } = req.body;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `Eres el asistente oficial de CSi CARIBE+, la plataforma de Computers & Structures, Inc. para el Caribe y Latinoamérica. Responde siempre en español. Ayuda con: membresías (Freemium, $9/mes, $99/año), cursos de SAP2000, ETABS, CSiBridge, SAFE y CSi API, certificaciones CSi, webinars y soporte técnico. Si no tienes la información, dirige al usuario a csicaribe.com/pages/contactos. Sé técnico pero accesible. No inventes información.`,
      messages: [
        ...(history || []),
        { role: 'user', content: message }
      ]
    })
  });

  const data = await response.json();
  const reply = data.content[0].text;
  res.status(200).json({ reply });
}
