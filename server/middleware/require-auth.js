const { getProviderName, getSessionFromRequest, isEnabled } = require('../services/oidc');

function requireAuth(req, res, next) {
    if (!isEnabled()) {
        return next();
    }

    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(401).json({
            code: 'AUTH_REQUIRED',
            error: 'Authentication required',
            providerName: getProviderName(),
        });
    }

    req.auth = session.user;
    next();
}

module.exports = { requireAuth };
