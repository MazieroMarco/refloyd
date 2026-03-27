const express = require('express');
const db = require('../db');
const { asyncHandler } = require('../utils/async-handler');

const router = express.Router();

function parseSongIds(value) {
    if (!Array.isArray(value) || value.length === 0) {
        return null;
    }

    const songIds = value.map((songId) => Number.parseInt(songId, 10));
    if (songIds.some((songId) => !Number.isInteger(songId) || songId <= 0)) {
        return null;
    }

    return songIds;
}

async function validateSongIds(songIds) {
    if (!songIds?.length) {
        return false;
    }

    const uniqueSongIds = [...new Set(songIds)];
    const existingSongs = await db.query(
        'SELECT id FROM songs WHERE id = ANY($1::int[])',
        [uniqueSongIds]
    );

    return existingSongs.rows.length === uniqueSongIds.length;
}

async function getSetlistSummaryRows() {
    const result = await db.query(
        `
        SELECT
            sl.id,
            sl.name,
            sl.created_at,
            sl.updated_at,
            ss.position,
            s.id AS song_id,
            s.name AS song_name
        FROM setlists sl
        LEFT JOIN setlist_songs ss ON ss.setlist_id = sl.id
        LEFT JOIN songs s ON s.id = ss.song_id
        ORDER BY sl.updated_at DESC, sl.id DESC, ss.position ASC
    `
    );

    return result.rows;
}

function buildSetlistSummaries(rows) {
    const summaries = [];
    const byId = new Map();

    rows.forEach((row) => {
        let setlist = byId.get(row.id);
        if (!setlist) {
            setlist = {
                id: row.id,
                name: row.name,
                created_at: row.created_at,
                updated_at: row.updated_at,
                song_count: 0,
                preview_songs: [],
            };
            byId.set(row.id, setlist);
            summaries.push(setlist);
        }

        if (row.song_id) {
            setlist.song_count += 1;
            if (setlist.preview_songs.length < 3) {
                setlist.preview_songs.push({
                    id: row.song_id,
                    name: row.song_name,
                });
            }
        }
    });

    return summaries;
}

async function getSetlistById(setlistId, client = db) {
    const setlistResult = await client.query('SELECT * FROM setlists WHERE id = $1', [setlistId]);
    const setlist = setlistResult.rows[0];
    if (!setlist) {
        return null;
    }

    const songsResult = await client.query(
        `
        SELECT
            ss.id AS entry_id,
            ss.position,
            s.id,
            s.name,
            s.cover_image,
            s.rehearsal_count
        FROM setlist_songs ss
        INNER JOIN songs s ON s.id = ss.song_id
        WHERE ss.setlist_id = $1
        ORDER BY ss.position ASC
    `,
        [setlistId]
    );

    return {
        ...setlist,
        song_count: songsResult.rows.length,
        songs: songsResult.rows,
    };
}

async function replaceSetlistSongs(client, setlistId, songIds) {
    await client.query('DELETE FROM setlist_songs WHERE setlist_id = $1', [setlistId]);

    for (const [index, songId] of songIds.entries()) {
        await client.query(
            'INSERT INTO setlist_songs (setlist_id, song_id, position) VALUES ($1, $2, $3)',
            [setlistId, songId, index + 1]
        );
    }
}

async function createSetlist(name, songIds) {
    return db.withTransaction(async (client) => {
        const result = await client.query(
            'INSERT INTO setlists (name) VALUES ($1) RETURNING id',
            [name]
        );
        const setlistId = result.rows[0].id;
        await replaceSetlistSongs(client, setlistId, songIds);
        return setlistId;
    });
}

async function updateSetlist(setlistId, name, songIds) {
    return db.withTransaction(async (client) => {
        await client.query(
            'UPDATE setlists SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [name, setlistId]
        );
        await replaceSetlistSongs(client, setlistId, songIds);
    });
}

router.get('/', asyncHandler(async (req, res) => {
    const summaries = buildSetlistSummaries(await getSetlistSummaryRows());
    res.json(summaries);
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const setlist = await getSetlistById(req.params.id);
    if (!setlist) {
        return res.status(404).json({ error: 'Setlist not found' });
    }

    res.json(setlist);
}));

router.post('/', asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const songIds = parseSongIds(req.body?.songIds);

    if (!name) {
        return res.status(400).json({ error: 'Setlist name is required' });
    }

    if (!songIds) {
        return res.status(400).json({ error: 'Setlists need at least one song' });
    }

    if (!await validateSongIds(songIds)) {
        return res.status(400).json({ error: 'One or more songs could not be found' });
    }

    const setlistId = await createSetlist(name, songIds);
    const setlist = await getSetlistById(setlistId);
    res.status(201).json(setlist);
}));

router.patch('/:id', asyncHandler(async (req, res) => {
    const existingSetlist = await db.query('SELECT id FROM setlists WHERE id = $1', [req.params.id]);
    if (!existingSetlist.rows[0]) {
        return res.status(404).json({ error: 'Setlist not found' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const songIds = parseSongIds(req.body?.songIds);

    if (!name) {
        return res.status(400).json({ error: 'Setlist name is required' });
    }

    if (!songIds) {
        return res.status(400).json({ error: 'Setlists need at least one song' });
    }

    if (!await validateSongIds(songIds)) {
        return res.status(400).json({ error: 'One or more songs could not be found' });
    }

    await updateSetlist(req.params.id, name, songIds);
    const updatedSetlist = await getSetlistById(req.params.id);
    res.json(updatedSetlist);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const setlist = await db.query('SELECT id FROM setlists WHERE id = $1', [req.params.id]);
    if (!setlist.rows[0]) {
        return res.status(404).json({ error: 'Setlist not found' });
    }

    await db.query('DELETE FROM setlists WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

module.exports = router;
