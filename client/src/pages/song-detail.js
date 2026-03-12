import { api } from '../api.js';
import { navigate, showToast } from '../main.js';
import { escapeHtml, formatCommentDate, formatMentions } from '../utils.js';

export async function renderSongDetail(container, params, context = {}) {
    const songId = params[0];
    if (!songId) {
        navigate('songs');
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const members = context.members?.length ? context.members : await api.getMembers();
    const currentProfile = context.currentProfile || null;
    const [song, initialComments] = await Promise.all([
        api.getSong(songId),
        api.getComments(songId),
    ]);
    const comments = [...initialComments];

    container.innerHTML = '';

    const backButton = document.createElement('button');
    backButton.className = 'back-btn';
    backButton.textContent = '← Back to songs';
    backButton.addEventListener('click', () => navigate('songs'));
    container.appendChild(backButton);

    const hero = document.createElement('div');
    hero.className = 'song-detail-hero';
    const coverHtml = song.cover_image
        ? `<img class="song-detail-cover" src="${song.cover_image}" alt="${escapeHtml(song.name)}" />`
        : '<div class="song-detail-cover-placeholder">🎵</div>';
    hero.innerHTML = `
      ${coverHtml}
      <div class="song-detail-overlay">
        <h1 class="song-detail-title">${escapeHtml(song.name)}</h1>
      </div>
    `;
    container.appendChild(hero);

    const rehearsalSection = document.createElement('div');
    rehearsalSection.className = 'rehearsal-section';
    rehearsalSection.innerHTML = `
      <div class="rehearsal-count-display" id="rehearsal-count">${song.rehearsal_count}</div>
      <div class="rehearsal-info">
        <div class="rehearsal-label">Rehearsals</div>
        <div class="rehearsal-sublabel">Increase or decrease the count as the band progresses.</div>
      </div>
      <div class="rehearsal-actions">
        <button class="rehearse-btn rehearse-btn-secondary" id="decrease-rehearsal-btn">−1</button>
        <button class="rehearse-btn" id="increase-rehearsal-btn">+1 rehearsal</button>
      </div>
    `;
    container.appendChild(rehearsalSection);

    const countDisplay = rehearsalSection.querySelector('#rehearsal-count');
    const decreaseButton = rehearsalSection.querySelector('#decrease-rehearsal-btn');
    const increaseButton = rehearsalSection.querySelector('#increase-rehearsal-btn');

    async function adjustRehearsalCount(delta, successMessage) {
        decreaseButton.disabled = true;
        increaseButton.disabled = true;

        try {
            const updatedSong = await api.rehearseSong(songId, delta);
            countDisplay.textContent = updatedSong.rehearsal_count;
            countDisplay.classList.add('bump');
            setTimeout(() => countDisplay.classList.remove('bump'), 400);
            showToast(successMessage);
        } catch (err) {
            showToast('Failed to update rehearsal count');
        } finally {
            decreaseButton.disabled = false;
            increaseButton.disabled = false;
        }
    }

    decreaseButton.addEventListener('click', () => adjustRehearsalCount(-1, 'Rehearsal removed'));
    increaseButton.addEventListener('click', () => adjustRehearsalCount(1, 'Rehearsal logged'));

    const commentsSection = document.createElement('div');
    commentsSection.className = 'comments-section';
    commentsSection.innerHTML = `
      <h3 class="section-title">Improvement notes</h3>
      <div class="comment-form">
        <div class="comment-input-wrapper">
          <div class="mention-dropdown" id="mention-dropdown"></div>
          <textarea class="comment-input" id="comment-input" placeholder="Type a note... Use @ to mention a profile"></textarea>
        </div>
        <div class="comment-form-actions">
          <button class="comment-submit-btn" id="comment-submit">Post note</button>
        </div>
      </div>
      <div class="comment-list" id="comment-list"></div>
    `;
    container.appendChild(commentsSection);

    const commentList = commentsSection.querySelector('#comment-list');
    const commentInput = commentsSection.querySelector('#comment-input');
    const commentSubmit = commentsSection.querySelector('#comment-submit');
    const mentionDropdown = commentsSection.querySelector('#mention-dropdown');

    renderComments(commentList, comments, handleDeleteComment);
    setupMentionAutocomplete(commentInput, mentionDropdown, members);

    commentSubmit.addEventListener('click', async () => {
        const text = commentInput.value.trim();
        if (!currentProfile) {
            showToast('Please choose a profile first');
            navigate('choose-profile');
            return;
        }
        if (!text) {
            showToast('Please write a note');
            return;
        }

        commentSubmit.disabled = true;
        try {
            const comment = await api.addComment(songId, {
                authorId: currentProfile.id,
                author: currentProfile.name,
                text,
            });

            comments.unshift(comment);
            commentInput.value = '';
            renderComments(commentList, comments, handleDeleteComment);
            showToast('Note posted');
        } catch (err) {
            showToast('Failed to post note');
        } finally {
            commentSubmit.disabled = false;
        }
    });

    const deleteSection = document.createElement('div');
    deleteSection.style.cssText = 'margin-top: 48px; text-align: center;';
    const deleteButton = document.createElement('button');
    deleteButton.style.cssText = `
      padding: 8px 24px; border: 1px solid var(--danger); border-radius: 999px;
      background: transparent; color: var(--danger); font-family: var(--font);
      font-size: 0.875rem; cursor: pointer; transition: all 150ms ease;
    `;
    deleteButton.textContent = 'Delete this song';
    deleteButton.addEventListener('click', async () => {
        if (!confirm(`Delete "${song.name}"? This cannot be undone.`)) {
            return;
        }

        await api.deleteSong(songId);
        showToast('Song deleted');
        navigate('songs');
    });
    deleteButton.addEventListener('mouseenter', () => {
        deleteButton.style.background = 'rgba(239,68,68,0.1)';
    });
    deleteButton.addEventListener('mouseleave', () => {
        deleteButton.style.background = 'transparent';
    });
    deleteSection.appendChild(deleteButton);
    container.appendChild(deleteSection);

    async function handleDeleteComment(commentId) {
        const comment = comments.find((item) => item.id === commentId);
        if (!comment || !confirm('Delete this note?')) {
            return;
        }

        try {
            await api.deleteComment(commentId);
            const commentIndex = comments.findIndex((item) => item.id === commentId);
            if (commentIndex >= 0) {
                comments.splice(commentIndex, 1);
            }
            renderComments(commentList, comments, handleDeleteComment);
            showToast('Note deleted');
        } catch (err) {
            showToast('Failed to delete note');
        }
    }
}

function renderComments(container, comments, onDeleteComment) {
    if (comments.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">No notes yet</div>
        <div class="empty-state-desc">Add improvement notes for the band</div>
      </div>
    `;
        return;
    }

    container.innerHTML = '';
    comments.forEach((comment) => {
        container.appendChild(createCommentElement(comment, onDeleteComment));
    });
}

function createCommentElement(comment, onDeleteComment) {
    const element = document.createElement('div');
    element.className = 'comment-item';
    element.innerHTML = `
    <div class="comment-header">
      <span class="comment-author">${escapeHtml(comment.author_name || comment.author)}</span>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="comment-date">${formatCommentDate(comment.created_at)}</span>
        <button class="comment-delete-btn" data-id="${comment.id}" title="Delete">✕</button>
      </div>
    </div>
    <div class="comment-text">${formatMentions(escapeHtml(comment.text))}</div>
  `;

    element.querySelector('.comment-delete-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        onDeleteComment(comment.id);
    });

    return element;
}

function setupMentionAutocomplete(input, dropdown, members) {
    let mentionStart = -1;

    input.addEventListener('input', () => {
        const value = input.value;
        const cursorPosition = input.selectionStart;
        const beforeCursor = value.substring(0, cursorPosition);
        const atIndex = beforeCursor.lastIndexOf('@');

        if (atIndex >= 0) {
            const query = beforeCursor.substring(atIndex + 1).toLowerCase();
            if (!query.includes(' ') || query.split(' ').length <= 2) {
                const filteredMembers = members.filter((member) =>
                    member.name.toLowerCase().includes(query)
                );

                if (filteredMembers.length > 0) {
                    mentionStart = atIndex;
                    dropdown.innerHTML = '';
                    filteredMembers.forEach((member, index) => {
                        const option = document.createElement('div');
                        option.className = `mention-option${index === 0 ? ' active' : ''}`;
                        option.textContent = member.name;
                        option.addEventListener('click', () => {
                            completeMention(input, mentionStart, member.name);
                            dropdown.classList.remove('visible');
                        });
                        dropdown.appendChild(option);
                    });
                    dropdown.classList.add('visible');
                    return;
                }
            }
        }

        dropdown.classList.remove('visible');
    });

    input.addEventListener('keydown', (event) => {
        if (!dropdown.classList.contains('visible')) {
            return;
        }

        const options = [...dropdown.querySelectorAll('.mention-option')];
        const activeIndex = options.findIndex((option) => option.classList.contains('active'));

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            options[activeIndex]?.classList.remove('active');
            options[(activeIndex + 1) % options.length]?.classList.add('active');
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            options[activeIndex]?.classList.remove('active');
            options[(activeIndex - 1 + options.length) % options.length]?.classList.add('active');
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const activeOption = dropdown.querySelector('.mention-option.active');
            if (activeOption) {
                completeMention(input, mentionStart, activeOption.textContent);
                dropdown.classList.remove('visible');
            }
        } else if (event.key === 'Escape') {
            dropdown.classList.remove('visible');
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('visible'), 200);
    });
}

function completeMention(input, atIndex, name) {
    const before = input.value.substring(0, atIndex);
    const after = input.value.substring(input.selectionStart);
    input.value = `${before}@${name} ${after}`;
    const newCursorPosition = atIndex + name.length + 2;
    input.setSelectionRange(newCursorPosition, newCursorPosition);
    input.focus();
}
