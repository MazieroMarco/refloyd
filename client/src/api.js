import { buildBackendUrl, getApiBaseUrl } from './config.js';

const API_BASE = getApiBaseUrl();
export const AUTH_REQUIRED_EVENT = 'refloyd:auth-required';

function createQuery(params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.set(key, value);
        }
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
}

async function handleResponse(res) {
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        const error = new Error(err.error || 'Request failed');
        error.code = err.code || '';
        error.status = res.status;
        error.providerName = err.providerName || '';

        if (res.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT, { detail: err }));
        }

        throw error;
    }

    if (res.status === 204) {
        return {};
    }

    return normalizePayloadUrls(await res.json());
}

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });

    return handleResponse(res);
}

async function multipartRequest(path, method, formData) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        method,
        body: formData,
    });

    return handleResponse(res);
}

export const api = {
    getAuthSession: () => request('/auth/session'),

    // Songs
    getSongs: (sort) => request(`/songs${createQuery({ sort })}`),
    getSong: (id) => request(`/songs/${id}`),
    addSong: async (formData) => {
        const res = await fetch(`${API_BASE}/songs`, {
            credentials: 'include',
            method: 'POST',
            body: formData,
        });
        return handleResponse(res);
    },
    rehearseSong: (id, delta = 1) => request(`/songs/${id}/rehearsal-count`, {
        method: 'PATCH',
        body: JSON.stringify({ delta }),
    }),
    deleteSong: (id) => request(`/songs/${id}`, { method: 'DELETE' }),

    // Setlists
    getSetlists: () => request('/setlists'),
    getSetlist: (id) => request(`/setlists/${id}`),
    createSetlist: (data) => request('/setlists', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateSetlist: (id, data) => request(`/setlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    }),
    deleteSetlist: (id) => request(`/setlists/${id}`, { method: 'DELETE' }),

    // Comments
    getComments: (songId, memberId) => request(`/songs/${songId}/comments${createQuery({ memberId })}`),
    addComment: (songId, data) => request(`/songs/${songId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateCommentStatus: (commentId, memberId, isDone) => request(`/comments/${commentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ memberId, isDone }),
    }),
    deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),

    // Members
    getMembers: () => request('/members'),
    getMember: (id) => request(`/members/${id}`),
    getMemberComments: (id) => request(`/members/${id}/comments`),
    addMember: (data) => (
        data instanceof FormData
            ? multipartRequest('/members', 'POST', data)
            : request('/members', {
                method: 'POST',
                body: JSON.stringify({ name: data }),
            })
    ),
    updateMember: (id, data) => (
        data instanceof FormData
            ? multipartRequest(`/members/${id}`, 'PATCH', data)
            : request(`/members/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            })
    ),
    renameMember: (id, name) => request(`/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    }),
    deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
};

function normalizePayloadUrls(value) {
    if (Array.isArray(value)) {
        return value.map(normalizePayloadUrls);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, normalizePayloadUrls(nestedValue)])
        );
    }

    if (typeof value === 'string' && value.startsWith('/uploads/')) {
        return buildBackendUrl(value);
    }

    return value;
}
