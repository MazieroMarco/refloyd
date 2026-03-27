const crypto = require('crypto');
const db = require('../db');

const SESSION_COOKIE_NAME = 'refloyd-session';
const AUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 60 * 1000;
const DEFAULT_PROVIDER_NAME = 'Single Sign-On';

const pendingAuthorizations = new Map();
let discoveryPromise = null;
let cachedJwks = null;
let cachedJwksFetchedAt = 0;

const settings = loadSettings();

function loadSettings() {
    const enabledFlag = (process.env.OIDC_ENABLED || '').trim().toLowerCase();
    const issuerUrl = stripTrailingSlash((process.env.OIDC_ISSUER_URL || '').trim());
    const discoveryUrl = (process.env.OIDC_DISCOVERY_URL || '').trim();
    const clientId = (process.env.OIDC_CLIENT_ID || '').trim();
    const clientSecret = (process.env.OIDC_CLIENT_SECRET || '').trim();
    const appOrigin = stripTrailingSlash(
        (process.env.APP_ORIGIN || 'http://localhost:5173').trim() || 'http://localhost:5173'
    );
    const backendOrigin = stripTrailingSlash((process.env.BACKEND_ORIGIN || '').trim()) || appOrigin;
    const scope = (process.env.OIDC_SCOPE || 'openid profile email').trim();
    const providerName = (process.env.OIDC_PROVIDER_NAME || '').trim() || DEFAULT_PROVIDER_NAME;
    const sessionTtlHours = Number(process.env.OIDC_SESSION_TTL_HOURS || '12');
    const sessionCookieSameSite = normalizeSameSite(
        process.env.OIDC_SESSION_COOKIE_SAME_SITE || 'Lax'
    );
    const clientAuthMethod = (process.env.OIDC_CLIENT_AUTH_METHOD || '').trim()
        || (clientSecret ? 'client_secret_basic' : 'none');
    const extraAuthParams = Array.from(
        new URLSearchParams(process.env.OIDC_AUTHORIZATION_EXTRA_PARAMS || '').entries()
    );
    const enabled = enabledFlag === 'true' || Boolean(clientId || issuerUrl || discoveryUrl);

    if (!enabled) {
        return {
            enabled: false,
            appOrigin,
            backendOrigin,
            providerName,
            resolvedProviderName: providerName,
            secureCookies: backendOrigin.startsWith('https://'),
            sessionCookieSameSite,
            sessionTtlMs: 12 * 60 * 60 * 1000,
        };
    }

    if (!clientId) {
        throw new Error('OIDC_CLIENT_ID is required when OIDC is enabled');
    }

    if (!issuerUrl && !discoveryUrl) {
        throw new Error('OIDC_ISSUER_URL or OIDC_DISCOVERY_URL is required when OIDC is enabled');
    }

    if (!['none', 'client_secret_basic', 'client_secret_post'].includes(clientAuthMethod)) {
        throw new Error('OIDC_CLIENT_AUTH_METHOD must be none, client_secret_basic, or client_secret_post');
    }

    if (clientAuthMethod !== 'none' && !clientSecret) {
        throw new Error('OIDC_CLIENT_SECRET is required for the selected OIDC client auth method');
    }

    if (sessionCookieSameSite === 'None' && !backendOrigin.startsWith('https://')) {
        throw new Error('OIDC_SESSION_COOKIE_SAME_SITE=None requires BACKEND_ORIGIN to use https');
    }

    return {
        enabled: true,
        issuerUrl,
        discoveryUrl,
        clientId,
        clientSecret,
        clientAuthMethod,
        appOrigin,
        backendOrigin,
        scope,
        providerName,
        resolvedProviderName: providerName,
        secureCookies: backendOrigin.startsWith('https://'),
        sessionCookieSameSite,
        sessionTtlMs: Number.isFinite(sessionTtlHours) && sessionTtlHours > 0
            ? sessionTtlHours * 60 * 60 * 1000
            : 12 * 60 * 60 * 1000,
        extraAuthParams,
    };
}

