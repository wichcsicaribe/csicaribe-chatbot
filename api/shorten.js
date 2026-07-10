module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });

    // Try is.gd first
    const isgd = await fetch(
      'https://is.gd/create.php?format=simple&url=' + encodeURIComponent(url)
    );
    const short = await isgd.text();
    if (short && short.startsWith('https://is.gd/')) {
      return res.status(200).json({ short: short.trim() });
    }

    // Fallback: tinyurl
    const tiny = await fetch(
      'https://tinyurl.com/api-create.php?url=' + encodeURIComponent(url)
    );
    const tinyShort = await tiny.text();
    if (tinyShort && tinyShort.startsWith('http')) {
      return res.status(200).json({ short: tinyShort.trim() });
    }

    return res.status(200).json({ short: url });
  } catch (err) {
    return res.status(200).json({ short: req.body?.url || '' });
  }
};
