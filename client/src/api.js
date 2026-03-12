const API_BASE = '/api';

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

async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Request failed');
    }
    return res.json();
}

async function multipartRequest(path, method, formData) {
    const res = await fetch(`${API_BASE}${path}`, {
        method,
        body: formData,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Request failed');
    }

    return res.json();
}

export const api = {
    // Songs
    getSongs: (sort) => request(`/songs${createQuery({ sort })}`),
    getSong: (id) => request(`/songs/${id}`),
    addSong: async (formData) => {
        const res = await fetch(`${API_BASE}/songs`, { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Request failed');
        }
        return res.json();
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
    getComments: (songId) => request(`/songs/${songId}/comments`),
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
