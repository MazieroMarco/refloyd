import { api } from '../api.js';
import { navigate } from '../main.js';
import { escapeHtml } from '../utils.js';

const SONG_SORT_KEY = 'refloyd-song-sort';
const DEFAULT_SORT = 'newest';
const SONG_SORT_OPTIONS = [
    { value: 'newest', label: 'Newest first' },
    { value: 'least-rehearsed', label: 'Least rehearsed' },
    { value: 'most-rehearsed', label: 'Most rehearsed' },
    { value: 'name', label: 'A-Z' },
];

export async function renderSongList(container) {
    container.innerHTML = `
    <div class="page-title">
      <h1>Songs</h1>
      <label class="toolbar-select">
        <span>Sort</span>
        <select class="form-input" id="song-sort-select"></select>
      </label>
    </div>
    <div id="song-list-body">
      <div class="spinner"></div>
    </div>
  `;

    const body = container.querySelector('#song-list-body');
    const sortSelect = container.querySelector('#song-sort-select');
    const storedSort = localStorage.getItem(SONG_SORT_KEY);
    const initialSort = SONG_SORT_OPTIONS.some((option) => option.value === storedSort)
        ? storedSort
        : DEFAULT_SORT;
    let requestId = 0;

    SONG_SORT_OPTIONS.forEach((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        sortSelect.appendChild(element);
    });
    sortSelect.value = initialSort;

    sortSelect.addEventListener('change', () => {
        localStorage.setItem(SONG_SORT_KEY, sortSelect.value);
        loadSongs(sortSelect.value);
    });

    await loadSongs(initialSort);

    async function loadSongs(sort) {
        const currentRequestId = requestId + 1;
        requestId = currentRequestId;
        body.innerHTML = '<div class="spinner"></div>';
        sortSelect.disabled = true;

        try {
            const songs = await api.getSongs(sort);
            if (currentRequestId !== requestId) {
                return;
            }

            renderSongs(body, songs);
        } catch (err) {
            if (currentRequestId !== requestId) {
                return;
            }

            body.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-title">Could not load songs</div>
            <div class="empty-state-desc">${escapeHtml(err.message)}</div>
          </div>
        `;
        } finally {
            if (currentRequestId === requestId) {
                sortSelect.disabled = false;
            }
        }
    }

    const fab = document.createElement('button');
    fab.className = 'fab';
    fab.innerHTML = '+';
    fab.title = 'Add a new song';
    fab.addEventListener('click', () => navigate('add-song'));
    container.appendChild(fab);
}

function renderSongs(container, songs) {
    if (songs.length === 0) {
        container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎵</div>
          <div class="empty-state-title">No songs yet</div>
          <div class="empty-state-desc">Add your first song to start tracking rehearsals</div>
        </div>
      `;
    } else {
        container.innerHTML = `
        <div class="song-grid" id="song-grid"></div>
      `;

        const grid = container.querySelector('#song-grid');
        songs.forEach((song) => {
            grid.appendChild(createSongCard(song));
        });
    }
}

function createSongCard(song) {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    const coverHtml = song.cover_image
        ? `<img class="song-card-cover" src="${song.cover_image}" alt="${escapeHtml(song.name)}" loading="lazy" />`
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
