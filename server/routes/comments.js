const express = require('express');
const db = require('../db');
const { syncCommentMentionsForComment } = require('../services/mentions');

const router = express.Router();

const commentSelect = `
  SELECT
    c.id,
    c.song_id,
    c.author,
    c.author_id,
    COALESCE(m.name, c.author) AS author_name,
    c.text,
    c.created_at
  FROM comments c
  LEFT JOIN members m ON m.id = c.author_id
`;

// GET /api/songs/:songId/comments — List comments for a song
router.get('/songs/:songId/comments', (req, res) => {
    const comments = db.prepare(
        `${commentSelect} WHERE c.song_id = ? ORDER BY c.created_at DESC`
    ).all(req.params.songId);
    res.json(comments);
});

// POST /api/songs/:songId/comments — Add a comment
router.post('/songs/:songId/comments', (req, res) => {
    const { author, authorId, text } = req.body;
    const trimmedText = text?.trim();

    if (!trimmedText) {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    const song = db.prepare('SELECT id FROM songs WHERE id = ?').get(req.params.songId);
    if (!song) {
        return res.status(404).json({ error: 'Song not found' });
    }

    let member = null;
    if (authorId !== undefined && authorId !== null && authorId !== '') {
        member = db.prepare('SELECT id, name FROM members WHERE id = ?').get(authorId);
        if (!member) {
            return res.status(404).json({ error: 'Profile not found' });
        }
    }

    const authorName = member?.name || author?.trim();
    if (!authorName) {
        return res.status(400).json({ error: 'Author is required' });
    }

    const result = db.prepare(
        'INSERT INTO comments (song_id, author, author_id, text) VALUES (?, ?, ?, ?)'
    ).run(req.params.songId, authorName, member?.id || null, trimmedText);

    syncCommentMentionsForComment(result.lastInsertRowid);

    const comment = db.prepare(`${commentSelect} WHERE c.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(comment);
});

// PATCH /api/comments/:id/status — Mark a mentioned comment as done/open for a profile
router.patch('/comments/:id/status', (req, res) => {
    const { memberId, isDone } = req.body;
    const mention = db.prepare(
        'SELECT * FROM comment_mentions WHERE comment_id = ? AND member_id = ?'
    ).get(req.params.id, memberId);

    if (!mention) {
        return res.status(404).json({ error: 'Mention not found for this profile' });
    }

    db.prepare(
        'UPDATE comment_mentions SET is_done = ? WHERE comment_id = ? AND member_id = ?'
    ).run(isDone ? 1 : 0, req.params.id, memberId);

    const updated = db.prepare(
        'SELECT comment_id, member_id, is_done FROM comment_mentions WHERE comment_id = ? AND member_id = ?'
    ).get(req.params.id, memberId);

    res.json(updated);
});

// DELETE /api/comments/:id — Delete a comment
router.delete('/comments/:id', (req, res) => {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
