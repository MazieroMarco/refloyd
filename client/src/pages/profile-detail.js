import { api } from '../api.js';
import { getCurrentProfileId, navigate, setCurrentProfileId, showToast } from '../main.js';
import { applyHeroImage, escapeHtml, formatCommentDate, formatMentions, getProfileAvatarHtml } from '../utils.js';

export async function renderProfileDetail(container, params) {
    const profileId = params[0];
    if (!profileId) {
        navigate('profiles');
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const { member, comments: initialComments } = await api.getMemberComments(profileId);
    const comments = [...initialComments];
    const heroAvatarHtml = member.avatar_image
        ? ''
        : getProfileAvatarHtml(member, 'profile-hero-avatar-image', 'profile-hero-avatar');

    container.innerHTML = `
    <button class="back-btn" id="back-to-profiles">← Back to profiles</button>
    <section class="profile-detail-hero">
      <div class="profile-detail-overlay">
        ${heroAvatarHtml}
        <p class="profile-detail-kicker">Profile</p>
        <h1>${escapeHtml(member.name)}</h1>
        <p class="profile-detail-subtitle">Track every note where this profile was mentioned and close them out when they are handled.</p>
        <div class="profile-detail-actions">
          <button class="rehearse-btn" id="activate-profile-btn">${String(member.id) === getCurrentProfileId() ? 'Current profile' : 'Use this profile'}</button>
          <button class="rehearse-btn rehearse-btn-secondary" id="edit-profile-btn">Edit profile</button>
        </div>
      </div>
    </section>

    <section class="profile-summary">
      <div class="profile-summary-card">
        <span class="profile-summary-label">Open notes</span>
        <strong id="open-count">${comments.filter((comment) => !comment.is_done).length}</strong>
      </div>
      <div class="profile-summary-card">
        <span class="profile-summary-label">Done notes</span>
        <strong id="done-count">${comments.filter((comment) => comment.is_done).length}</strong>
      </div>
    </section>

    <section class="profile-comments-section">
      <div class="profile-comments-column">
        <h3 class="section-title">Open mentions</h3>
        <div class="comment-list" id="open-comment-list"></div>
      </div>
      <div class="profile-comments-column">
        <h3 class="section-title">Done mentions</h3>
        <div class="comment-list" id="done-comment-list"></div>
      </div>
    </section>
  `;

    const openCommentList = container.querySelector('#open-comment-list');
    const doneCommentList = container.querySelector('#done-comment-list');
    const openCount = container.querySelector('#open-count');
    const doneCount = container.querySelector('#done-count');
    const activateProfileButton = container.querySelector('#activate-profile-btn');
    const editProfileButton = container.querySelector('#edit-profile-btn');
    const hero = container.querySelector('.profile-detail-hero');

    applyHeroImage(hero, member.avatar_image);

    container.querySelector('#back-to-profiles').addEventListener('click', () => {
        navigate('profiles');
    });

    activateProfileButton.addEventListener('click', () => {
        setCurrentProfileId(member.id);
        showToast(`${member.name} is now active`);
        navigate(`profile/${member.id}`);
    });

    editProfileButton.addEventListener('click', () => {
        navigate(`profile-settings/${member.id}`);
    });

    renderMentionLists();

    function renderMentionLists() {
        const openComments = comments
            .filter((comment) => !comment.is_done)
            .sort((left, right) => right.created_at.localeCompare(left.created_at));
        const doneComments = comments
            .filter((comment) => comment.is_done)
            .sort((left, right) => right.created_at.localeCompare(left.created_at));

        openCount.textContent = String(openComments.length);
        doneCount.textContent = String(doneComments.length);

        renderCommentColumn(openCommentList, openComments, false);
        renderCommentColumn(doneCommentList, doneComments, true);
    }

    function renderCommentColumn(target, list, doneState) {
        if (list.length === 0) {
            target.innerHTML = `
        <div class="empty-state profile-empty-state">
          <div class="empty-state-icon">${doneState ? '✅' : '💬'}</div>
          <div class="empty-state-title">${doneState ? 'Nothing done yet' : 'No open mentions'}</div>
          <div class="empty-state-desc">${doneState ? 'Resolved notes will appear here.' : 'New notes that mention this profile will appear here.'}</div>
        </div>
      `;
            return;
        }

        target.innerHTML = '';
        list.forEach((comment) => {
            target.appendChild(createMentionCard(comment));
        });
    }

    function createMentionCard(comment) {
        const card = document.createElement('article');
        card.className = `comment-item profile-comment-card${comment.is_done ? ' is-done' : ''}`;
        const authorAvatarHtml = getProfileAvatarHtml(
            {
                name: comment.author_name,
                avatar_image: comment.author_avatar_image,
            },
            'profile-comment-author-avatar-image',
            'profile-comment-author-avatar'
        );
        const songCoverHtml = comment.song_cover_image
            ? `<img class="profile-comment-song-cover" src="${comment.song_cover_image}" alt="${escapeHtml(comment.song_name)}" loading="lazy" />`
            : '<div class="profile-comment-song-cover profile-comment-song-cover-placeholder">🎵</div>';
        card.innerHTML = `
      <div class="comment-header profile-comment-header">
        <div class="profile-comment-meta">
          ${authorAvatarHtml}
          <div class="profile-comment-meta-copy">
            <span class="comment-author">${escapeHtml(comment.author_name)}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="comment-date">${formatCommentDate(comment.created_at)}</span>
          <button class="comment-delete-btn" type="button" title="Delete">✕</button>
        </div>
      </div>
      <div class="comment-text">${formatMentions(escapeHtml(comment.text))}</div>
      <div class="profile-comment-footer">
        <button class="profile-song-link profile-song-link-card" type="button">
          ${songCoverHtml}
          <span>${escapeHtml(comment.song_name)}</span>
        </button>
        <div class="profile-comment-actions">
          <button class="profile-status-btn" type="button">${comment.is_done ? 'Move back to open' : 'Mark as done'}</button>
        </div>
      </div>
    `;

        card.querySelector('.profile-song-link').addEventListener('click', () => {
            navigate(`song/${comment.song_id}`);
        });

        card.querySelector('.profile-status-btn').addEventListener('click', async () => {
            try {
                await api.updateCommentStatus(comment.id, member.id, !comment.is_done);
                comment.is_done = comment.is_done ? 0 : 1;
                showToast(comment.is_done ? 'Marked as done' : 'Moved back to open');
                renderMentionLists();
            } catch (err) {
                showToast('Failed to update note status');
            }
        });

        card.querySelector('.comment-delete-btn').addEventListener('click', async (event) => {
            event.stopPropagation();

            if (!confirm('Delete this note?')) {
                return;
            }

            try {
                await api.deleteComment(comment.id);
                const commentIndex = comments.findIndex((item) => item.id === comment.id);
                if (commentIndex >= 0) {
                    comments.splice(commentIndex, 1);
                }
                renderMentionLists();
                showToast('Note deleted');
            } catch (err) {
                showToast('Failed to delete note');
            }
        });

        return card;
    }
}
