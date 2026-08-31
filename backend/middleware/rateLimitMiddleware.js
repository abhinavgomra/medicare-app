const buckets = new Map();

function cleanupExpired(nowMs) {
    for (const [key, entry] of buckets.entries()) {
        if (!entry || entry.resetAt <= nowMs) {
            buckets.delete(key);
        }
    }
}

setInterval(() => {
    cleanupExpired(Date.now());
}, 60 * 1000).unref();

function defaultKeyGenerator(req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const route = req.baseUrl + req.path;
    return `${ip}:${route}`;
}

function createRateLimiter({ windowMs = 60 * 1000, max = 30, keyGenerator = defaultKeyGenerator } = {}) {
    return function rateLimiter(req, res, next) {
        const now = Date.now();
        const key = String(keyGenerator(req));
        const existing = buckets.get(key);

        if (!existing || existing.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            return next();
        }

        existing.count += 1;
        if (existing.count <= max) return next();

        const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: 'Too many requests. Please retry shortly.'
        });
    };
}

module.exports = { createRateLimiter };

