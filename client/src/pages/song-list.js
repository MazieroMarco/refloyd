import { api } from '../api.js';
import { navigate } from '../main.js';

export async function renderSongList(container) {
    container.innerHTML = `
    <div class="page-title">
      <h1>Songs</h1>
    </div>
    <div class="spinner"></div>
  `;

    try {
        const songs = await api.getSongs();

        if (songs.length === 0) {
            container.innerHTML = `
        <div class="page-title"><h1>Songs</h1></div>
        <div class="empty-state">
          <div class="empty-state-icon">🎵</div>
          <div class="empty-state-title">No songs yet</div>
          <div class="empty-state-desc">Add your first song to start tracking rehearsals</div>
        </div>
      `;
        } else {
            container.innerHTML = `
        <div class="page-title"><h1>Songs</h1></div>
        <div class="song-grid" id="song-grid"></div>
      `;

            const grid = container.querySelector('#song-grid');
            songs.forEach((song) => {
                grid.appendChild(createSongCard(song));
            });
        }
    } catch (err) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Could not load songs</div>
        <div class="empty-state-desc">${err.message}</div>
      </div>
    `;
    }

    // FAB
    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '+';
    fab.title = 'Add a new song';
    fab.addEventListener('click', () => navigate('add-song'));
    container.appendChild(fab);
}

function createSongCard(song) {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const coverHtml = song.cover_image
        ? `<img class="song-card-cover" src="${song.cover_image}" alt="${song.name}" loading="lazy" />`
        : `<div class="song-card-cover-placeholder">🎵</div>`;

    card.innerHTML = `
    ${coverHtml}
    <div class="song-card-body">
      <div class="song-card-title">${escapeHtml(song.name)}</div>
      <div class="song-card-meta">
        <span class="rehearsal-badge">🔁 ${song.rehearsal_count}</span>
        <span class="comment-count">${song.comment_count || 0} 💬</span>
      </div>
    </div>
  `;

    card.addEventListener('click', () => navigate(`song/${song.id}`));
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') navigate(`song/${song.id}`);
    });

    return card;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
