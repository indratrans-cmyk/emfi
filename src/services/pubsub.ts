import type { ServerWebSocket } from "bun";

type WsData = { wallet: string };

const subs = new Map<string, Set<ServerWebSocket<WsData>>>();

export function subscribe(ws: ServerWebSocket<WsData>, wallet: string): void {
  if (!subs.has(wallet)) subs.set(wallet, new Set());
  subs.get(wallet)!.add(ws);
}

export function unsubscribe(ws: ServerWebSocket<WsData>): void {
  const wallet = ws.data?.wallet;
  if (!wallet) return;
  subs.get(wallet)?.delete(ws);
  if (subs.get(wallet)?.size === 0) subs.delete(wallet);
}

export function broadcast(wallet: string, payload: unknown): void {
  const clients = subs.get(wallet);
  if (!clients || clients.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    try { ws.send(msg); } catch { clients.delete(ws); }
  }
}

export function connectedCount(): number {
  let n = 0;
  for (const set of subs.values()) n += set.size;
  return n;
}
