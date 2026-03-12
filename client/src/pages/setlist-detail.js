import { api } from '../api.js';
import { navigate, showToast } from '../main.js';
import { escapeHtml } from '../utils.js';

export async function renderSetlistDetail(container, params) {
    const setlistId = params[0];
    if (!setlistId) {
        navigate('setlists');
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const setlist = await api.getSetlist(setlistId);

    container.innerHTML = `
    <button class="back-btn" id="back-to-setlists">← Back to setlists</button>
    <section class="setlist-detail-hero">
      <div>
        <p class="profile-detail-kicker">Setlist</p>
        <h1>${escapeHtml(setlist.name)}</h1>
        <p class="profile-detail-subtitle">${setlist.song_count} song${setlist.song_count === 1 ? '' : 's'} in the current running order.</p>
      </div>
      <div class="setlist-detail-actions">
        <button class="rehearse-btn rehearse-btn-secondary" id="edit-setlist-btn">Edit setlist</button>
        <button class="rehearse-btn setlist-delete-btn" id="delete-setlist-btn">Delete setlist</button>
      </div>
    </section>
    <section class="setlist-detail-list" id="setlist-detail-list"></section>
  `;

    container.querySelector('#back-to-setlists').addEventListener('click', () => {
        navigate('setlists');
    });

    container.querySelector('#edit-setlist-btn').addEventListener('click', () => {
        navigate(`edit-setlist/${setlist.id}`);
    });

    container.querySelector('#delete-setlist-btn').addEventListener('click', async () => {
        if (!confirm(`Delete "${setlist.name}"? This cannot be undone.`)) {
            return;
        }

        try {
            await api.deleteSetlist(setlist.id);
            showToast('Setlist deleted');
            navigate('setlists');
        } catch (err) {
            showToast('Failed to delete setlist');
        }
    });

    renderSetlistSongs(container.querySelector('#setlist-detail-list'), setlist);
}

function renderSetlistSongs(container, setlist) {
    if (!setlist.songs?.length) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎵</div>
        <div class="empty-state-title">This setlist is empty</div>
        <div class="empty-state-desc">Songs were likely removed from the library. Edit the setlist to rebuild the order.</div>
      </div>
    `;
        return;
    }

    container.innerHTML = '';
    setlist.songs.forEach((song) => {
        container.appendChild(createSetlistSongCard(song));
    });
}

function createSetlistSongCard(song) {
    const card = document.createElement('article');
    card.className = 'setlist-song-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const coverHtml = song.cover_image
        ? `<img class="setlist-song-cover" src="${song.cover_image}" alt="${escapeHtml(song.name)}" loading="lazy" />`
        : '<div class="setlist-song-cover-placeholder">🎵</div>';

    card.innerHTML = `
    <div class="setlist-song-order">${song.position}</div>
    ${coverHtml}
    <div class="setlist-song-copy">
      <div class="setlist-song-title">${escapeHtml(song.name)}</div>
      <div class="comment-count">${song.rehearsal_count || 0} rehearsals logged</div>
    </div>
  `;

    card.addEventListener('click', () => navigate(`song/${song.id}`));
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            navigate(`song/${song.id}`);
        }
    });

    return card;
}
