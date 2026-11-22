// Minimal dependency-free static server for the Phase 3 ERP shell.
// The production shell will be bundled into the main deployment in Phase 12.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
const port = Number(process.env.ERP_PORT || 5174)

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const file = path.join(root, requested === '/' ? 'index.html' : requested)
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root, 'index.html')
  fs.readFile(target, (error, content) => {
    if (error) {
      res.writeHead(500).end('Unable to load ERP shell')
      return
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' })
    res.end(content)
  })
}).listen(port, () => console.log(`Comet ERP shell at http://localhost:${port}`))
