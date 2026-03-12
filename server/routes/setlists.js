const express = require('express');
const db = require('../db');

const router = express.Router();

const createSetlistStatement = db.prepare(
    'INSERT INTO setlists (name, updated_at) VALUES (?, datetime(\'now\'))'
);
const updateSetlistStatement = db.prepare(
    'UPDATE setlists SET name = ?, updated_at = datetime(\'now\') WHERE id = ?'
);
const deleteSetlistSongsStatement = db.prepare('DELETE FROM setlist_songs WHERE setlist_id = ?');
const insertSetlistSongStatement = db.prepare(
    'INSERT INTO setlist_songs (setlist_id, song_id, position) VALUES (?, ?, ?)'
);

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

function validateSongIds(songIds) {
    if (!songIds?.length) {
        return false;
    }

    const uniqueSongIds = [...new Set(songIds)];
    const placeholders = uniqueSongIds.map(() => '?').join(', ');
    const existingSongs = db.prepare(`SELECT id FROM songs WHERE id IN (${placeholders})`).all(...uniqueSongIds);
    return existingSongs.length === uniqueSongIds.length;
}

function getSetlistSummaryRows() {
    return db.prepare(`
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
    `).all();
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

function getSetlistById(setlistId) {
    const setlist = db.prepare('SELECT * FROM setlists WHERE id = ?').get(setlistId);
    if (!setlist) {
        return null;
    }

    const songs = db.prepare(`
        SELECT
            ss.id AS entry_id,
            ss.position,
            s.id,
            s.name,
            s.cover_image,
            s.rehearsal_count
        FROM setlist_songs ss
        INNER JOIN songs s ON s.id = ss.song_id
        WHERE ss.setlist_id = ?
        ORDER BY ss.position ASC
    `).all(setlistId);

    return {
        ...setlist,
        song_count: songs.length,
        songs,
    };
}

function replaceSetlistSongs(setlistId, songIds) {
    deleteSetlistSongsStatement.run(setlistId);
    songIds.forEach((songId, index) => {
        insertSetlistSongStatement.run(setlistId, songId, index + 1);
    });
}

const createSetlist = db.transaction((name, songIds) => {
    const result = createSetlistStatement.run(name);
    songIds.forEach((songId, index) => {
        insertSetlistSongStatement.run(result.lastInsertRowid, songId, index + 1);
    });
    return result.lastInsertRowid;
});

const updateSetlist = db.transaction((setlistId, name, songIds) => {
    updateSetlistStatement.run(name, setlistId);
    replaceSetlistSongs(setlistId, songIds);
});

// GET /api/setlists — List setlists
router.get('/', (req, res) => {
    const summaries = buildSetlistSummaries(getSetlistSummaryRows());
    res.json(summaries);
});

// GET /api/setlists/:id — Get one setlist with ordered songs
router.get('/:id', (req, res) => {
    const setlist = getSetlistById(req.params.id);
    if (!setlist) {
        return res.status(404).json({ error: 'Setlist not found' });
    }

    res.json(setlist);
});

// POST /api/setlists — Create a setlist
router.post('/', (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const songIds = parseSongIds(req.body?.songIds);

    if (!name) {
        return res.status(400).json({ error: 'Setlist name is required' });
    }

    if (!songIds) {
        return res.status(400).json({ error: 'Setlists need at least one song' });
    }

    if (!validateSongIds(songIds)) {
        return res.status(400).json({ error: 'One or more songs could not be found' });
    }

    const setlistId = createSetlist(name, songIds);
    const setlist = getSetlistById(setlistId);
    res.status(201).json(setlist);
});

// PATCH /api/setlists/:id — Update a setlist and replace its ordered songs
router.patch('/:id', (req, res) => {
    const existingSetlist = db.prepare('SELECT id FROM setlists WHERE id = ?').get(req.params.id);
    if (!existingSetlist) {
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

    if (!validateSongIds(songIds)) {
        return res.status(400).json({ error: 'One or more songs could not be found' });
    }

    updateSetlist(req.params.id, name, songIds);

    const updatedSetlist = getSetlistById(req.params.id);
    res.json(updatedSetlist);
});

// DELETE /api/setlists/:id — Delete a setlist
router.delete('/:id', (req, res) => {
    const setlist = db.prepare('SELECT id FROM setlists WHERE id = ?').get(req.params.id);
    if (!setlist) {
        return res.status(404).json({ error: 'Setlist not found' });
    }

    db.prepare('DELETE FROM setlists WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

module.exports = router;
