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
        max_tokens: 1024,
        system: `Eres el asistente oficial de CSi CARIBE+. Responde siempre en español.`,
        messages: [
          ...(history || []),
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();
    console.log('Respuesta API:', JSON.stringify(data));

    if (data.error) {
      return res.status(200).json({ reply: 'Error API: ' + data.error.message });
    }

    const reply = data.content[0].text;
    res.status(200).json({ reply });

  } catch(error) {
    console.error('Error:', error);
    res.status(500).json({ reply: 'Error: ' + error.message });
  }
}
