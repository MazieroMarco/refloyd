import { AUTH_REQUIRED_EVENT, api } from './api.js';
import { renderHeader } from './components/header.js';
import { renderAddSong } from './pages/add-song.js';
import { renderAuthGate } from './pages/auth-gate.js';
import { renderProfiles } from './pages/members.js';
import { renderProfileDetail } from './pages/profile-detail.js';
import { renderProfilePicker } from './pages/profile-picker.js';
import { renderProfileSettings } from './pages/profile-settings.js';
import { renderAddSetlist, renderEditSetlist } from './pages/setlist-editor.js';
import { renderSetlistDetail } from './pages/setlist-detail.js';
import { renderSetlistList } from './pages/setlist-list.js';
import { renderSongDetail } from './pages/song-detail.js';
import { renderSongList } from './pages/song-list.js';
import './styles/index.css';

const CURRENT_PROFILE_KEY = 'refloyd-profile-id';
const LEGACY_PROFILE_KEY = 'repetifloyd-member';
const AUTH_SUBJECT_KEY = 'refloyd-auth-subject';
let authSession = null;

// Simple hash-based router
const routes = {
    '': renderSongList,
    'songs': renderSongList,
    'song': renderSongDetail,
    'add-song': renderAddSong,
    'setlists': renderSetlistList,
    'setlist': renderSetlistDetail,
    'add-setlist': renderAddSetlist,
    'edit-setlist': renderEditSetlist,
    'profiles': renderProfiles,
    'members': renderProfiles,
    'profile': renderProfileDetail,
    'profile-settings': renderProfileSettings,
    'choose-profile': renderProfilePicker,
};

function getRoute() {
    const hash = window.location.hash.slice(1) || '';
    const [page, ...params] = hash.split('/');
    return { page, params };
}

export function navigate(path) {
    const normalizedPath = path || '';
    const nextHash = normalizedPath ? `#${normalizedPath}` : '';
    if (window.location.hash === nextHash) {
        render();
        return;
    }
    window.location.hash = normalizedPath;
}

export function getCurrentProfileId() {
    return localStorage.getItem(CURRENT_PROFILE_KEY) || '';
}

export function setCurrentProfileId(profileId) {
    if (profileId) {
        localStorage.setItem(CURRENT_PROFILE_KEY, String(profileId));
    } else {
        localStorage.removeItem(CURRENT_PROFILE_KEY);
    }
    localStorage.removeItem(LEGACY_PROFILE_KEY);
}

export function clearCurrentProfileId() {
    localStorage.removeItem(CURRENT_PROFILE_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
}

function clearStoredAuthSubject() {
    localStorage.removeItem(AUTH_SUBJECT_KEY);
}

function syncAuthSubject(nextAuthSession) {
    if (!nextAuthSession?.enabled) {
        clearStoredAuthSubject();
        return;
    }

    if (!nextAuthSession.authenticated || !nextAuthSession.user?.subject) {
        clearCurrentProfileId();
        clearStoredAuthSubject();
        return;
    }

    const nextSubject = nextAuthSession.user.subject;
    const previousSubject = localStorage.getItem(AUTH_SUBJECT_KEY);

    if (previousSubject !== nextSubject) {
        clearCurrentProfileId();
    }

    localStorage.setItem(AUTH_SUBJECT_KEY, nextSubject);
}

function consumeAuthError() {
    const url = new URL(window.location.href);
    const authError = url.searchParams.get('authError');

    if (!authError) {
        return '';
    }

    url.searchParams.delete('authError');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return authError;
}

async function ensureAuthSession(force = false) {
    if (!force && authSession) {
        return authSession;
    }

    authSession = await api.getAuthSession();
    syncAuthSubject(authSession);
    return authSession;
}

function renderAppShell(app, page, nextAuthSession, currentProfile) {
    app.innerHTML = '';
    app.appendChild(renderHeader(page, {
        authSession: nextAuthSession,
        currentProfile,
    }));

    const content = document.createElement('main');
    content.className = 'main-content page-enter';
    app.appendChild(content);
    return content;
}

function renderAuthScreen(app, page, nextAuthSession, errorMessage = '') {
    const content = renderAppShell(app, page, nextAuthSession, null);
    renderAuthGate(content, {
        providerName: nextAuthSession?.providerName || 'Single Sign-On',
        errorMessage,
    });
}

export function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2500);
}

function resolveStoredProfile(members) {
    const currentProfileId = getCurrentProfileId();
    if (currentProfileId) {
        const selectedProfile = members.find((member) => String(member.id) === currentProfileId);
        if (selectedProfile) {
            return selectedProfile;
        }
        clearCurrentProfileId();
    }

    const legacyProfileName = localStorage.getItem(LEGACY_PROFILE_KEY);
    if (!legacyProfileName) {
        return null;
    }

    const legacyProfile = members.find(
        (member) => member.name.toLowerCase() === legacyProfileName.toLowerCase()
    );

    if (legacyProfile) {
        setCurrentProfileId(legacyProfile.id);
        return legacyProfile;
    }

    clearCurrentProfileId();
    return null;
}

async function render() {
    const app = document.getElementById('app');
    const { page, params } = getRoute();
    const routeHandler = routes[page] || routes[''];
    const authError = consumeAuthError();
    let nextAuthSession;

    try {
        nextAuthSession = await ensureAuthSession();
    } catch (err) {
        const content = renderAppShell(app, page, null, null);
        content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Authentication setup issue</div>
        <div class="empty-state-desc">${err.message}</div>
      </div>
    `;
        return;
    }

    if (nextAuthSession.enabled && !nextAuthSession.authenticated) {
        renderAuthScreen(app, page, nextAuthSession, authError);
        return;
    }

    let members = [];
    let currentProfile = null;

    try {
        members = await api.getMembers();
        currentProfile = resolveStoredProfile(members);
    } catch (err) {
        if (err.code === 'AUTH_REQUIRED') {
            authSession = { ...nextAuthSession, authenticated: false, user: null };
            renderAuthScreen(app, page, authSession, 'Your session expired. Please sign in again.');
            return;
        }

        members = [];
        currentProfile = null;
    }

    if (page !== 'choose-profile' && !currentProfile) {
        navigate('choose-profile');
        return;
    }

    const content = renderAppShell(app, page, nextAuthSession, currentProfile);

    try {
        await routeHandler(content, params, { members, currentProfile });
    } catch (err) {
        if (err.code === 'AUTH_REQUIRED') {
            authSession = { ...nextAuthSession, authenticated: false, user: null };
            renderAuthScreen(app, page, authSession, 'Your session expired. Please sign in again.');
            return;
        }

        content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Something went wrong</div>
        <div class="empty-state-desc">${err.message}</div>
      </div>
    `;
    }
}

window.addEventListener('hashchange', () => {
    render();
});

window.addEventListener(AUTH_REQUIRED_EVENT, () => {
    authSession = authSession?.enabled
        ? { ...authSession, authenticated: false, user: null }
        : null;
    clearCurrentProfileId();
    clearStoredAuthSubject();
    render();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
}

render();
