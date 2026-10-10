// Run a child process hidden, with a deadline that stops its whole tree (Vite servers, test workers),
// not just the direct child. Only the PID this module started is ever stopped.
import { spawn, spawnSync } from 'node:child_process';

export function stopTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15_000, stdio: 'ignore' });
  else try { process.kill(pid, 'SIGTERM'); } catch {}
}

/** Resolves to the exit code, or to "timed out after Ns" when the deadline stopped the tree. */
export function runHidden(args, { cwd, timeout, env = process.env }) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; stopTree(child.pid); }, timeout);
    child.on('close', code => { clearTimeout(timer); resolve(timedOut ? `timed out after ${timeout / 1000}s` : code ?? 1); });
  });
}

/** Port 8765 belongs to the owner's own servers on this machine. */
export function assertAllowedPort(port) {
  if (Number(port) === 8765) throw new Error("Port 8765 is reserved for the owner's own servers. Pick another PORT.");
}
