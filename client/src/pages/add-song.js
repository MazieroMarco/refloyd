import { api } from '../api.js';
import { navigate, showToast } from '../main.js';

export async function renderAddSong(container) {
    container.innerHTML = `
    <button class="back-btn" id="back-btn">← Back to songs</button>
    <h1 style="margin-bottom: var(--sp-xl);">Add a Song</h1>
    <form class="add-song-form" id="add-song-form">
      <div class="form-group">
        <label class="form-label" for="song-name">Song Name</label>
        <input class="form-input" type="text" id="song-name" placeholder="Enter song title..." autocomplete="off" required />
      </div>
      <div class="form-group">
        <label class="form-label">Cover Image</label>
        <div class="cover-upload-area" id="cover-upload-area">
          <div class="cover-upload-icon">📷</div>
          <div class="cover-upload-text">Click or drag & drop an image</div>
        </div>
        <input type="file" id="cover-file" accept="image/*" hidden />
      </div>
      <button class="form-submit-btn" type="submit" id="submit-btn">Add Song</button>
    </form>
  `;

    const backBtn = container.querySelector('#back-btn');
    const form = container.querySelector('#add-song-form');
    const nameInput = container.querySelector('#song-name');
    const uploadArea = container.querySelector('#cover-upload-area');
    const fileInput = container.querySelector('#cover-file');
    const submitBtn = container.querySelector('#submit-btn');

    let selectedFile = null;

    backBtn.addEventListener('click', () => navigate('songs'));

    // File upload area
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent-primary)';
        uploadArea.style.background = 'var(--accent-glow)';
    });

    uploadArea.addEventListener('dragleave', () => {
        if (!selectedFile) {
            uploadArea.style.borderColor = '';
            uploadArea.style.background = '';
        }
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleFileSelect(file);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            handleFileSelect(fileInput.files[0]);
        }
    });

    function handleFileSelect(file) {
        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadArea.classList.add('has-preview');
            uploadArea.innerHTML = `<img class="cover-preview" src="${e.target.result}" alt="Preview" />`;
        };
        reader.readAsDataURL(file);
    }

    // Submit form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Please enter a song name');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        try {
            const formData = new FormData();
            formData.append('name', name);
            if (selectedFile) {
                formData.append('cover', selectedFile);
            }

            await api.addSong(formData);
            showToast('🎵 Song added!');
            navigate('songs');
        } catch (err) {
            showToast('Failed to add song: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Song';
        }
    });

    // Auto-focus name input
    nameInput.focus();
}
