const fs = require('fs');
const path = require('path');

const initialEnvironmentKeys = new Set(Object.keys(process.env));
const candidateFiles = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '.env'),
];

candidateFiles.forEach((filePath) => {
    loadEnvFile(filePath);
});

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return;
        }

        const normalizedLine = trimmedLine.startsWith('export ')
            ? trimmedLine.slice(7).trim()
            : trimmedLine;
        const separatorIndex = normalizedLine.indexOf('=');
        if (separatorIndex === -1) {
            return;
        }

        const key = normalizedLine.slice(0, separatorIndex).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || initialEnvironmentKeys.has(key)) {
            return;
        }

        const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
        process.env[key] = parseValue(rawValue);
    });
}

function parseValue(rawValue) {
    if (!rawValue) {
        return '';
    }

    if (
        (rawValue.startsWith('"') && rawValue.endsWith('"'))
        || (rawValue.startsWith('\'') && rawValue.endsWith('\''))
    ) {
        const quote = rawValue[0];
        const unquoted = rawValue.slice(1, -1);
        if (quote === '"') {
            return unquoted
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t');
        }
        return unquoted;
    }

    return rawValue;
}
