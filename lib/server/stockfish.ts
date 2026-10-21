// Server-side Stockfish (stockfish.js WASM). The npm package ships a
// Worker-style build that talks through postMessage/onmessage, which don't
// exist under Node, so we install shims before requiring it. One engine
// instance, commands serialized — Next runs one server process here.

import { createRequire } from "module";
import fs from "fs";
import path from "path";

type Waiter = { until: (line: string) => boolean; resolve: (lines: string[]) => void; buf: string[] };

let booting: Promise<void> | null = null;
let waiters: Waiter[] = [];

function send(cmd: string) {
  (globalThis as unknown as { onmessage: (e: { data: string }) => void }).onmessage({ data: cmd });
}

function install() {
  const req = createRequire(path.join(process.cwd(), "package.json"));
  const dir = path.dirname(req.resolve("stockfish.js/package.json"));
  const realFetch = (globalThis as { fetch?: typeof fetch }).fetch?.bind(globalThis);
  (globalThis as { fetch?: typeof fetch }).fetch = ((u: string | URL | Request, ...rest: unknown[]) => {
    if (typeof u === "string" && u.startsWith("stockfish")) {
      const data = fs.readFileSync(path.join(dir, u));
      return Promise.resolve(new Response(data, { headers: { "Content-Type": "application/wasm" } }));
    }
    if (realFetch) return realFetch(u as RequestInfo, ...rest as []) as Promise<Response>;
    return Promise.reject(new Error("no fetch for " + u));
  }) as typeof fetch;
  (globalThis as unknown as { postMessage: (m: unknown) => void }).postMessage = (m) => {
    const line = String(m);
    for (const w of [...waiters]) {
      w.buf.push(line);
      if (w.until(line)) {
        waiters = waiters.filter((x) => x !== w);
        w.resolve(w.buf);
      }
    }
  };
  req("stockfish.js/stockfish.wasm.js"); // defines globalThis.onmessage
}

export function ensureEngine(): Promise<void> {
  if (!booting)
    booting = new Promise((resolve, reject) => {
      try {
        install();
      } catch (e) {
        reject(e);
        return;
      }
      const t = setInterval(() => {
        if (waiters.length === 0) return; // engine not asked yet
      }, 500);
      new Promise<string[]>((res) => waiters.push({ until: (l) => l.includes("uciok"), resolve: res, buf: [] }))
        .then(() => {
          clearInterval(t);
          resolve();
        })
        .catch(reject);
      setTimeout(() => reject(new Error("stockfish boot timeout")), 25000);
      try {
        send("uci");
      } catch (e) {
        reject(e);
      }
    });
  return booting;
}

async function ask(cmd: string, until: (l: string) => boolean): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    waiters.push({ until, resolve, buf: [] });
    send(cmd);
  });
}

// serialize engine commands — one `go` at a time
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

export type EngineEval = { bestmove: string; cp: number | null; mate: number | null };

/** Evaluate a position (side-to-move perspective) and get the best move. */
export function sfGo(fen: string, opts: { skill?: number; uciElo?: number; movetimeMs: number }): Promise<EngineEval> {
  return serial(async () => {
    await ensureEngine();
    if (opts.uciElo != null) {
      send("setoption name UCI_LimitStrength value true");
      send(`setoption name UCI_Elo value ${opts.uciElo}`);
    } else {
      send("setoption name UCI_LimitStrength value false");
      send(`setoption name Skill Level value ${Math.max(0, Math.min(20, opts.skill ?? 20))}`);
    }
    send(`position fen ${fen}`);
    const lines = await ask(`go movetime ${opts.movetimeMs}`, (l) => l.startsWith("bestmove"));
    const ev: EngineEval = { bestmove: "", cp: null, mate: null };
    for (const l of lines) {
      const bm = /^bestmove (\S+)/.exec(l);
      if (bm) ev.bestmove = bm[1];
      const cp = /score cp (-?\d+)/.exec(l);
      if (cp) ev.cp = Number(cp[1]);
      const mate = /score mate (-?\d+)/.exec(l);
      if (mate) ev.mate = Number(mate[1]);
    }
    return ev;
  });
}
