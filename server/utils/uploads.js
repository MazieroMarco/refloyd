const fs = require('fs');
const os = require('os');
const path = require('path');

function getUploadsDir() {
    const configuredDir = (process.env.UPLOADS_DIR || '').trim();
    if (configuredDir) {
        return configuredDir;
    }

    if (isEphemeralRuntime()) {
        return path.join(os.tmpdir(), 'refloyd-uploads');
    }

    return path.join(__dirname, '..', 'uploads');
}

function ensureUploadsDir() {
    const uploadsDir = getUploadsDir();
    fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function buildUploadUrl(fileName) {
    return `/uploads/${fileName}`;
}

function resolveStoredUploadPath(relativePath) {
    if (!relativePath) {
        return '';
    }

    return path.join(getUploadsDir(), path.basename(relativePath));
}

function isEphemeralRuntime() {
    return Boolean(
        process.env.K_SERVICE
        || process.env.FUNCTION_TARGET
        || process.env.FUNCTIONS_EMULATOR
        || process.env.X_GOOGLE_FUNCTION_NAME
    );
}

module.exports = {
    buildUploadUrl,
    ensureUploadsDir,
    getUploadsDir,
    resolveStoredUploadPath,
};
