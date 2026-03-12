const express = require('express');
const db = require('../db');
const { replaceMemberMentions, syncAllCommentMentions } = require('../services/mentions');

const router = express.Router();

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

// GET /api/members — List all profiles
router.get('/', (req, res) => {
    const members = db.prepare(`${memberSelect} ORDER BY m.name ASC`).all();
    res.json(members);
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
        COALESCE(author_member.name, c.author) AS author_name,
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
router.post('/', (req, res) => {
    const { name } = req.body;
    const nextName = name?.trim();

    if (!nextName) {
        return res.status(400).json({ error: 'Profile name is required' });
    }

    const existing = db.prepare('SELECT id FROM members WHERE lower(name) = lower(?)').get(nextName);
    if (existing) {
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    const result = db.prepare('INSERT INTO members (name) VALUES (?)').run(nextName);
    syncAllCommentMentions();

    const member = getMemberWithCounts(result.lastInsertRowid);
    res.status(201).json(member);
});

// PATCH /api/members/:id — Rename a profile
router.patch('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    const { name } = req.body;
    const nextName = name?.trim();

    if (!nextName) {
        return res.status(400).json({ error: 'Profile name is required' });
    }

    const duplicate = db.prepare(
        'SELECT id FROM members WHERE lower(name) = lower(?) AND id != ?'
    ).get(nextName, req.params.id);

    if (duplicate) {
        return res.status(409).json({ error: 'A profile with this name already exists' });
    }

    db.prepare('UPDATE members SET name = ? WHERE id = ?').run(nextName, req.params.id);
    db.prepare(`
      UPDATE comments
      SET author = ?
      WHERE author_id = ? OR (author_id IS NULL AND lower(author) = lower(?))
    `).run(nextName, req.params.id, member.name);
    replaceMemberMentions(member.name, nextName);
    syncAllCommentMentions();

    res.json(getMemberWithCounts(req.params.id));
});

// DELETE /api/members/:id — Remove a profile
router.delete('/:id', (req, res) => {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
    if (!member) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
