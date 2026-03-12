import { navigate } from '../main.js';

export function renderHeader(activePage, { currentProfile } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'app-topbar';

    if (!currentProfile) {
        wrapper.innerHTML = `
      <header class="app-header app-header-simple">
        <button class="app-logo plain-button" id="logo">Re:Floyd</button>
      </header>
    `;

        wrapper.querySelector('#logo').addEventListener('click', () => navigate('choose-profile'));
        return wrapper;
    }

    wrapper.innerHTML = `
    <header class="app-header">
      <button class="app-logo plain-button" id="logo">Re:Floyd</button>
      <nav class="app-nav">
        <button class="nav-btn ${['', 'songs', 'song', 'add-song'].includes(activePage) ? 'active' : ''}" data-page="songs">Songs</button>
        <button class="nav-btn ${['setlists', 'setlist', 'add-setlist', 'edit-setlist'].includes(activePage) ? 'active' : ''}" data-page="setlists">Setlists</button>
        <button class="nav-btn ${['profiles', 'members', 'profile'].includes(activePage) ? 'active' : ''}" data-page="profiles">Profiles</button>
      </nav>
    </header>
    <div class="identity-bar">
      <div class="identity-current">
        <span class="identity-label">Current profile</span>
        <button class="identity-profile-link" id="current-profile-link">${escapeHtml(currentProfile.name)}</button>
      </div>
      <div class="identity-actions">
        <span class="identity-pill">${currentProfile.open_comment_count || 0} open notes</span>
        <button class="identity-switch-btn" id="switch-profile-btn">Switch profile</button>
      </div>
    </div>
  `;

    wrapper.querySelector('.app-header').addEventListener('click', (event) => {
        const navButton = event.target.closest('.nav-btn');
        if (navButton) {
            navigate(navButton.dataset.page);
        }

        if (event.target.closest('#logo')) {
            navigate('songs');
        }
    });

    wrapper.querySelector('#current-profile-link').addEventListener('click', () => {
        navigate(`profile/${currentProfile.id}`);
    });

    wrapper.querySelector('#switch-profile-btn').addEventListener('click', () => {
        navigate('choose-profile');
    });

    return wrapper;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
