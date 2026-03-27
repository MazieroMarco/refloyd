function getRuntimeConfig() {
    return window.__REFLOYD_CONFIG__ || {};
}

function stripTrailingSlash(value = '') {
    return value.replace(/\/+$/, '');
}

function ensureLeadingSlash(value = '') {
    return value.startsWith('/') ? value : `/${value}`;
}

export function getBackendBaseUrl() {
    const config = getRuntimeConfig();
    return stripTrailingSlash(config.backendUrl || '');
}

export function getApiBaseUrl() {
    const backendBaseUrl = getBackendBaseUrl();
    return backendBaseUrl ? `${backendBaseUrl}/api` : '/api';
}

export function buildBackendUrl(path = '') {
    if (!path) {
        return getBackendBaseUrl();
    }

    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
    }

    const normalizedPath = ensureLeadingSlash(path);
    const backendBaseUrl = getBackendBaseUrl();
    return backendBaseUrl ? `${backendBaseUrl}${normalizedPath}` : normalizedPath;
}
