import { defineConfig } from 'vite';
import { collectComments } from './scripts/comments.mjs';

// PORT pins the port (strict). Without it Vite starts at 4317 and moves to the next free port.
const port = Number(process.env.PORT) || 4317;
if (port === 8765) throw new Error("Port 8765 is reserved for the owner's own servers. Pick another PORT.");
const listen = { host: '127.0.0.1', port, strictPort: Boolean(process.env.PORT) };

export default defineConfig({
  server: listen,
  preview: listen,
  optimizeDeps: { entries: ['index.html'] },
  plugins:[{
    name:'live-local-comments',
    configureServer(server) {
      server.middlewares.use('/api/comments',async (_req,res)=>{
        try {
          res.setHeader('Content-Type','application/json; charset=utf-8');
          res.setHeader('Cache-Control','no-store');
          res.end(JSON.stringify(await collectComments()));
        } catch { res.statusCode=500;res.end(JSON.stringify({error:'The comments could not be read.'})); }
      });
    }
  }],
  build:{chunkSizeWarningLimit:650}
});
