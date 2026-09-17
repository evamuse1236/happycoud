import { project, TAN, smooth, mix, clamp } from './core.js';

/** Temporary WHOLE-COMMENT instances of the existing atlas, not a second word cloud.
 * The canonical layout and atlas are read-only. Batches are released after the handoff.
 * Both the repository's WebGL2 and Canvas compatibility renderer are supported. */
export class SourceBridge {
  constructor() { this.items = []; this.batches = []; this.renderer = null; }
  prepare(renderer, nodes, heroId) {
    this.dispose(); this.renderer = renderer; this.heroId = heroId;
    const atlas = new Map();
    if (renderer?.gl) for (const page of renderer.pages || []) page.nodes.forEach((n, index) => atlas.set(n.index, { page, index }));
    else for (const tile of renderer?.tiles || []) atlas.set(tile.node.index, { tile });
    this.items = nodes.flatMap(node => atlas.has(node.index) ? [{ node, texture: atlas.get(node.index), hero: node.comment.id === heroId }] : []);
    if (renderer?.gl) {
      const groups = new Map();
      for (const item of this.items) { const page = item.texture.page; if (!groups.has(page)) groups.set(page, []); groups.get(page).push(item); }
      for (const [page, items] of groups) {
        const array = new Float32Array(items.length * 16);
        items.forEach((item, i) => { array.set(page.array.subarray(item.texture.index * 16, item.texture.index * 16 + 16), i * 16); item.slot = i; array[i * 16 + 13] = -10000 - i; array[i * 16 + 15] = 1; });
        const batch = { ...renderer.createQuadBatch(array, 16, [[1, 3, 0], [2, 2, 3], [3, 4, 5], [4, 3, 9], [5, 4, 12]]), texture: page.texture, width: page.width, height: page.height, items };
        for (const item of items) item.batch = batch;
        this.batches.push(batch);
      }
    }
  }
  render(camera, { fade = 0, gather = 0, destination = null, dissolve = 0 } = {}) {
    const r = this.renderer; if (!r || r.lost) return;
    const width = innerWidth, height = innerHeight, ctx = r.ctx;
    if (ctx) { ctx.save(); ctx.setTransform(r.dpr || 1, 0, 0, r.dpr || 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
    for (const item of this.items) {
      const n = item.node, p = project(n, camera, width, height); if (!p) continue;
      const origin = { x: p.x, y: p.y, width: n.w * p.scale, height: n.h * p.scale };
      let rect = origin;
      if (item.hero && destination) {
        const e = smooth(gather);
        rect = { x: mix(origin.x, destination.x, e), y: mix(origin.y, destination.y, e) - Math.sin(Math.PI * e) * Math.min(44, height * .05), width: mix(origin.width, destination.width, e), height: mix(origin.height, destination.height, e) };
      }
      // The native renderer loses exactly this contribution during the initial dissolve.
      const alpha = clamp(fade * (n.luminosity ?? 1) * (item.hero ? 1 - dissolve : 1 - smooth(gather)));
      if (ctx && alpha > .001) { ctx.globalAlpha = alpha; ctx.drawImage(item.texture.tile.canvas, rect.x - rect.width / 2, rect.y - rect.height / 2, rect.width, rect.height); }
      else if (r.gl) {
        const k = item.slot * 16, array = item.batch.array, units = 2000 * TAN / height;
        array[k] = camera.x + (rect.x - width / 2) * units;
        array[k + 1] = camera.y - (rect.y - height / 2) * units;
        array[k + 2] = camera.z - 1000;
        array[k + 3] = rect.width * units; array[k + 4] = rect.height * units; array[k + 14] = alpha;
      }
    }
    if (ctx) { ctx.restore(); return; }
    if (!r.gl || !this.batches.length) return;
    const gl = r.gl, program = r.wordProgram; r.use(program, camera);
    for (const [name, value] of Object.entries({ uMood: 0, uMoodFrom: 0, uHover: -1, uSelected: -1, uDetailPass: 1, uMap: 0 })) gl.uniform1i(r.loc(program, name), value);
    for (const [name, value] of Object.entries({ uMoodBlend: 1, uReveal: 1, uReadMix: 0, uPerformanceMix: 0 })) gl.uniform1f(r.loc(program, name), value);
    gl.uniform4iv(r.loc(program, 'uDetailIds'), [-1, -1, -1, -1]); gl.activeTexture(gl.TEXTURE0); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const batch of this.batches) { gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.array); gl.bindTexture(gl.TEXTURE_2D, batch.texture); gl.uniform2f(r.loc(program, 'uTexel'), 1 / batch.width, 1 / batch.height); gl.bindVertexArray(batch.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.count); r.drawCalls++; }
    gl.bindVertexArray(null);
  }
  dispose() {
    const gl = this.renderer?.gl;
    if (gl && !this.renderer.lost) for (const b of this.batches) { gl.deleteBuffer(b.buffer); gl.deleteVertexArray(b.vao); }
    this.items = []; this.batches = []; this.renderer = null;
  }
}
