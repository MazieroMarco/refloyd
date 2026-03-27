require('./load-env');
const fs = require('fs');
const { Pool } = require('pg');

const rawConnectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();

if (!rawConnectionString) {
    throw new Error('DATABASE_URL is required. Re:Floyd now uses Postgres for persistence.');
}

const connectionString = sanitizeConnectionString(rawConnectionString);

const pool = new Pool({
    connectionString,
    ssl: buildSslConfig(rawConnectionString),
});

pool.on('error', (err) => {
    console.error('Unexpected Postgres error', err);
});

function buildSslConfig(url) {
    const sslMode = normalizeSslMode(process.env.DATABASE_SSL || process.env.PGSSLMODE);
    const ca = loadCaCertificate();
    const rejectUnauthorized = resolveRejectUnauthorized({
        sslMode,
        ca,
        explicitValue: normalizeBoolean(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED),
    });

    if (sslMode === false) {
        return false;
    }

    if (sslMode === true) {
        return buildSslOptions(rejectUnauthorized, ca);
    }

    if (ca) {
        return buildSslOptions(rejectUnauthorized, ca);
    }

    return shouldUseSslByDefault(url)
        ? buildSslOptions(rejectUnauthorized, null)
        : false;
}

function buildSslOptions(rejectUnauthorized, ca) {
    return {
        rejectUnauthorized,
        ...(ca ? { ca } : {}),
    };
}

function sanitizeConnectionString(value) {
    try {
        const url = new URL(value);
        ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'].forEach((key) => {
            url.searchParams.delete(key);
        });
        return url.toString();
    } catch (err) {
        return value;
    }
}

function normalizeSslMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (['0', 'false', 'no', 'off', 'disable'].includes(normalized)) {
        return false;
    }

    if (['1', 'true', 'yes', 'on', 'require', 'prefer', 'verify-ca', 'verify-full'].includes(normalized)) {
        return true;
    }

    return null;
}

function normalizeBoolean(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }

    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return null;
}

function loadCaCertificate() {
    const inlineCertificate = (process.env.DATABASE_SSL_CA || '').trim();
    if (inlineCertificate) {
        return inlineCertificate.replace(/\\n/g, '\n');
    }

    const certificatePath = (process.env.DATABASE_SSL_CA_FILE || process.env.PGSSLROOTCERT || '').trim();
    if (!certificatePath) {
        return null;
    }

    return fs.readFileSync(certificatePath, 'utf8');
}

function resolveRejectUnauthorized({ sslMode, ca, explicitValue }) {
    if (explicitValue !== null) {
        return explicitValue;
    }

    if (ca) {
        return true;
    }

    if (sslMode === true) {
        return false;
    }

    return false;
}

function shouldUseSslByDefault(url) {
    try {
        const parsedUrl = new URL(url);
        const host = (parsedUrl.hostname || '').toLowerCase();
        return !['localhost', '127.0.0.1', '::1'].includes(host);
    } catch (err) {
        return true;
    }
}

async function query(text, params = []) {
    return pool.query(text, params);
}

async function withTransaction(callback) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Failed to rollback Postgres transaction', rollbackError);
        }
        throw err;
    } finally {
        client.release();
    }
}

async function initDatabase(options = {}) {
    const { seedDefaultMembers = true } = options;

    await query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        avatar_image TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS songs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        cover_image TEXT,
        rehearsal_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS setlists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS setlist_songs (
        id SERIAL PRIMARY KEY,
        setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
        song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        UNIQUE (setlist_id, position)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      ALTER TABLE comments
      ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES members(id) ON DELETE SET NULL
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS comment_mentions (
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        is_done BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comment_id, member_id)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        user_json TEXT NOT NULL,
        id_token TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query('ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_image TEXT');

    await query('CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_comment_mentions_member_done ON comment_mentions(member_id, is_done)');
    await query('CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist_position ON setlist_songs(setlist_id, position)');
    await query('CREATE INDEX IF NOT EXISTS idx_setlist_songs_song_id ON setlist_songs(song_id)');
    await query('CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at)');

    const memberCountResult = await query('SELECT COUNT(*)::int AS count FROM members');
    if (seedDefaultMembers && memberCountResult.rows[0]?.count === 0) {
        await query('INSERT INTO members (name) SELECT unnest($1::text[])', [
            ['Member 1', 'Member 2', 'Member 3', 'Member 4'],
        ]);
    }
}

module.exports = {
    initDatabase,
    pool,
    query,
    withTransaction,
};
