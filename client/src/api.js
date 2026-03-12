const API_BASE = '/api';

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

export const api = {
    // Songs
    getSongs: () => request('/songs'),
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
    getMemberComments: (id) => request(`/members/${id}/comments`),
    addMember: (name) => request('/members', {
        method: 'POST',
        body: JSON.stringify({ name }),
    }),
    renameMember: (id, name) => request(`/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    }),
    deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),
};
