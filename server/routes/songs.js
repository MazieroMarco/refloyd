const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

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
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    },
});

async function getSongById(songId) {
    const result = await db.query('SELECT * FROM songs WHERE id = $1', [songId]);
    return result.rows[0] || null;
}

router.get('/', asyncHandler(async (req, res) => {
    const sortOrder = {
        newest: 's.created_at DESC, s.id DESC',
        'least-rehearsed': 's.rehearsal_count ASC, LOWER(s.name) ASC, s.id ASC',
        'most-rehearsed': 's.rehearsal_count DESC, LOWER(s.name) ASC, s.id ASC',
        name: 'LOWER(s.name) ASC, s.id ASC',
    };
    const selectedSort = sortOrder[req.query.sort] ? req.query.sort : 'newest';

    const songs = await db.query(
        `
      SELECT
        s.*,
        (SELECT COUNT(*)::int FROM comments c WHERE c.song_id = s.id) AS comment_count
      FROM songs s
      ORDER BY ${sortOrder[selectedSort]}
    `
    );

    res.json(songs.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const song = await getSongById(req.params.id);
    if (!song) {
        return res.status(404).json({ error: 'Song not found' });
    }

    res.json(song);
}));

router.post('/', upload.single('cover'), asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Song name is required' });
    }

    const coverImage = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await db.query(
        'INSERT INTO songs (name, cover_image) VALUES ($1, $2) RETURNING *',
        [name.trim(), coverImage]
    );

    res.status(201).json(result.rows[0]);
}));

async function updateRehearsalCount(req, res) {
    const song = await getSongById(req.params.id);
    if (!song) {
        return res.status(404).json({ error: 'Song not found' });
    }

    const rawDelta = req.body?.delta;
    const delta = rawDelta === undefined ? 1 : Number.parseInt(rawDelta, 10);

    if (!Number.isInteger(delta) || delta === 0) {
        return res.status(400).json({ error: 'A non-zero integer delta is required' });
    }

    const nextCount = Math.max(0, song.rehearsal_count + delta);
    const updated = await db.query(
        'UPDATE songs SET rehearsal_count = $1 WHERE id = $2 RETURNING *',
        [nextCount, req.params.id]
    );

    res.json(updated.rows[0]);
}

router.patch('/:id/rehearse', asyncHandler(updateRehearsalCount));
router.patch('/:id/rehearsal-count', asyncHandler(updateRehearsalCount));

router.delete('/:id', asyncHandler(async (req, res) => {
    const song = await getSongById(req.params.id);
    if (!song) {
        return res.status(404).json({ error: 'Song not found' });
    }

    if (song.cover_image) {
        const filePath = path.join(__dirname, '..', song.cover_image);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    await db.query('DELETE FROM songs WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

module.exports = router;
