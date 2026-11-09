module.exports = async function handler(req, res) {
  return res.json({
    has_REST_API_URL: !!process.env.UPSTASH_REDIS_REST_API_URL,
    has_KV_URL: !!process.env.UPSTASH_REDIS_REST_KV_URL,
    has_ST_TOKEN: !!process.env.UPSTASH_REDIS_ST_API_TOKEN,
    has_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    has_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    node: process.version
  });
};
