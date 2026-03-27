require('./load-env');
const cors = require('cors');
const express = require('express');
const path = require('path');
const { initDatabase } = require('./db');
const { syncAllCommentMentions } = require('./services/mentions');
const { requireAuth } = require('./middleware/require-auth');
const { getAppOrigin, getRedirectUri, isEnabled } = require('./services/oidc');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    credentials: true,
    origin(origin, callback) {
        if (!origin || origin === getAppOrigin()) {
            return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));

// Serve uploaded images only to authenticated sessions.
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/songs', requireAuth, require('./routes/songs'));
app.use('/api/setlists', requireAuth, require('./routes/setlists'));
app.use('/api/members', requireAuth, require('./routes/members'));
app.use('/api', requireAuth, require('./routes/comments'));

app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) {
        return next(err);
    }

    res.status(500).json({ error: 'Internal server error' });
});

async function start() {
    await initDatabase();
    await syncAllCommentMentions();

    app.listen(PORT, () => {
        console.log(`Re:Floyd server running on http://localhost:${PORT}`);
        if (isEnabled()) {
            console.log(`OIDC access control enabled. Register this callback URL: ${getRedirectUri()}`);
        }
    });
}

start().catch((err) => {
    console.error('Failed to start Re:Floyd server', err);
    process.exit(1);
});
