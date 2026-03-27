const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { replaceMemberMentions, syncAllCommentMentions } = require('../services/mentions');
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
        cb(null, `profile-${uniqueSuffix}${ext}`);
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

const memberSelect = `
  SELECT
    m.*,
    (
      SELECT COUNT(*)::int
      FROM comment_mentions cm
      WHERE cm.member_id = m.id AND cm.is_done = FALSE
    ) AS open_comment_count,
    (
      SELECT COUNT(*)::int
      FROM comment_mentions cm
      WHERE cm.member_id = m.id AND cm.is_done = TRUE
    ) AS done_comment_count
  FROM members m
`;

async function getMemberWithCounts(memberId, client = db) {
    const result = await client.query(`${memberSelect} WHERE m.id = $1`, [memberId]);
    return result.rows[0] || null;
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

router.get('/', asyncHandler(async (req, res) => {
    const members = await db.query(`${memberSelect} ORDER BY m.name ASC`);
    res.json(members.rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const member = await getMemberWithCounts(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(member);
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
    const member = await getMemberWithCounts(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    const comments = await db.query(
        `
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
      WHERE cm.member_id = $1
      ORDER BY cm.is_done ASC, c.created_at DESC
    `,
        [req.params.id]
    );

    res.json({ member, comments: comments.rows });
}));

router.post('/', upload.single('avatar'), asyncHandler(async (req, res) => {
    const { name } = req.body;
    const nextName = name?.trim();

    if (!nextName) {
        cleanupUploadedFile(req.file);
        return res.status(400).json({ error: 'Profile name is required' });
    }

    const existing = await db.query('SELECT id FROM members WHERE lower(name) = lower($1)', [nextName]);
    if (existing.rows[0]) {
        cleanupUploadedFile(req.file);
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const avatarImage = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await db.query(
        'INSERT INTO members (name, avatar_image) VALUES ($1, $2) RETURNING id',
        [nextName, avatarImage]
    );

    await syncAllCommentMentions();

    const member = await getMemberWithCounts(result.rows[0].id);
    res.status(201).json(member);
}));

router.patch('/:id', upload.single('avatar'), asyncHandler(async (req, res) => {
    const memberResult = await db.query('SELECT * FROM members WHERE id = $1', [req.params.id]);
    const member = memberResult.rows[0];

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

    const duplicate = await db.query(
        'SELECT id FROM members WHERE lower(name) = lower($1) AND id != $2',
        [nextName, req.params.id]
    );
    if (duplicate.rows[0]) {
        cleanupUploadedFile(req.file);
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const avatarImage = req.file ? `/uploads/${req.file.filename}` : member.avatar_image;

    await db.withTransaction(async (client) => {
        await client.query(
            'UPDATE members SET name = $1, avatar_image = $2 WHERE id = $3',
            [nextName, avatarImage, req.params.id]
        );

        if (nextName !== member.name) {
            await client.query(
                `
                  UPDATE comments
                  SET author = $1
                  WHERE author_id = $2 OR (author_id IS NULL AND lower(author) = lower($3))
                `,
                [nextName, req.params.id, member.name]
            );
            await replaceMemberMentions(member.name, nextName, client);
            await syncAllCommentMentions(client);
        }
    });

    if (req.file && member.avatar_image && member.avatar_image !== avatarImage) {
        cleanupStoredImage(member.avatar_image);
    }

    res.json(await getMemberWithCounts(req.params.id));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const memberResult = await db.query('SELECT * FROM members WHERE id = $1', [req.params.id]);
    const member = memberResult.rows[0];
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    cleanupStoredImage(member.avatar_image);
    await db.query('DELETE FROM members WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

module.exports = router;
