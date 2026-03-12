import { api } from '../api.js';
import { navigate, showToast } from '../main.js';
import { escapeHtml } from '../utils.js';

export function renderAddSetlist(container, params, context) {
    return renderSetlistEditor(container, params, context, { mode: 'create' });
}

export function renderEditSetlist(container, params, context) {
    return renderSetlistEditor(container, params, context, { mode: 'edit' });
}

async function renderSetlistEditor(container, params, context, options) {
    const isEditing = options.mode === 'edit';
    const setlistId = params[0];

    if (isEditing && !setlistId) {
        navigate('setlists');
        return;
    }

    container.innerHTML = '<div class="spinner"></div>';

    const [songs, setlist] = await Promise.all([
        api.getSongs('name'),
        isEditing ? api.getSetlist(setlistId) : Promise.resolve(null),
    ]);

    const selectedSongs = setlist?.songs?.map((song) => ({ ...song })) || [];

    container.innerHTML = `
    <button class="back-btn" id="back-to-setlists">← ${isEditing ? 'Back to setlist' : 'Back to setlists'}</button>
    <section class="setlist-editor-shell">
      <div class="setlist-editor-panel">
        <p class="profile-detail-kicker">${isEditing ? 'Update setlist' : 'New setlist'}</p>
        <h1>${isEditing ? `Edit ${escapeHtml(setlist.name)}` : 'Create a setlist'}</h1>
        <p class="profile-detail-subtitle">Add songs in order. Use the arrows to move them until the running order feels right.</p>

        <form class="setlist-editor-form" id="setlist-form">
          <div class="form-group">
            <label class="form-label" for="setlist-name">Setlist name</label>
            <input class="form-input" type="text" id="setlist-name" placeholder="Acoustic rehearsal, Summer gig, Encore..." value="${escapeHtml(setlist?.name || '')}" autocomplete="off" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="setlist-song-picker">Add a song</label>
            <div class="setlist-picker-row">
              <select class="form-input" id="setlist-song-picker"></select>
              <button class="comment-submit-btn" type="button" id="add-song-to-setlist-btn">Add song</button>
            </div>
            <p class="setlist-helper-text" id="setlist-helper-text"></p>
          </div>

          <div class="setlist-editor-summary" id="setlist-editor-summary"></div>
          <div class="setlist-editor-list" id="setlist-editor-list"></div>

          <button class="form-submit-btn" type="submit" id="save-setlist-btn">${isEditing ? 'Save changes' : 'Create setlist'}</button>
        </form>
      </div>
    </section>
  `;

    const backButton = container.querySelector('#back-to-setlists');
    const form = container.querySelector('#setlist-form');
    const setlistNameInput = container.querySelector('#setlist-name');
    const songPicker = container.querySelector('#setlist-song-picker');
    const addSongButton = container.querySelector('#add-song-to-setlist-btn');
    const helperText = container.querySelector('#setlist-helper-text');
    const summary = container.querySelector('#setlist-editor-summary');
    const list = container.querySelector('#setlist-editor-list');
    const saveButton = container.querySelector('#save-setlist-btn');

    backButton.addEventListener('click', () => {
        navigate(isEditing ? `setlist/${setlistId}` : 'setlists');
    });

    hydrateSongPicker(songPicker, songs);

    if (songs.length === 0) {
        addSongButton.disabled = true;
        songPicker.disabled = true;
        helperText.textContent = 'Add songs to your library first before building a setlist.';
    } else {
        helperText.textContent = 'Songs can be repeated if you want to build around intros, reprises, or encores.';
    }

    addSongButton.addEventListener('click', () => {
        const nextSong = songs.find((song) => String(song.id) === songPicker.value);
        if (!nextSong) {
            showToast('Choose a song to add');
            return;
        }

        selectedSongs.push({ ...nextSong });
        renderSelectedSongs();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = setlistNameInput.value.trim();
        if (!name) {
            showToast('Please enter a setlist name');
            return;
        }

        if (selectedSongs.length === 0) {
            showToast('Add at least one song to the setlist');
            return;
        }

        saveButton.disabled = true;
        saveButton.textContent = isEditing ? 'Saving...' : 'Creating...';

        try {
            const payload = {
                name,
                songIds: selectedSongs.map((song) => song.id),
            };

            const savedSetlist = isEditing
                ? await api.updateSetlist(setlistId, payload)
                : await api.createSetlist(payload);

            showToast(isEditing ? 'Setlist updated' : 'Setlist created');
            navigate(`setlist/${savedSetlist.id}`);
        } catch (err) {
            showToast(err.message || 'Failed to save setlist');
            saveButton.disabled = false;
            saveButton.textContent = isEditing ? 'Save changes' : 'Create setlist';
        }
    });

    renderSelectedSongs();
    setlistNameInput.focus();

    function renderSelectedSongs() {
        summary.innerHTML = `
      <div class="setlist-summary-pill">${selectedSongs.length} song${selectedSongs.length === 1 ? '' : 's'} in order</div>
      ${songs.length === 0 ? '<button class="member-select-btn" type="button" id="add-library-song-btn">Add songs to library</button>' : ''}
    `;

        if (songs.length === 0) {
            summary.querySelector('#add-library-song-btn')?.addEventListener('click', () => {
                navigate('add-song');
            });
        }

        if (selectedSongs.length === 0) {
            list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎶</div>
          <div class="empty-state-title">No songs added yet</div>
          <div class="empty-state-desc">Pick songs above and arrange them into the order you want to play them.</div>
        </div>
      `;
            return;
        }

        list.innerHTML = '';
        selectedSongs.forEach((song, index) => {
            const row = document.createElement('div');
            row.className = 'setlist-editor-row';

            row.innerHTML = `
        <div class="setlist-editor-position">${index + 1}</div>
        <div class="setlist-editor-song">
          <div class="setlist-editor-song-name">${escapeHtml(song.name)}</div>
          <div class="comment-count">${song.rehearsal_count || 0} rehearsals</div>
        </div>
        <div class="setlist-editor-row-actions">
          <button class="member-select-btn" type="button" data-action="up" ${index === 0 ? 'disabled' : ''}>Up</button>
          <button class="member-select-btn" type="button" data-action="down" ${index === selectedSongs.length - 1 ? 'disabled' : ''}>Down</button>
          <button class="member-select-btn setlist-remove-btn" type="button" data-action="remove">Remove</button>
        </div>
      `;

            row.querySelector('[data-action="up"]').addEventListener('click', () => {
                moveSong(index, index - 1);
            });

            row.querySelector('[data-action="down"]').addEventListener('click', () => {
                moveSong(index, index + 1);
            });

            row.querySelector('[data-action="remove"]').addEventListener('click', () => {
                selectedSongs.splice(index, 1);
                renderSelectedSongs();
            });

            list.appendChild(row);
        });
    }

    function moveSong(fromIndex, toIndex) {
        const [song] = selectedSongs.splice(fromIndex, 1);
        selectedSongs.splice(toIndex, 0, song);
        renderSelectedSongs();
    }
}

function hydrateSongPicker(songPicker, songs) {
    songPicker.innerHTML = '';

    if (songs.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No songs available';
        songPicker.appendChild(option);
        return;
    }

    songs.forEach((song) => {
        const option = document.createElement('option');
        option.value = String(song.id);
        option.textContent = song.name;
        songPicker.appendChild(option);
    });
}