function isEnabled() {
    return settings.enabled;
}

function getProviderName() {
    return settings.resolvedProviderName || settings.providerName || DEFAULT_PROVIDER_NAME;
}

function getAppOrigin() {
    return settings.appOrigin;
}

function getBackendOrigin() {
    return settings.backendOrigin;
}

function getRedirectUri() {
    return `${settings.backendOrigin}/api/auth/callback`;
}

function sanitizeReturnTo(value, fallback = '#songs') {
    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    if (!trimmed.startsWith('#') || /[\r\n]/.test(trimmed)) {
        return fallback;
    }

    return trimmed;
}

function buildAppUrl(returnTo = '', searchParams = {}) {
    const url = new URL(`${settings.appOrigin}/`);
    const hash = sanitizeReturnTo(returnTo, '');

    Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    if (hash) {
        url.hash = hash;
    }

    return url.toString();
}

async function beginAuthentication(returnTo) {
    cleanupPendingAuthorizations();

    const discovery = await getDiscovery();
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken(64);
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    pendingAuthorizations.set(state, {
        codeVerifier,
        nonce,
        returnTo: sanitizeReturnTo(returnTo),
        createdAt: Date.now(),
    });

    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', settings.clientId);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', settings.scope);
    authorizationUrl.searchParams.set('redirect_uri', getRedirectUri());
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    settings.extraAuthParams.forEach(([key, value]) => {
        if (key && value) {
            authorizationUrl.searchParams.set(key, value);
        }
    });

    return authorizationUrl.toString();
}

async function completeAuthentication(query) {
    cleanupPendingAuthorizations();

    if (typeof query?.error === 'string' && query.error) {
        throw new Error(query.error_description || query.error);
    }

    const code = typeof query?.code === 'string' ? query.code : '';
    const state = typeof query?.state === 'string' ? query.state : '';
    if (!code || !state) {
        throw new Error('Missing authorization response');
    }

    const authorization = pendingAuthorizations.get(state);
    if (!authorization) {
        throw new Error('This sign-in attempt expired. Please start again.');
    }

    pendingAuthorizations.delete(state);

    const tokenSet = await exchangeCode(code, authorization.codeVerifier);
    if (!tokenSet.id_token) {
        throw new Error('The identity provider did not return an ID token');
    }

    const idTokenClaims = await verifyIdToken(tokenSet.id_token, authorization.nonce);
    const userClaims = await fetchUserClaims(tokenSet.access_token, idTokenClaims);

    if (userClaims.sub && userClaims.sub !== idTokenClaims.sub) {
        throw new Error('The identity provider returned inconsistent user info');
    }

    const user = normalizeUser({
        ...idTokenClaims,
        ...userClaims,
        sub: idTokenClaims.sub,
    });

    const session = await createSession(user, tokenSet.id_token);

    return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        returnTo: authorization.returnTo,
    };
}

async function getSessionFromRequest(req, options = {}) {
    if (!settings.enabled) {
        return null;
    }

    await cleanupExpiredSessions();

    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
        return null;
    }

    const result = await db.query(
        `
      SELECT id, user_json, id_token, expires_at
      FROM auth_sessions
      WHERE id = $1 AND expires_at > $2
    `,
        [sessionId, new Date().toISOString()]
    );
    const row = result.rows[0];

    if (!row) {
        return null;
    }

    let user;
    try {
        user = JSON.parse(row.user_json);
    } catch (err) {
        await db.query('DELETE FROM auth_sessions WHERE id = $1', [row.id]);
        return null;
    }

    return {
        id: row.id,
        user,
        expiresAt: row.expires_at,
        idToken: options.includeIdToken ? row.id_token : undefined,
    };
}

async function createSession(user, idToken) {
    await cleanupExpiredSessions();

    const sessionId = randomToken();
    const expiresAt = new Date(Date.now() + settings.sessionTtlMs).toISOString();

    await db.query(
        `
      INSERT INTO auth_sessions (id, subject, user_json, id_token, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `,
        [sessionId, user.subject, JSON.stringify(user), idToken || null, expiresAt]
    );

    return { id: sessionId, expiresAt };
}

