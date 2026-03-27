const express = require('express');
const { asyncHandler } = require('../utils/async-handler');
const {
    beginAuthentication,
    buildAppUrl,
    buildLogoutUrl,
    clearSessionCookie,
    completeAuthentication,
    destroySession,
    getProviderName,
    getSessionFromRequest,
    isEnabled,
    sanitizeReturnTo,
    setSessionCookie,
} = require('../services/oidc');

const router = express.Router();

router.get('/session', asyncHandler(async (req, res) => {
    if (!isEnabled()) {
        return res.json({
            enabled: false,
            authenticated: true,
            providerName: null,
            user: null,
        });
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
        return res.json({
            enabled: true,
            authenticated: false,
            providerName: getProviderName(),
            user: null,
        });
    }

    res.json({
        enabled: true,
        authenticated: true,
        providerName: getProviderName(),
        user: session.user,
        expiresAt: session.expiresAt,
    });
}));

router.get('/login', asyncHandler(async (req, res) => {
    const returnTo = sanitizeReturnTo(req.query.returnTo);

    if (!isEnabled()) {
        return res.redirect(buildAppUrl(returnTo));
    }

    try {
        const authorizationUrl = await beginAuthentication(returnTo);
        res.redirect(authorizationUrl);
    } catch (err) {
        clearSessionCookie(res);
        res.redirect(buildAppUrl(returnTo, {
            authError: 'Unable to start single sign-on. Check the OIDC server settings.',
        }));
    }
}));

router.get('/callback', asyncHandler(async (req, res) => {
    try {
        const { sessionId, expiresAt, returnTo } = await completeAuthentication(req.query);
        setSessionCookie(res, sessionId, expiresAt);
        res.redirect(buildAppUrl(returnTo));
    } catch (err) {
        clearSessionCookie(res);
        res.redirect(buildAppUrl('#songs', {
            authError: err.message || 'Authentication failed. Please try again.',
        }));
    }
}));

router.get('/logout', asyncHandler(async (req, res) => {
    const returnTo = sanitizeReturnTo(req.query.returnTo, '');
    const session = await getSessionFromRequest(req, { includeIdToken: true });

    if (session?.id) {
        await destroySession(session.id);
    }

    clearSessionCookie(res);

    if (!isEnabled()) {
        return res.redirect(buildAppUrl(returnTo));
    }

    try {
        const logoutUrl = await buildLogoutUrl(session, returnTo);
        if (logoutUrl) {
            return res.redirect(logoutUrl);
        }
    } catch (err) {
        // Fall back to a local sign-out redirect if the provider logout URL is unavailable.
    }

    res.redirect(buildAppUrl(returnTo));
}));

module.exports = router;
