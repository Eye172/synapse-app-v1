/**
 * A static file server for the harness, with no dependencies.
 *
 * The MIME types matter here: a browser refuses an ES module served as
 * text/plain, and the MediaPipe runtime refuses a .wasm that does not arrive
 * as application/wasm. Getting either wrong fails as a blank page.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.argv[2] || 8099);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

/** Where the page drops rendered frames so they can be looked at as files. */
const SHOTS = path.join(__dirname, 'shots');

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);

    // The page can only hand a picture back as a data URL. This turns one
    // into a file, so what the pipeline actually drew can be opened and
    // compared rather than described.
    if (req.method === 'POST' && url === '/shot') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 64e6) req.destroy();
      });
      req.on('end', () => {
        try {
          const { name, data } = JSON.parse(body);
          const safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
          const b64 = String(data).replace(/^data:image\/\w+;base64,/, '');
          fs.mkdirSync(SHOTS, { recursive: true });
          fs.writeFileSync(path.join(SHOTS, safe), Buffer.from(b64, 'base64'));
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(
            JSON.stringify({ ok: true, file: safe }),
          );
        } catch (e) {
          res.writeHead(400).end(String(e && e.message));
        }
      });
      return;
    }

    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    // never serve outside the harness
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        console.log('404', rel);
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        // the pose runtime wants these for its threaded build
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log('harness on http://localhost:' + PORT));
