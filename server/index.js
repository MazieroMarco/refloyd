const express = require('express');
const cors = require('cors');
const path = require('path');
const { syncAllCommentMentions } = require('./services/mentions');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/songs', require('./routes/songs'));
app.use('/api', require('./routes/comments'));
app.use('/api/members', require('./routes/members'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

syncAllCommentMentions();

app.listen(PORT, () => {
    console.log(`Re:Floyd server running on http://localhost:${PORT}`);
});
