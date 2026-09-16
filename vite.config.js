import { defineConfig } from 'vite';
import { collectComments } from './scripts/comments.mjs';

export default defineConfig({
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
