// A* em grade com 8 direções (sem cortar quinas). A grade tem 64x52 células.
export function findPath(grid: Uint8Array, w: number, h: number, sx: number, sy: number, tx: number, ty: number, maxNodes = 4000): [number, number][] | null {
  if (sx === tx && sy === ty) return [];
  if (!grid[ty * w + tx]) return null;
  const N = w * h;
  const g = new Float32Array(N).fill(Infinity);
  const f = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: number[] = [];
  const start = sy * w + sx, goal = ty * w + tx;
  const hfn = (i: number) => { const dx = Math.abs((i % w) - tx), dy = Math.abs(((i / w) | 0) - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  g[start] = 0; f[start] = hfn(start); open.push(start);
  let visited = 0;
  while (open.length && visited++ < maxNodes) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) {
      const out: [number, number][] = [];
      for (let c = cur; c !== start; c = from[c]) out.push([c % w, (c / w) | 0]);
      return out.reverse();
    }
    closed[cur] = 1;
    const cx = cur % w, cy = (cur / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!grid[ni] || closed[ni]) continue;
      if (dx && dy && (!grid[cy * w + nx] || !grid[ny * w + cx])) continue;
      const ng = g[cur] + (dx && dy ? 1.41 : 1);
      if (ng < g[ni]) {
        if (g[ni] === Infinity) open.push(ni);
        g[ni] = ng; f[ni] = ng + hfn(ni); from[ni] = cur;
      }
    }
  }
  return null;
}
