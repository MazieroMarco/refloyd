const express = require('express');
const db = require('../db');
const { syncCommentMentionsForComment } = require('../services/mentions');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

const commentSelectFields = `
  SELECT
    c.id,
    c.song_id,
    c.author,
    c.author_id,
    COALESCE(m.name, c.author) AS author_name,
    c.text,
    c.created_at
`;

const commentSelectFrom = `
  FROM comments c
  LEFT JOIN members m ON m.id = c.author_id
`;

const commentSelect = `
  ${commentSelectFields}
  ${commentSelectFrom}
`;

router.get('/songs/:songId/comments', asyncHandler(async (req, res) => {
    const viewerMemberId = Number.parseInt(req.query.memberId, 10);
    const hasViewerMember = Number.isInteger(viewerMemberId) && viewerMemberId > 0;
    const viewerSelect = hasViewerMember
        ? `,
    CASE WHEN cm.member_id IS NULL THEN FALSE ELSE TRUE END AS viewer_is_mentioned,
    cm.is_done AS viewer_is_done`
        : `,
    FALSE AS viewer_is_mentioned,
    NULL::boolean AS viewer_is_done`;
    const viewerJoin = hasViewerMember
        ? 'LEFT JOIN comment_mentions cm ON cm.comment_id = c.id AND cm.member_id = $1'
        : '';
    const params = hasViewerMember
        ? [viewerMemberId, req.params.songId]
        : [req.params.songId];
    const songIdPlaceholder = hasViewerMember ? '$2' : '$1';

    const comments = await db.query(
        `${commentSelectFields}
        ${viewerSelect}
        ${commentSelectFrom}
        ${viewerJoin}
        WHERE c.song_id = ${songIdPlaceholder}
        ORDER BY c.created_at DESC`,
        params
    );

    res.json(comments.rows);
}));

router.post('/songs/:songId/comments', asyncHandler(async (req, res) => {
    const { author, authorId, text } = req.body;
    const trimmedText = text?.trim();

    if (!trimmedText) {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    const songResult = await db.query('SELECT id FROM songs WHERE id = $1', [req.params.songId]);
    const song = songResult.rows[0];
    if (!song) {
        return res.status(404).json({ error: 'Song not found' });
    }

    let member = null;
    if (authorId !== undefined && authorId !== null && authorId !== '') {
        const memberResult = await db.query('SELECT id, name FROM members WHERE id = $1', [authorId]);
        member = memberResult.rows[0] || null;
        if (!member) {
            return res.status(404).json({ error: 'Profile not found' });
        }
    }

    const authorName = member?.name || author?.trim();
    if (!authorName) {
        return res.status(400).json({ error: 'Author is required' });
    }

    const insertResult = await db.query(
        'INSERT INTO comments (song_id, author, author_id, text) VALUES ($1, $2, $3, $4) RETURNING id',
        [req.params.songId, authorName, member?.id || null, trimmedText]
    );
    const commentId = insertResult.rows[0].id;

    await syncCommentMentionsForComment(commentId);

    const commentResult = await db.query(`${commentSelect} WHERE c.id = $1`, [commentId]);
    res.status(201).json(commentResult.rows[0]);
}));

router.patch('/comments/:id/status', asyncHandler(async (req, res) => {
    const { memberId, isDone } = req.body;
    const mentionResult = await db.query(
        'SELECT comment_id, member_id, is_done FROM comment_mentions WHERE comment_id = $1 AND member_id = $2',
        [req.params.id, memberId]
    );
    const mention = mentionResult.rows[0];

    if (!mention) {
        return res.status(404).json({ error: 'Mention not found for this profile' });
    }

    const updated = await db.query(
        `
          UPDATE comment_mentions
          SET is_done = $1
          WHERE comment_id = $2 AND member_id = $3
          RETURNING comment_id, member_id, is_done
        `,
        [Boolean(isDone), req.params.id, memberId]
    );

    res.json(updated.rows[0]);
}));

router.delete('/comments/:id', asyncHandler(async (req, res) => {
    const commentResult = await db.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    const comment = commentResult.rows[0];
    if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
    }

    await db.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

module.exports = router;