async function destroySession(sessionId) {
    if (!sessionId) {
        return;
    }

    await db.query('DELETE FROM auth_sessions WHERE id = $1', [sessionId]);
}

function setSessionCookie(res, sessionId, expiresAt) {
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        path: '/',
        sameSite: settings.sessionCookieSameSite,
        secure: settings.secureCookies,
        expires: new Date(expiresAt),
    }));
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        path: '/',
        sameSite: settings.sessionCookieSameSite,
        secure: settings.secureCookies,
        expires: new Date(0),
        maxAge: 0,
    }));
}

async function buildLogoutUrl(session, returnTo = '') {
    if (!settings.enabled || !session?.idToken) {
        return null;
    }

    const discovery = await getDiscovery().catch(() => null);
    if (!discovery?.end_session_endpoint) {
        return null;
    }

    const logoutUrl = new URL(discovery.end_session_endpoint);
    logoutUrl.searchParams.set('id_token_hint', session.idToken);
    logoutUrl.searchParams.set('post_logout_redirect_uri', buildAppUrl(returnTo));
    logoutUrl.searchParams.set('client_id', settings.clientId);
    return logoutUrl.toString();
}

async function getDiscovery() {
    if (!settings.enabled) {
        return null;
    }

    if (!discoveryPromise) {
        discoveryPromise = loadDiscovery().catch((err) => {
            discoveryPromise = null;
            throw err;
        });
    }

    return discoveryPromise;
}

async function loadDiscovery() {
    const discovery = await fetchJson(
        settings.discoveryUrl || `${settings.issuerUrl}/.well-known/openid-configuration`,
        { headers: { Accept: 'application/json' } },
        'Failed to load OIDC discovery'
    );

    if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.issuer) {
        throw new Error('OIDC discovery is missing required endpoints');
    }

    if (!discovery.jwks_uri) {
        throw new Error('OIDC discovery is missing jwks_uri');
    }

    if (settings.providerName === DEFAULT_PROVIDER_NAME) {
        try {
            settings.resolvedProviderName = new URL(discovery.issuer).hostname;
        } catch (err) {
            settings.resolvedProviderName = settings.providerName;
        }
    }

    return discovery;
}

async function exchangeCode(code, codeVerifier) {
    const discovery = await getDiscovery();
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        client_id: settings.clientId,
        code_verifier: codeVerifier,
    });

    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (settings.clientAuthMethod === 'client_secret_basic') {
        headers.Authorization = `Basic ${Buffer.from(
            `${settings.clientId}:${settings.clientSecret}`
        ).toString('base64')}`;
    } else if (settings.clientAuthMethod === 'client_secret_post') {
        body.set('client_secret', settings.clientSecret);
    }

    const response = await fetch(discovery.token_endpoint, {
        method: 'POST',
        headers,
        body: body.toString(),
    });

    const payload = await parseResponseBody(response);
    if (!response.ok) {
        const errorMessage = payload?.error_description || payload?.error || response.statusText;
        throw new Error(`Token exchange failed: ${errorMessage}`);
    }

    return payload;
}

async function fetchUserClaims(accessToken, idTokenClaims) {
    const discovery = await getDiscovery();
    if (!discovery.userinfo_endpoint || !accessToken) {
        return idTokenClaims;
    }

    try {
        const userInfo = await fetchJson(
            discovery.userinfo_endpoint,
            {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            },
            'Failed to fetch user info'
        );

        return userInfo || idTokenClaims;
    } catch (err) {
        return idTokenClaims;
    }
}

async function verifyIdToken(idToken, expectedNonce) {
    const discovery = await getDiscovery();
    const { header, payload, signingInput, signature } = decodeJwt(idToken);

    await verifySignature({ header, signingInput, signature });
    validateIdTokenClaims(payload, discovery.issuer, expectedNonce);

    return payload;
}

