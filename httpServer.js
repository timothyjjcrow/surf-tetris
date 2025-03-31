const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// --- HTTP Server Setup (to serve static files) ---
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    // Serve index.html for the root path
    if (filePath === './') {
        filePath = './index.html';
    }

    // Prevent directory traversal
    const resolvedPath = path.resolve(__dirname, filePath);
    if (!resolvedPath.startsWith(__dirname)) {
        console.warn(`Attempted directory traversal: ${req.url}`);
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('403 Forbidden');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        // Add other common types if needed (images, fonts, etc.)
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(resolvedPath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // Log file not found errors
                console.log(`File not found: ${resolvedPath}`);
                // Optionally serve a custom 404 page
                fs.readFile(path.resolve(__dirname, './404.html'), (err404, content404) => {
                    if (err404) {
                         res.writeHead(404, { 'Content-Type': 'text/html' });
                         res.end('404 Not Found', 'utf-8');
                    } else {
                         res.writeHead(404, { 'Content-Type': 'text/html' });
                         res.end(content404, 'utf-8');
                    }
                });
            } else {
                // Server error (e.g., permission issues)
                console.error(`Server error reading file ${resolvedPath}: ${error.code}`);
                res.writeHead(500);
                res.end('500 Internal Server Error');
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

function startServer() {
    server.listen(PORT, () => {
        console.log(`HTTP server listening on port ${PORT}, serving static files.`);
    });
}

module.exports = {
    server, // Export the server instance for WebSocket attachment
    startServer // Export function to start listening
};
