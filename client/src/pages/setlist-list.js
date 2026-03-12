import { api } from '../api.js';
import { navigate } from '../main.js';
import { escapeHtml } from '../utils.js';

export async function renderSetlistList(container) {
    container.innerHTML = `
    <div class="page-title">
      <h1>Setlists</h1>
    </div>
    <div class="spinner"></div>
  `;

    try {
        const setlists = await api.getSetlists();

        if (setlists.length === 0) {
            container.innerHTML = `
        <div class="page-title"><h1>Setlists</h1></div>
        <div class="empty-state">
          <div class="empty-state-icon">🎼</div>
          <div class="empty-state-title">No setlists yet</div>
          <div class="empty-state-desc">Create one to keep your song order ready for rehearsal or gigs.</div>
        </div>
      `;
        } else {
            container.innerHTML = `
        <div class="page-title">
          <h1>Setlists</h1>
        </div>
        <div class="setlist-grid" id="setlist-grid"></div>
      `;

            const grid = container.querySelector('#setlist-grid');
            setlists.forEach((setlist) => {
                grid.appendChild(createSetlistCard(setlist));
            });
        }
    } catch (err) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Could not load setlists</div>
        <div class="empty-state-desc">${escapeHtml(err.message)}</div>
      </div>
    `;
    }

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '+';
    fab.title = 'Create a setlist';
    fab.addEventListener('click', () => navigate('add-setlist'));
    container.appendChild(fab);
}

function createSetlistCard(setlist) {
    const card = document.createElement('article');
    card.className = 'setlist-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const previewSongs = Array.isArray(setlist.preview_songs) ? setlist.preview_songs : [];
    const previewHtml = previewSongs.length
        ? previewSongs.map((song) => (
            `<span class="setlist-preview-pill">${escapeHtml(song.name)}</span>`
        )).join('')
        : '<span class="comment-count">No songs in this setlist</span>';

    card.innerHTML = `
    <div class="setlist-card-top">
      <div>
        <div class="setlist-card-kicker">Setlist</div>
        <h2 class="setlist-card-title">${escapeHtml(setlist.name)}</h2>
      </div>
      <div class="rehearsal-badge">${setlist.song_count || 0} songs</div>
    </div>
    <div class="setlist-preview-row">${previewHtml}</div>
  `;

    card.addEventListener('click', () => navigate(`setlist/${setlist.id}`));
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            navigate(`setlist/${setlist.id}`);
        }
    });

    return card;
}
