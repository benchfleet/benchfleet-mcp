#!/usr/bin/env node
/**
 * benchfleet-mcp: lets an MCP client (Claude Code, Codex, Cursor, Claude Desktop…) use the Android phones of the
 * BenchFleet app running on this computer. A port of the app's own stdio bridge (`controlhub mcp`,
 * core/src/controlhub/mcp/bridge.py) with no dependencies: every MCP message is forwarded to the app's endpoint
 * (http://127.0.0.1:<port>/mcp) with the client's token, so the tools, the permissions, the approvals and the audit
 * log all stay in the app. It reaches nothing but this computer.
 *
 * Token: BENCHFLEET_TOKEN (or CONTROLHUB_TOKEN), from Settings → AI clients → Connect an AI client in the app.
 * The app's address is read from its data folder (`run/core.json`, written when it starts), unless BENCHFLEET_URL
 * names it.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const NOT_RUNNING = 'BenchFleet is not running on this computer: start the app, then try again.';
const TIMEOUT_MS = 330_000; // the longest tool call waits 120 s for a workflow, plus the app's own limits
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The app's data folder, resolved exactly as the app resolves it (core/src/controlhub/config/paths.py). */
export function dataDir(env = process.env, platform = process.platform, home = homedir()) {
  const override = env.CONTROLHUB_HOME?.trim();
  if (override) return override;
  if (platform === 'win32') return join(env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local'), 'ControlHub');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'ControlHub');
  return join(env.XDG_DATA_HOME?.trim() || join(home, '.local', 'share'), 'controlhub');
}

/** The app's address: BENCHFLEET_URL / CONTROLHUB_URL, else what the running app wrote; null when not running. */
export function coreUrl(env = process.env, readFile = (f) => readFileSync(f, 'utf8')) {
  const explicit = (env.BENCHFLEET_URL || env.CONTROLHUB_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  try {
    const url = JSON.parse(readFile(join(dataDir(env), 'run', 'core.json'))).url;
    return typeof url === 'string' ? url.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** Only this computer: the bridge must never send the token or the messages anywhere else. */
export function isLoopback(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOOPBACK.has(u.hostname);
  } catch {
    return false;
  }
}

export function errorReply(id, message, code = -32000) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** The JSON-RPC messages in an answer: plain JSON, or the `data:` lines of an event stream. */
export function replies(contentType, body) {
  if (contentType.includes('text/event-stream')) {
    const out = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        out.push(JSON.parse(line.slice(5).trim()));
      } catch {
        // not JSON: skipped
      }
    }
    return out;
  }
  try {
    return [JSON.parse(body)];
  } catch {
    return [];
  }
}

function refusal(body, status) {
  try {
    const detail = JSON.parse(body).detail;
    if (typeof detail === 'string' && detail) return `BenchFleet refused: ${detail}`;
  } catch {
    // not JSON
  }
  return `BenchFleet refused the request (HTTP ${status})`;
}

/** Forwards one line from the client; writes the answers with `emit`. `state.protocol` follows the session. */
export async function forward(line, { token, env = process.env, emit, state = {}, fetchImpl = fetch }) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    emit(errorReply(null, 'not JSON', -32700));
    return;
  }
  const isRequest = message && typeof message === 'object' && 'method' in message && 'id' in message;
  const id = message?.id;
  const url = coreUrl(env);
  if (!url) {
    if (isRequest) emit(errorReply(id, NOT_RUNNING));
    return;
  }
  if (!isLoopback(url)) {
    if (isRequest) emit(errorReply(id, `refused: ${url} is not this computer`));
    return;
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (state.protocol) headers['MCP-Protocol-Version'] = state.protocol;
  let res;
  try {
    res = await fetchImpl(`${url}/mcp`, { method: 'POST', headers, body: line, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    if (isRequest) emit(errorReply(id, NOT_RUNNING));
    return;
  }
  const body = await res.text();
  if (res.status === 401) {
    if (isRequest) emit(errorReply(id, 'BenchFleet does not accept this token (revoked?): connect the client again in the app'));
    return;
  }
  if (res.status === 202 || !body) return; // a notification was accepted
  const answers = replies(res.headers.get('content-type') ?? '', body).filter((r) => r && r.jsonrpc === '2.0');
  if (res.status >= 400 && !answers.length) {
    if (isRequest) emit(errorReply(id, refusal(body, res.status)));
    return;
  }
  for (const answer of answers) {
    const version = answer.result?.protocolVersion;
    if (typeof version === 'string') state.protocol = version; // sent with every later request, as the spec asks
    emit(answer);
  }
}

export async function main(env = process.env) {
  const token = (env.BENCHFLEET_TOKEN || env.CONTROLHUB_TOKEN || '').trim();
  if (!token) {
    process.stderr.write(
      'benchfleet-mcp: set BENCHFLEET_TOKEN to the token from BenchFleet → Settings → AI clients → Connect an AI client\n',
    );
    return 2;
  }
  const emit = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
  const state = {};
  const pending = new Set();
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const task = forward(line, { token, env, emit, state }).finally(() => pending.delete(task));
      pending.add(task); // a long tool call does not hold up the others
    }
  }
  if (buffer.trim()) await forward(buffer.trim(), { token, env, emit, state });
  await Promise.allSettled(pending);
  return 0;
}
