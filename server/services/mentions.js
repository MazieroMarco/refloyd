const db = require('../db');

const getAllMembers = db.prepare('SELECT id, name FROM members ORDER BY id ASC');
const getAllComments = db.prepare('SELECT id, author, author_id, text FROM comments ORDER BY id ASC');
const getCommentById = db.prepare('SELECT id, author, author_id, text FROM comments WHERE id = ?');
const getCommentMentionRows = db.prepare('SELECT member_id FROM comment_mentions WHERE comment_id = ?');
const insertCommentMention = db.prepare('INSERT INTO comment_mentions (comment_id, member_id) VALUES (?, ?)');
const deleteCommentMention = db.prepare('DELETE FROM comment_mentions WHERE comment_id = ? AND member_id = ?');
const setCommentAuthorId = db.prepare('UPDATE comments SET author_id = ? WHERE id = ?');
const updateCommentText = db.prepare('UPDATE comments SET text = ? WHERE id = ?');

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMentionRegex(name, flags = 'i') {
    return new RegExp(`(^|[\\s([{])@${escapeRegex(name)}(?=$|[\\s.,!?;:)\\]}])`, flags);
}

function commentMentionsMember(text, memberName) {
    return buildMentionRegex(memberName).test(text);
}

function syncCommentMentionsInternal(comment, members) {
    const existingMemberIds = new Set(
        getCommentMentionRows.all(comment.id).map((row) => row.member_id)
    );

    const mentionedMemberIds = new Set();
    for (const member of members) {
        if (commentMentionsMember(comment.text, member.name)) {
            mentionedMemberIds.add(member.id);
        }

        if (!comment.author_id && comment.author && comment.author.toLowerCase() === member.name.toLowerCase()) {
            setCommentAuthorId.run(member.id, comment.id);
            comment.author_id = member.id;
        }
    }

    for (const memberId of existingMemberIds) {
        if (!mentionedMemberIds.has(memberId)) {
            deleteCommentMention.run(comment.id, memberId);
        }
    }

    for (const memberId of mentionedMemberIds) {
        if (!existingMemberIds.has(memberId)) {
            insertCommentMention.run(comment.id, memberId);
        }
    }
}

const syncAllCommentMentions = db.transaction(() => {
    const members = getAllMembers.all();
    const comments = getAllComments.all();

    for (const comment of comments) {
        syncCommentMentionsInternal(comment, members);
    }
});

const syncCommentMentionsForComment = db.transaction((commentId) => {
    const comment = getCommentById.get(commentId);
    if (!comment) {
        return;
    }

    const members = getAllMembers.all();
    syncCommentMentionsInternal(comment, members);
});

const replaceMemberMentions = db.transaction((oldName, newName) => {
    const comments = getAllComments.all();
    const mentionRegex = buildMentionRegex(oldName, 'gi');

    for (const comment of comments) {
        const updatedText = comment.text.replace(mentionRegex, (_, prefix) => `${prefix}@${newName}`);
        if (updatedText !== comment.text) {
            updateCommentText.run(updatedText, comment.id);
        }
    }
});

module.exports = {
    replaceMemberMentions,
    syncAllCommentMentions,
    syncCommentMentionsForComment,
};
