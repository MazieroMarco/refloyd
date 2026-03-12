import { api } from './api.js';
import { renderHeader } from './components/header.js';
import { renderAddSong } from './pages/add-song.js';
import { renderProfiles } from './pages/members.js';
import { renderProfileDetail } from './pages/profile-detail.js';
import { renderProfilePicker } from './pages/profile-picker.js';
import { renderSongDetail } from './pages/song-detail.js';
import { renderSongList } from './pages/song-list.js';
import './styles/index.css';

const CURRENT_PROFILE_KEY = 'refloyd-profile-id';
const LEGACY_PROFILE_KEY = 'repetifloyd-member';

// Simple hash-based router
const routes = {
    '': renderSongList,
    'songs': renderSongList,
    'song': renderSongDetail,
    'add-song': renderAddSong,
    'profiles': renderProfiles,
    'members': renderProfiles,
    'profile': renderProfileDetail,
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

    let members = [];
    let currentProfile = null;

    try {
        members = await api.getMembers();
        currentProfile = resolveStoredProfile(members);
    } catch (err) {
        members = [];
        currentProfile = null;
    }

    if (page !== 'choose-profile' && !currentProfile) {
        navigate('choose-profile');
        return;
    }

    app.innerHTML = '';
    app.appendChild(renderHeader(page, { members, currentProfile }));

    const content = document.createElement('main');
    content.className = 'main-content page-enter';
    app.appendChild(content);

    try {
        await routeHandler(content, params, { members, currentProfile });
    } catch (err) {
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { });
}

render();
