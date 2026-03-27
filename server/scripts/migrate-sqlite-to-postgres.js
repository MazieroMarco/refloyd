require('../load-env');
const path = require('path');
const Database = require('better-sqlite3');
const { initDatabase, query, withTransaction, pool } = require('../db');

const sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.cwd(), process.env.SQLITE_PATH)
    : path.join(__dirname, '..', 'data.db');

async function main() {
    const sqlite = new Database(sqlitePath, { readonly: true });

    try {
        await initDatabase({ seedDefaultMembers: false });
        await ensureRemoteDatabaseIsEmpty();

        const members = sqlite.prepare('SELECT * FROM members ORDER BY id ASC').all();
        const songs = sqlite.prepare('SELECT * FROM songs ORDER BY id ASC').all();
        const setlists = sqlite.prepare('SELECT * FROM setlists ORDER BY id ASC').all();
        const setlistSongs = sqlite.prepare('SELECT * FROM setlist_songs ORDER BY id ASC').all();
        const comments = sqlite.prepare('SELECT * FROM comments ORDER BY id ASC').all();
        const commentMentions = sqlite.prepare('SELECT * FROM comment_mentions ORDER BY comment_id ASC, member_id ASC').all();
        const authSessions = sqlite.prepare('SELECT * FROM auth_sessions ORDER BY created_at ASC, id ASC').all();

        await withTransaction(async (client) => {
            for (const member of members) {
                await client.query(
                    `
                      INSERT INTO members (id, name, avatar_image, created_at)
                      VALUES ($1, $2, $3, $4)
                    `,
                    [member.id, member.name, member.avatar_image, member.created_at]
                );
            }

            for (const song of songs) {
                await client.query(
                    `
                      INSERT INTO songs (id, name, cover_image, rehearsal_count, created_at)
                      VALUES ($1, $2, $3, $4, $5)
                    `,
                    [song.id, song.name, song.cover_image, song.rehearsal_count, song.created_at]
                );
            }

            for (const setlist of setlists) {
                await client.query(
                    `
                      INSERT INTO setlists (id, name, created_at, updated_at)
                      VALUES ($1, $2, $3, $4)
                    `,
                    [setlist.id, setlist.name, setlist.created_at, setlist.updated_at]
                );
            }

            for (const entry of setlistSongs) {
                await client.query(
                    `
                      INSERT INTO setlist_songs (id, setlist_id, song_id, position)
                      VALUES ($1, $2, $3, $4)
                    `,
                    [entry.id, entry.setlist_id, entry.song_id, entry.position]
                );
            }

            for (const comment of comments) {
                await client.query(
                    `
                      INSERT INTO comments (id, song_id, author, text, created_at, author_id)
                      VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [comment.id, comment.song_id, comment.author, comment.text, comment.created_at, comment.author_id]
                );
            }

            for (const mention of commentMentions) {
                await client.query(
                    `
                      INSERT INTO comment_mentions (comment_id, member_id, is_done, created_at)
                      VALUES ($1, $2, $3, $4)
                    `,
                    [mention.comment_id, mention.member_id, Boolean(mention.is_done), mention.created_at]
                );
            }

            for (const session of authSessions) {
                await client.query(
                    `
                      INSERT INTO auth_sessions (id, subject, user_json, id_token, expires_at, created_at)
                      VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [session.id, session.subject, session.user_json, session.id_token, session.expires_at, session.created_at]
                );
            }
        });

        await syncSequences();

        console.log(`Migrated SQLite data from ${sqlitePath} to Postgres.`);
        console.log(`Imported ${members.length} members, ${songs.length} songs, ${comments.length} comments, and ${setlists.length} setlists.`);
    } finally {
        sqlite.close();
        await pool.end();
    }
}

async function ensureRemoteDatabaseIsEmpty() {
    const result = await query(
        `
          SELECT
            (SELECT COUNT(*)::int FROM members) AS members,
            (SELECT COUNT(*)::int FROM songs) AS songs,
            (SELECT COUNT(*)::int FROM setlists) AS setlists,
            (SELECT COUNT(*)::int FROM comments) AS comments,
            (SELECT COUNT(*)::int FROM auth_sessions) AS auth_sessions
        `
    );
    const counts = result.rows[0];
    const hasExistingData = Object.values(counts).some((value) => Number(value) > 0);

    if (hasExistingData && await clearSeedMembersIfNeeded(counts)) {
        return;
    }

    if (hasExistingData) {
        throw new Error('The remote Postgres database is not empty. Abort migration to avoid overwriting live data.');
    }
}

async function clearSeedMembersIfNeeded(counts) {
    const memberCount = Number(counts.members || 0);
    const hasOtherData = ['songs', 'setlists', 'comments', 'auth_sessions']
        .some((key) => Number(counts[key] || 0) > 0);

    if (hasOtherData || memberCount !== 4) {
        return false;
    }

    const result = await query(
        `
          SELECT
            array_agg(name ORDER BY id) AS names,
            COUNT(*) FILTER (WHERE avatar_image IS NOT NULL)::int AS avatars
          FROM members
        `
    );
    const row = result.rows[0];
    const expectedNames = ['Member 1', 'Member 2', 'Member 3', 'Member 4'];
    const actualNames = Array.isArray(row.names) ? row.names : [];
    const isSeedData = row.avatars === 0
        && actualNames.length === expectedNames.length
        && actualNames.every((name, index) => name === expectedNames[index]);

    if (!isSeedData) {
        return false;
    }

    await query('TRUNCATE TABLE members RESTART IDENTITY CASCADE');
    return true;
}

async function syncSequences() {
    const tables = ['members', 'songs', 'setlists', 'setlist_songs', 'comments'];

    for (const tableName of tables) {
        await query(
            `
              SELECT setval(
                pg_get_serial_sequence($1, 'id'),
                COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
                (SELECT MAX(id) IS NOT NULL FROM ${tableName})
              )
            `,
            [tableName]
        );
    }
}

main().catch(async (err) => {
    console.error(err.message || err);
    await pool.end().catch(() => {});
    process.exit(1);
});
