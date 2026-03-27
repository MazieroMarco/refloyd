import { api } from '../api.js';
import { navigate, setCurrentProfileId, showToast } from '../main.js';
import { escapeHtml, getProfileAvatarHtml } from '../utils.js';

export async function renderProfilePicker(container, params, context = {}) {
    const profiles = context.members?.length ? [...context.members] : await api.getMembers();

    container.innerHTML = `
    <section class="profile-picker">
      <div class="profile-picker-hero">
        <span class="profile-picker-kicker">Re:Floyd</span>
        <h1>Choose a profile</h1>
        <p>Pick which band profile you want to use. This stays separate from the account you used to sign in.</p>
      </div>
      <div class="profile-picker-grid" id="profile-picker-grid"></div>
      <form class="add-member-form profile-picker-form" id="create-profile-form">
        <input class="form-input" type="text" id="create-profile-name" placeholder="Create a new profile..." autocomplete="off" />
        <button class="add-member-btn" type="submit">Create profile</button>
      </form>
    </section>
  `;

    const grid = container.querySelector('#profile-picker-grid');
    const form = container.querySelector('#create-profile-form');
    const nameInput = container.querySelector('#create-profile-name');

    renderProfileChoices(grid, profiles);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Please enter a profile name');
            return;
        }

        try {
            const profile = await api.addMember(name);
            setCurrentProfileId(profile.id);
            showToast(`${profile.name} created`);
            navigate('songs');
        } catch (err) {
            showToast(err.message);
        }
    });
}

function renderProfileChoices(grid, profiles) {
    if (profiles.length === 0) {
        grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-title">No profiles available</div>
        <div class="empty-state-desc">Create one below to enter the app</div>
      </div>
    `;
        return;
    }

    grid.innerHTML = '';
    profiles.forEach((profile) => {
        const button = document.createElement('button');
        button.className = 'profile-choice-card';
        button.type = 'button';
        const avatarHtml = getProfileAvatarHtml(
            profile,
            'profile-choice-avatar-image',
            'profile-choice-avatar'
        );
        button.innerHTML = `
      ${avatarHtml}
      <div class="profile-choice-name">${escapeHtml(profile.name)}</div>
      <div class="profile-choice-meta">
        <span>${profile.open_comment_count || 0} open notes</span>
        <span>${profile.done_comment_count || 0} done</span>
      </div>
    `;

        button.addEventListener('click', () => {
            setCurrentProfileId(profile.id);
            showToast(`${profile.name} selected`);
            navigate('songs');
        });

        grid.appendChild(button);
    });
}
