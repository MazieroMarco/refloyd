const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { replaceMemberMentions, syncAllCommentMentions } = require('../services/mentions');

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
        cb(null, `profile-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        if (ext && mime) return cb(null, true);
        cb(new Error('Only image files are allowed'));
    }
});

const memberSelect = `
  SELECT
    m.*,
    (
      SELECT COUNT(*)
      FROM comment_mentions cm
      WHERE cm.member_id = m.id AND cm.is_done = 0
    ) AS open_comment_count,
    (
      SELECT COUNT(*)
      FROM comment_mentions cm
      WHERE cm.member_id = m.id AND cm.is_done = 1
    ) AS done_comment_count
  FROM members m
`;

function getMemberWithCounts(memberId) {
    return db.prepare(`${memberSelect} WHERE m.id = ?`).get(memberId);
}

function cleanupUploadedFile(file) {
    if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }
}

function cleanupStoredImage(relativePath) {
    if (!relativePath) {
        return;
    }

    const filePath = path.join(__dirname, '..', relativePath);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

// GET /api/members — List all profiles
router.get('/', (req, res) => {
    const members = db.prepare(`${memberSelect} ORDER BY m.name ASC`).all();
    res.json(members);
});

// GET /api/members/:id — Single profile
router.get('/:id', (req, res) => {
    const member = getMemberWithCounts(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(member);
});

// GET /api/members/:id/comments — Profile detail with all mentions
router.get('/:id/comments', (req, res) => {
    const member = getMemberWithCounts(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    const comments = db.prepare(`
      SELECT
        c.id,
        c.song_id,
        s.name AS song_name,
        s.cover_image AS song_cover_image,
        COALESCE(author_member.name, c.author) AS author_name,
        author_member.avatar_image AS author_avatar_image,
        c.text,
        c.created_at,
        cm.is_done
      FROM comment_mentions cm
      JOIN comments c ON c.id = cm.comment_id
      JOIN songs s ON s.id = c.song_id
      LEFT JOIN members author_member ON author_member.id = c.author_id
      WHERE cm.member_id = ?
      ORDER BY cm.is_done ASC, c.created_at DESC
    `).all(req.params.id);

    res.json({ member, comments });
});

// POST /api/members — Add a new profile
router.post('/', upload.single('avatar'), (req, res) => {
    const { name } = req.body;
    const nextName = name?.trim();

    if (!nextName) {
        cleanupUploadedFile(req.file);
        return res.status(400).json({ error: 'Profile name is required' });
    }

    const existing = db.prepare('SELECT id FROM members WHERE lower(name) = lower(?)').get(nextName);
    if (existing) {
        cleanupUploadedFile(req.file);
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const avatarImage = req.file ? `/uploads/${req.file.filename}` : null;
    const result = db.prepare('INSERT INTO members (name, avatar_image) VALUES (?, ?)').run(nextName, avatarImage);
    syncAllCommentMentions();

    const member = getMemberWithCounts(result.lastInsertRowid);
    res.status(201).json(member);
});

// PATCH /api/members/:id — Update profile information
router.patch('/:id', upload.single('avatar'), (req, res) => {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) {
        cleanupUploadedFile(req.file);
        return res.status(404).json({ error: 'Profile not found' });
    }

    const { name } = req.body;
    const nextName = typeof name === 'string' ? name.trim() : member.name;

    if (!nextName) {
        cleanupUploadedFile(req.file);
        return res.status(400).json({ error: 'Profile name is required' });
    }

    const duplicate = db.prepare(
        'SELECT id FROM members WHERE lower(name) = lower(?) AND id != ?'
    ).get(nextName, req.params.id);

    if (duplicate) {
        cleanupUploadedFile(req.file);
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const avatarImage = req.file ? `/uploads/${req.file.filename}` : member.avatar_image;
    db.prepare('UPDATE members SET name = ?, avatar_image = ? WHERE id = ?').run(
        nextName,
        avatarImage,
        req.params.id
    );

    if (req.file && member.avatar_image && member.avatar_image !== avatarImage) {
        cleanupStoredImage(member.avatar_image);
    }

    if (nextName !== member.name) {
        db.prepare(`
          UPDATE comments
          SET author = ?
          WHERE author_id = ? OR (author_id IS NULL AND lower(author) = lower(?))
        `).run(nextName, req.params.id, member.name);
        replaceMemberMentions(member.name, nextName);
        syncAllCommentMentions();
    }

    res.json(getMemberWithCounts(req.params.id));
});

// DELETE /api/members/:id — Remove a profile
router.delete('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    cleanupStoredImage(member.avatar_image);
    db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
