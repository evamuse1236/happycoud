import { defineConfig } from 'vite';
import { collectComments } from './scripts/comments.mjs';
import { resolveDevPort, assertAllowedPort } from './tools/proc.mjs';

// PORT=<n> pins the port (strict); PORT=0 picks a free one. Without PORT, Vite starts at 4317 and moves on if it is taken.
const listen = { host: '127.0.0.1', ...resolveDevPort() };

export default defineConfig({
  server: listen,
  preview: listen,
  optimizeDeps: { entries: ['index.html'] },
  plugins:[{
    // `vite --port 8765` and `vite preview --port 8765` merge over the config, so check the final values.
    name:'refuse-reserved-port',
    configResolved(config) { assertAllowedPort(config.server.port); assertAllowedPort(config.preview.port); }
  },{
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
