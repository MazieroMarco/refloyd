const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

// Configure multer for cover image uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `cover-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only image files are allowed'));
    }
});

// GET /api/songs — List all songs
router.get('/', (req, res) => {
    const songs = db.prepare(`
    SELECT s.*, 
      (SELECT COUNT(*) FROM comments c WHERE c.song_id = s.id) as comment_count
    FROM songs s 
    ORDER BY s.created_at DESC
  `).all();
    res.json(songs);
});

// GET /api/songs/:id — Get a single song
router.get('/:id', (req, res) => {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });
    res.json(song);
});

// POST /api/songs — Add a new song
router.post('/', upload.single('cover'), (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Song name is required' });
    }

    const coverImage = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db.prepare(
        'INSERT INTO songs (name, cover_image) VALUES (?, ?)'
    ).run(name.trim(), coverImage);

    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(song);
});

function updateRehearsalCount(req, res) {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    const rawDelta = req.body?.delta;
    const delta = rawDelta === undefined ? 1 : Number.parseInt(rawDelta, 10);

    if (!Number.isInteger(delta) || delta === 0) {
        return res.status(400).json({ error: 'A non-zero integer delta is required' });
    }

    const nextCount = Math.max(0, song.rehearsal_count + delta);

    db.prepare('UPDATE songs SET rehearsal_count = ? WHERE id = ?').run(nextCount, req.params.id);

    const updated = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    res.json(updated);
}

// PATCH /api/songs/:id/rehearse — Adjust rehearsal count
router.patch('/:id/rehearse', updateRehearsalCount);

// PATCH /api/songs/:id/rehearsal-count — Adjust rehearsal count
router.patch('/:id/rehearsal-count', updateRehearsalCount);

// DELETE /api/songs/:id — Delete a song
router.delete('/:id', (req, res) => {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    // Delete cover image file if it exists
    if (song.cover_image) {
        const filePath = path.join(__dirname, '..', song.cover_image);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