async function verifySignature({ header, signingInput, signature }) {
    if (!header?.alg || header.alg === 'none') {
        throw new Error('Unsupported ID token algorithm');
    }

    if (header.alg.startsWith('HS')) {
        if (!settings.clientSecret) {
            throw new Error('Cannot verify an HMAC-signed ID token without OIDC_CLIENT_SECRET');
        }

        const digest = getHmacDigest(header.alg);
        const expected = crypto.createHmac(digest, settings.clientSecret)
            .update(signingInput)
            .digest();

        if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
            throw new Error('Invalid ID token signature');
        }

        return;
    }

    const jwk = await getSigningJwk(header);
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const verification = getVerificationOptions(header.alg);
    const verified = crypto.verify(
        verification.algorithm,
        signingInput,
        { key, ...verification.options },
        signature
    );

    if (!verified) {
        throw new Error('Invalid ID token signature');
    }
}

async function getSigningJwk(header, forceRefresh = false) {
    const jwks = await getJwks(forceRefresh);
    const matchingKey = jwks.keys.find((candidate) => {
        if (candidate.kid && header.kid && candidate.kid !== header.kid) {
            return false;
        }

        if (candidate.use && candidate.use !== 'sig') {
            return false;
        }

        return !candidate.alg || candidate.alg === header.alg;
    });

    if (matchingKey) {
        return matchingKey;
    }

    if (!forceRefresh) {
        return getSigningJwk(header, true);
    }

    throw new Error('Unable to find a signing key for the ID token');
}

async function getJwks(forceRefresh = false) {
    const discovery = await getDiscovery();
    const shouldRefresh = forceRefresh
        || !cachedJwks
        || (Date.now() - cachedJwksFetchedAt) > JWKS_CACHE_TTL_MS;

    if (!shouldRefresh) {
        return cachedJwks;
    }

    cachedJwks = await fetchJson(
        discovery.jwks_uri,
        { headers: { Accept: 'application/json' } },
        'Failed to load OIDC signing keys'
    );
    if (!Array.isArray(cachedJwks.keys)) {
        throw new Error('OIDC signing keys response is invalid');
    }
    cachedJwksFetchedAt = Date.now();
    return cachedJwks;
}

function validateIdTokenClaims(payload, expectedIssuer, expectedNonce) {
    const now = Date.now();

    if (!payload?.sub) {
        throw new Error('The ID token is missing the subject claim');
    }

    if (payload.iss !== expectedIssuer) {
        throw new Error('The ID token issuer did not match the configured provider');
    }

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(settings.clientId)) {
        throw new Error('The ID token audience did not match this application');
    }

    if (audiences.length > 1) {
        if (!payload.azp) {
            throw new Error('The ID token is missing the authorized party claim');
        }

        if (payload.azp !== settings.clientId) {
            throw new Error('The ID token authorized party did not match this application');
        }
    }

    if (expectedNonce && payload.nonce !== expectedNonce) {
        throw new Error('The ID token nonce did not match the login request');
    }

    if (!payload.exp || (payload.exp * 1000) <= (now - CLOCK_TOLERANCE_MS)) {
        throw new Error('The ID token has expired');
    }

    if (payload.nbf && (payload.nbf * 1000) > (now + CLOCK_TOLERANCE_MS)) {
        throw new Error('The ID token is not valid yet');
    }

    if (payload.iat && (payload.iat * 1000) > (now + CLOCK_TOLERANCE_MS)) {
        throw new Error('The ID token was issued in the future');
    }
}

function normalizeUser(claims) {
    return {
        subject: String(claims.sub),
        displayName: claims.name || claims.preferred_username || claims.email || String(claims.sub),
        email: claims.email || '',
        preferredUsername: claims.preferred_username || '',
        name: claims.name || '',
    };
}

