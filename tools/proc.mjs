// Run a child process hidden, with a deadline that stops its whole tree (Vite servers, test workers),
// not just the direct child. Only the PID this module started is ever stopped.
import { spawn, spawnSync } from 'node:child_process';

export function stopTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15_000, stdio: 'ignore' });
  else try { process.kill(-pid, 'SIGTERM'); } catch {} // children are spawned detached, so -pid is their whole process group
}

/** Resolves to the exit code, or to "timed out after Ns" when the deadline stopped the tree. */
export function runHidden(args, { cwd, timeout, env = process.env }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: 'inherit', detached: process.platform !== 'win32' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stopTree(child.pid); }, timeout);
    child.on('close', code => { clearTimeout(timer); resolve(timedOut ? `timed out after ${timeout / 1000}s` : code ?? 1); });
  });
}

/** Port 8765 belongs to the owner's own servers on this machine. */
export function assertAllowedPort(port) {
  if (Number(port) === 8765) throw new Error("Port 8765 is reserved for the owner's own servers. Pick another PORT.");
}

/** Like runHidden, but collects stdout and stderr. Resolves to { code, output }, where code is "timed out after Ns" on a deadline. */
export function runCaptured(args, { cwd, timeout, env = process.env }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { output += d; });
    const timer = setTimeout(() => { timedOut = true; stopTree(child.pid); }, timeout);
    child.on('close', code => { clearTimeout(timer); resolve({ code: timedOut ? `timed out after ${timeout / 1000}s` : code ?? 1, output }); });
  });
}

/**
 * The dev/preview port from the environment. Unset: 4317, and Vite may move to the next free port.
 * PORT=0: any free port. PORT=<n>: exactly that port. Anything else is an error, never a silent default.
 */
export function resolveDevPort(env = process.env) {
  const raw = env.PORT;
  if (raw === undefined || raw === '') return { port: 4317, strictPort: false };
  if (!/^\d+$/.test(raw) || Number(raw) > 65535) throw new Error(`PORT must be a whole number from 0 to 65535 (0 picks a free port); got "${raw}".`);
  const port = Number(raw);
  assertAllowedPort(port);
  return { port, strictPort: port !== 0 };
}
