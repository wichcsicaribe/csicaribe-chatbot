module.exports = async function handler(req, res) {
  const keys = Object.keys(process.env).filter(k => k.includes('UPSTASH'));
  return res.json({ keys });
};
