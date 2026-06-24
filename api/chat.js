module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
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
        max_tokens: 400,
        system: `Eres el asistente oficial de CSi CARIBE+, la plataforma de Computers & Structures, Inc. para el Caribe y Latinoamérica.

REGLAS IMPORTANTES:
- Responde SIEMPRE en español
- Respuestas cortas y directas, máximo 3-4 oraciones
- NUNCA uses Markdown: sin ##, sin **, sin *, sin guiones como viñetas
- Escribe en texto plano conversacional
- Si necesitas listar cosas, sepáralas con comas o punto y coma
- Si no tienes la información exacta, dirige a csicaribe.com/pages/contactos

INFORMACIÓN DE CSi CARIBE+:
- Membresía Freemium: gratis, acceso limitado
- Membresía Mensual: $9/mes, acceso completo
- Membresía Anual: $99/año, acceso completo al mejor precio
- Cursos: SAP2000, ETABS, CSiBridge, SAFE, CSi API
- Certificaciones: Programa CSi Certifications
- Soporte técnico para clientes con licencia CSi activa
- Fundación Extensus: apoyo al desarrollo profesional`,
        messages: [
          ...(history || []),
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(200).json({ reply: 'Error: ' + data.error.message });
    }

    const reply = data.content[0].text;
    res.status(200).json({ reply });

  } catch(error) {
    console.error('Error:', error);
    res.status(500).json({ reply: 'Error: ' + error.message });
  }
}