function decodeJwt(token) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid ID token format');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    return {
        header: JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')),
        payload: JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')),
        signingInput: Buffer.from(`${headerPart}.${payloadPart}`),
        signature: Buffer.from(signaturePart, 'base64url'),
    };
}

function getVerificationOptions(alg) {
    switch (alg) {
    case 'RS256':
        return { algorithm: 'RSA-SHA256', options: {} };
    case 'RS384':
        return { algorithm: 'RSA-SHA384', options: {} };
    case 'RS512':
        return { algorithm: 'RSA-SHA512', options: {} };
    case 'PS256':
        return {
            algorithm: 'sha256',
            options: {
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            },
        };
    case 'PS384':
        return {
            algorithm: 'sha384',
            options: {
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            },
        };
    case 'PS512':
        return {
            algorithm: 'sha512',
            options: {
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            },
        };
    case 'ES256':
        return { algorithm: 'sha256', options: { dsaEncoding: 'ieee-p1363' } };
    case 'ES384':
        return { algorithm: 'sha384', options: { dsaEncoding: 'ieee-p1363' } };
    case 'ES512':
        return { algorithm: 'sha512', options: { dsaEncoding: 'ieee-p1363' } };
    default:
        throw new Error(`Unsupported ID token algorithm: ${alg}`);
    }
}

function getHmacDigest(alg) {
    switch (alg) {
    case 'HS256':
        return 'sha256';
    case 'HS384':
        return 'sha384';
    case 'HS512':
        return 'sha512';
    default:
        throw new Error(`Unsupported ID token algorithm: ${alg}`);
    }
}

async function fetchJson(url, options, label) {
    const response = await fetch(url, options);
    const payload = await parseResponseBody(response);

    if (!response.ok) {
        const errorMessage = typeof payload === 'string'
            ? payload
            : payload?.error_description || payload?.error || response.statusText;
        throw new Error(`${label}: ${errorMessage}`);
    }

    return payload;
}

async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        return text;
    }
}

function cleanupPendingAuthorizations() {
    const cutoff = Date.now() - AUTH_FLOW_TTL_MS;
    for (const [state, data] of pendingAuthorizations.entries()) {
        if (data.createdAt < cutoff) {
            pendingAuthorizations.delete(state);
        }
    }
}

async function cleanupExpiredSessions() {
    await db.query('DELETE FROM auth_sessions WHERE expires_at <= $1', [new Date().toISOString()]);
}

function parseCookies(rawCookieHeader = '') {
    return rawCookieHeader.split(';').reduce((cookies, pair) => {
        const separatorIndex = pair.indexOf('=');
        if (separatorIndex === -1) {
            return cookies;
        }

        const key = pair.slice(0, separatorIndex).trim();
        const value = pair.slice(separatorIndex + 1).trim();
        if (key) {
            cookies[key] = decodeURIComponent(value);
        }
        return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
    }

    if (options.expires) {
        parts.push(`Expires=${options.expires.toUTCString()}`);
    }

    if (options.httpOnly) {
        parts.push('HttpOnly');
    }

    if (options.path) {
        parts.push(`Path=${options.path}`);
    }

    if (options.sameSite) {
        parts.push(`SameSite=${options.sameSite}`);
    }

    if (options.secure) {
        parts.push('Secure');
    }

    return parts.join('; ');
}

function stripTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}

function normalizeSameSite(value) {
    const normalized = String(value || 'Lax').trim().toLowerCase();

    if (normalized === 'strict') {
        return 'Strict';
    }

    if (normalized === 'none') {
        return 'None';
    }

    return 'Lax';
}

function randomToken(size = 32) {
    return crypto.randomBytes(size).toString('base64url');
}

module.exports = {
    beginAuthentication,
    buildAppUrl,
    buildLogoutUrl,
    clearSessionCookie,
    completeAuthentication,
    destroySession,
    getAppOrigin,
    getBackendOrigin,
    getProviderName,
    getRedirectUri,
    getSessionFromRequest,
    isEnabled,
    sanitizeReturnTo,
    setSessionCookie,
};
