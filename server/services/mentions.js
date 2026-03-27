const db = require('../db');

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMentionRegex(name, flags = 'i') {
    return new RegExp(`(^|[\\s([{])@${escapeRegex(name)}(?=$|[\\s.,!?;:)\\]}])`, flags);
}

function commentMentionsMember(text, memberName) {
    return buildMentionRegex(memberName).test(text);
}

async function getAllMembers(client) {
    const result = await client.query('SELECT id, name FROM members ORDER BY id ASC');
    return result.rows;
}

async function getAllComments(client) {
    const result = await client.query('SELECT id, author, author_id, text FROM comments ORDER BY id ASC');
    return result.rows;
}

async function getCommentById(client, commentId) {
    const result = await client.query(
        'SELECT id, author, author_id, text FROM comments WHERE id = $1',
        [commentId]
    );
    return result.rows[0] || null;
}

async function syncCommentMentionsInternal(client, comment, members) {
    const mentionRows = await client.query(
        'SELECT member_id FROM comment_mentions WHERE comment_id = $1',
        [comment.id]
    );
    const existingMemberIds = new Set(mentionRows.rows.map((row) => row.member_id));
    const mentionedMemberIds = new Set();

    for (const member of members) {
        if (commentMentionsMember(comment.text, member.name)) {
            mentionedMemberIds.add(member.id);
        }

        if (!comment.author_id && comment.author && comment.author.toLowerCase() === member.name.toLowerCase()) {
            await client.query('UPDATE comments SET author_id = $1 WHERE id = $2', [member.id, comment.id]);
            comment.author_id = member.id;
        }
    }

    for (const memberId of existingMemberIds) {
        if (!mentionedMemberIds.has(memberId)) {
            await client.query(
                'DELETE FROM comment_mentions WHERE comment_id = $1 AND member_id = $2',
                [comment.id, memberId]
            );
        }
    }

    for (const memberId of mentionedMemberIds) {
        if (!existingMemberIds.has(memberId)) {
            await client.query(
                'INSERT INTO comment_mentions (comment_id, member_id) VALUES ($1, $2)',
                [comment.id, memberId]
            );
        }
    }
}

async function runWithTransaction(client, callback) {
    if (client) {
        return callback(client);
    }

    return db.withTransaction(callback);
}

async function syncAllCommentMentions(client = null) {
    return runWithTransaction(client, async (tx) => {
        const members = await getAllMembers(tx);
        const comments = await getAllComments(tx);

        for (const comment of comments) {
            await syncCommentMentionsInternal(tx, comment, members);
        }
    });
}

async function syncCommentMentionsForComment(commentId, client = null) {
    return runWithTransaction(client, async (tx) => {
        const comment = await getCommentById(tx, commentId);
        if (!comment) {
            return;
        }

        const members = await getAllMembers(tx);
        await syncCommentMentionsInternal(tx, comment, members);
    });
}

async function replaceMemberMentions(oldName, newName, client = null) {
    return runWithTransaction(client, async (tx) => {
        const comments = await getAllComments(tx);
        const mentionRegex = buildMentionRegex(oldName, 'gi');

        for (const comment of comments) {
            const updatedText = comment.text.replace(mentionRegex, (_, prefix) => `${prefix}@${newName}`);
            if (updatedText !== comment.text) {
                await tx.query('UPDATE comments SET text = $1 WHERE id = $2', [updatedText, comment.id]);
            }
        }
    });
}

module.exports = {
    replaceMemberMentions,
    syncAllCommentMentions,
    syncCommentMentionsForComment,
};
