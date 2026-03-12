import { api } from '../api.js';
import { clearCurrentProfileId, getCurrentProfileId, navigate, setCurrentProfileId, showToast } from '../main.js';
import { escapeHtml, getProfileAvatarHtml } from '../utils.js';

export async function renderProfiles(container, params, context = {}) {
    const profiles = context.members?.length ? context.members : await api.getMembers();

    container.innerHTML = `
    <h1 style="margin-bottom: var(--sp-lg);">Profiles</h1>
    <div class="members-grid" id="members-grid"></div>
    <form class="add-member-form" id="add-member-form">
      <input class="form-input" type="text" id="new-member-name" placeholder="New profile name..." autocomplete="off" />
      <button class="add-member-btn" type="submit">+ Add profile</button>
    </form>
  `;

    const grid = container.querySelector('#members-grid');
    const form = container.querySelector('#add-member-form');
    const nameInput = container.querySelector('#new-member-name');

    renderProfileCards(grid, profiles);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Please enter a profile name');
            return;
        }

        try {
            const profile = await api.addMember(name);
            nameInput.value = '';
            profiles.push(profile);
            profiles.sort((left, right) => left.name.localeCompare(right.name));
            renderProfileCards(grid, profiles);
            showToast(`${profile.name} added`);
        } catch (err) {
            showToast(err.message);
        }
    });
}

function renderProfileCards(grid, profiles) {
    grid.innerHTML = '';

    if (profiles.length === 0) {
        grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🎤</div>
        <div class="empty-state-title">No profiles yet</div>
        <div class="empty-state-desc">Create one below to start using Re:Floyd</div>
      </div>
    `;
        return;
    }

    profiles.forEach((profile) => {
        grid.appendChild(createProfileCard(profile, profiles, grid));
    });
}

function createProfileCard(profile, profiles, grid) {
    const currentProfileId = getCurrentProfileId();
    const isCurrentProfile = String(profile.id) === currentProfileId;

    const card = document.createElement('div');
    card.className = 'member-card member-card-clickable';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const avatarHtml = getProfileAvatarHtml(profile, 'member-avatar-image', 'member-avatar');

    card.innerHTML = `
    <button class="member-delete-btn" title="Remove">✕</button>
    ${avatarHtml}
    <div class="member-name">${escapeHtml(profile.name)}</div>
    <div class="member-status-row">
      <span class="member-note-badge">${profile.open_comment_count || 0} open</span>
      <span class="member-note-badge done">${profile.done_comment_count || 0} done</span>
    </div>
    <div class="member-card-actions">
      <button class="member-select-btn">${isCurrentProfile ? 'Current profile' : 'Use this profile'}</button>
      <button class="member-select-btn member-edit-btn" type="button">Edit profile</button>
    </div>
  `;

    card.addEventListener('click', () => {
        navigate(`profile/${profile.id}`);
    });

    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            navigate(`profile/${profile.id}`);
        }
    });

    card.querySelector('.member-select-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        setCurrentProfileId(profile.id);
        showToast(`${profile.name} is now active`);
        navigate(`profile/${profile.id}`);
    });

    card.querySelector('.member-edit-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        navigate(`profile-settings/${profile.id}`);
    });

    card.querySelector('.member-delete-btn').addEventListener('click', async (event) => {
        event.stopPropagation();

        if (!confirm(`Delete ${profile.name}?`)) {
            return;
        }

        try {
            await api.deleteMember(profile.id);
            const profileIndex = profiles.findIndex((item) => item.id === profile.id);
            if (profileIndex >= 0) {
                profiles.splice(profileIndex, 1);
            }

            if (String(profile.id) === getCurrentProfileId()) {
                clearCurrentProfileId();
                showToast(`${profile.name} deleted`);
                navigate('choose-profile');
                return;
            }

            renderProfileCards(grid, profiles);
            showToast(`${profile.name} deleted`);
        } catch (err) {
            showToast('Failed to delete profile');
        }
    });

    return card;
}
