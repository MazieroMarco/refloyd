import { navigate } from '../main.js';
import { buildBackendUrl } from '../config.js';

let previousNavPage = '';

export function renderHeader(activePage, { authSession, currentProfile } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'app-topbar';
    const authLabel = getAuthLabel(authSession);
    const currentNavPage = getNavPage(activePage);

    if (!currentProfile) {
        wrapper.innerHTML = `
      <header class="app-header app-header-simple">
        <button class="app-logo plain-button" id="logo">Re:Floyd</button>
      </header>
      ${authSession?.authenticated ? `
        <div class="identity-bar identity-bar-auth-only">
          <div class="identity-access">
            <span class="identity-label">Access</span>
            <span class="identity-auth-user">${escapeHtml(authLabel)}</span>
          </div>
          <div class="identity-actions">
            <button class="identity-switch-btn" id="logout-btn">Sign out</button>
          </div>
        </div>
      ` : ''}
    `;

        wrapper.querySelector('#logo').addEventListener('click', () => {
            navigate(authSession?.authenticated ? 'choose-profile' : '');
        });
        bindLogout(wrapper);
        return wrapper;
    }

    wrapper.innerHTML = `
    <header class="app-header">
      <button class="app-logo plain-button" id="logo">Re:Floyd</button>
      <nav class="app-nav">
        <span class="nav-indicator" aria-hidden="true"></span>
        <button class="nav-btn ${currentNavPage === 'songs' ? 'active' : ''}" data-page="songs">Songs</button>
        <button class="nav-btn ${currentNavPage === 'setlists' ? 'active' : ''}" data-page="setlists">Setlists</button>
        <button class="nav-btn ${currentNavPage === 'profiles' ? 'active' : ''}" data-page="profiles">Profiles</button>
      </nav>
    </header>
    <div class="identity-bar">
      <div class="identity-current">
        <span class="identity-label">Current profile</span>
        <button class="identity-profile-link" id="current-profile-link">${escapeHtml(currentProfile.name)}</button>
      </div>
      <div class="identity-access">
        <span class="identity-label">Access</span>
        <span class="identity-auth-user">${escapeHtml(authLabel)}</span>
      </div>
      <div class="identity-actions">
        <span class="identity-pill">${currentProfile.open_comment_count || 0} open notes</span>
        <button class="identity-switch-btn" id="switch-profile-btn">Switch profile</button>
        <button class="identity-switch-btn" id="logout-btn">Sign out</button>
      </div>
    </div>
  `;

    requestAnimationFrame(() => {
        syncNavIndicator(wrapper.querySelector('.app-nav'), currentNavPage);
    });

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

    bindLogout(wrapper);

    return wrapper;
}

function getNavPage(activePage) {
    if (['', 'songs', 'song', 'add-song'].includes(activePage)) {
        return 'songs';
    }

    if (['setlists', 'setlist', 'add-setlist', 'edit-setlist'].includes(activePage)) {
        return 'setlists';
    }

    if (['profiles', 'members', 'profile', 'profile-settings'].includes(activePage)) {
        return 'profiles';
    }

    return '';
}

function syncNavIndicator(nav, currentNavPage) {
    if (!nav || !currentNavPage) {
        previousNavPage = currentNavPage;
        return;
    }

    const indicator = nav.querySelector('.nav-indicator');
    const activeButton = nav.querySelector(`.nav-btn[data-page="${currentNavPage}"]`);

    if (!indicator || !activeButton) {
        previousNavPage = currentNavPage;
        return;
    }

    const previousButton = previousNavPage
        ? nav.querySelector(`.nav-btn[data-page="${previousNavPage}"]`)
        : null;

    const positionIndicator = (button) => {
        indicator.style.width = `${button.offsetWidth}px`;
        indicator.style.transform = `translateX(${button.offsetLeft}px)`;
    };

    indicator.classList.add('is-visible');

    if (previousButton && previousButton !== activeButton) {
        requestAnimationFrame(() => {
            indicator.style.transition = 'none';
            positionIndicator(previousButton);

            requestAnimationFrame(() => {
                indicator.style.transition = '';
                positionIndicator(activeButton);
            });
        });
    } else {
        requestAnimationFrame(() => {
            indicator.style.transition = 'none';
            positionIndicator(activeButton);
            requestAnimationFrame(() => {
                indicator.style.transition = '';
            });
        });
    }

    requestAnimationFrame(() => {
        if (indicator.offsetWidth === 0) {
            indicator.style.transition = 'none';
            positionIndicator(activeButton);
            indicator.style.transition = '';
        }
    });

    previousNavPage = currentNavPage;
}

function bindLogout(wrapper) {
    const logoutButton = wrapper.querySelector('#logout-btn');
    if (!logoutButton) {
        return;
    }

    logoutButton.addEventListener('click', () => {
        window.location.href = buildBackendUrl(
            `/api/auth/logout?returnTo=${encodeURIComponent(window.location.hash || '')}`
        );
    });
}

function getAuthLabel(authSession) {
    if (!authSession?.authenticated) {
        return 'Signed out';
    }

    return authSession.user?.displayName
        || authSession.user?.email
        || authSession.user?.preferredUsername
        || 'Signed in';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
