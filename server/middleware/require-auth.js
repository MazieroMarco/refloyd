const { getProviderName, getSessionFromRequest, isEnabled } = require('../services/oidc');

async function requireAuth(req, res, next) {
    if (!isEnabled()) {
        return next();
    }

    try {
        const session = await getSessionFromRequest(req);
        if (!session) {
            return res.status(401).json({
                code: 'AUTH_REQUIRED',
                error: 'Authentication required',
                providerName: getProviderName(),
            });
        }

        req.auth = session.user;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = { requireAuth };
