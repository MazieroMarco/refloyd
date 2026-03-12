import { api } from '../api.js';
import { clearCurrentProfileId, getCurrentProfileId, navigate, setCurrentProfileId, showToast } from '../main.js';
import { applyHeroImage, escapeHtml, getProfileAvatarHtml } from '../utils.js';

export async function renderProfileSettings(container, params) {
    const profileId = params[0];
    if (!profileId) {
        navigate('profiles');
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const member = await api.getMember(profileId);
    const isCurrentProfile = String(member.id) === getCurrentProfileId();
    const heroAvatarHtml = member.avatar_image
        ? ''
        : getProfileAvatarHtml(member, 'profile-hero-avatar-image', 'profile-hero-avatar');

    container.innerHTML = `
    <button class="back-btn" id="back-to-profile">← Back to mentions</button>
    <section class="profile-detail-hero">
      <div class="profile-detail-overlay">
        ${heroAvatarHtml}
        <p class="profile-detail-kicker">Profile settings</p>
        <h1>${escapeHtml(member.name)}</h1>
        <p class="profile-detail-subtitle">Update the profile name and picture without mixing that work into the mentions view.</p>
        <div class="profile-detail-actions">
          <button class="rehearse-btn" id="activate-profile-btn">${isCurrentProfile ? 'Current profile' : 'Use this profile'}</button>
        </div>
      </div>
    </section>

    <section class="profile-rename-card">
      <div>
        <h3>Edit profile</h3>
        <p class="profile-detail-subtitle">Profile name changes still update authored notes and mention matching.</p>
      </div>
      <form class="profile-settings-form" id="profile-settings-form">
        <div class="form-group">
          <label class="form-label" for="profile-name-input">Profile name</label>
          <input class="form-input" id="profile-name-input" value="${escapeHtml(member.name)}" autocomplete="off" />
        </div>
        <div class="form-group">
          <label class="form-label">Profile picture</label>
          <div class="cover-upload-area profile-avatar-upload" id="avatar-upload-area"></div>
          <input type="file" id="avatar-file" accept="image/*" hidden />
        </div>
        <button class="form-submit-btn" type="submit" id="save-profile-btn">Save profile</button>
      </form>
    </section>

    <section class="profile-summary">
      <div class="profile-summary-card">
        <span class="profile-summary-label">Open notes</span>
        <strong>${member.open_comment_count || 0}</strong>
      </div>
      <div class="profile-summary-card">
        <span class="profile-summary-label">Done notes</span>
        <strong>${member.done_comment_count || 0}</strong>
      </div>
    </section>

    <section class="profile-danger-card">
      <div>
        <h3>Delete profile</h3>
        <p class="profile-detail-subtitle">This removes the profile and its picture. Notes stay on songs, but this profile and its tracked mention state are removed.</p>
      </div>
      <button class="member-select-btn setlist-remove-btn" type="button" id="delete-profile-btn">Delete profile</button>
    </section>
  `;

    const backButton = container.querySelector('#back-to-profile');
    const activateProfileButton = container.querySelector('#activate-profile-btn');
    const form = container.querySelector('#profile-settings-form');
    const nameInput = container.querySelector('#profile-name-input');
    const uploadArea = container.querySelector('#avatar-upload-area');
    const fileInput = container.querySelector('#avatar-file');
    const saveButton = container.querySelector('#save-profile-btn');
    const deleteButton = container.querySelector('#delete-profile-btn');
    const hero = container.querySelector('.profile-detail-hero');

    let selectedFile = null;

    applyHeroImage(hero, member.avatar_image);

    backButton.addEventListener('click', () => {
        navigate(`profile/${member.id}`);
    });

    activateProfileButton.addEventListener('click', () => {
        setCurrentProfileId(member.id);
        showToast(`${member.name} is now active`);
        navigate(`profile-settings/${member.id}`);
    });

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        uploadArea.style.borderColor = 'var(--accent-primary)';
        uploadArea.style.background = 'var(--accent-glow)';
    });
    uploadArea.addEventListener('dragleave', () => {
        if (!selectedFile) {
            uploadArea.style.borderColor = '';
            uploadArea.style.background = '';
        }
    });
    uploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFileSelect(file);
        }
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const nextName = nameInput.value.trim();

        if (!nextName) {
            showToast('Please enter a profile name');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        try {
            const formData = new FormData();
            formData.append('name', nextName);
            if (selectedFile) {
                formData.append('avatar', selectedFile);
            }

            await api.updateMember(member.id, formData);
            showToast('Profile updated');
            navigate(`profile-settings/${member.id}`);
        } catch (err) {
            showToast(err.message || 'Failed to update profile');
            saveButton.disabled = false;
            saveButton.textContent = 'Save profile';
        }
    });

    deleteButton.addEventListener('click', async () => {
        if (!confirm(`Delete ${member.name}?`)) {
            return;
        }

        try {
            await api.deleteMember(member.id);

            if (String(member.id) === getCurrentProfileId()) {
                clearCurrentProfileId();
                showToast(`${member.name} deleted`);
                navigate('choose-profile');
                return;
            }

            showToast(`${member.name} deleted`);
            navigate('profiles');
        } catch (err) {
            showToast('Failed to delete profile');
        }
    });

    renderUploadArea();
    nameInput.focus();

    function handleFileSelect(file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            renderUploadArea(event.target?.result);
        };
        reader.readAsDataURL(file);
    }

    function renderUploadArea(previewUrl = member.avatar_image) {
        if (previewUrl) {
            uploadArea.classList.add('has-preview');
            uploadArea.innerHTML = `<img class="cover-preview profile-avatar-preview-image" src="${previewUrl}" alt="${escapeHtml(member.name)}" />`;
            return;
        }

        uploadArea.classList.remove('has-preview');
        uploadArea.innerHTML = `
      ${getProfileAvatarHtml(member, 'profile-avatar-preview-image', 'profile-avatar-preview')}
      <div class="cover-upload-text">Click or drag & drop a profile picture</div>
    `;
    }
}
