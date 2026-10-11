// Waits until Postgres, Redis and (if enabled) the Manticore indexer accept
// connections. Services start in parallel on Railway; the pre-deploy migration
// must not fail just because a dependency is still booting.
import { connect } from 'node:net';

const env = process.env;
const timeoutMs = Number(env.WAIT_TIMEOUT_SECONDS || 900) * 1000;
const started = Date.now();
const log = msg => console.log(`[railway] ${msg}`);

function tcpCheck(host, port) {
  return new Promise(resolve => {
    const socket = connect({ host, port, timeout: 5000 });
    const done = ok => {
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitFor(name, host, port, required) {
  while (true) {
    if (await tcpCheck(host, port)) {
      log(`${name} reachable at ${host}:${port}`);
      return true;
    }
    if (Date.now() - started > timeoutMs) {
      const msg = `${name} not reachable at ${host}:${port} after ${timeoutMs / 1000}s`;
      if (required) {
        console.error(`[railway] ERROR: ${msg}`);
        process.exit(1);
      }
      log(`WARNING: ${msg}; continuing`);
      return false;
    }
    log(`waiting for ${name} (${host}:${port})`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

const db = new URL(env.DATABASE_URL || 'postgresql://localhost:5432/affine');
await waitFor('Postgres', db.hostname.replace(/^\[|\]$/g, ''), Number(db.port || 5432), true);
await waitFor('Redis', env.REDIS_SERVER_HOST || 'localhost', Number(env.REDIS_SERVER_PORT || 6379), true);
if (/^(1|true|yes|on)$/i.test(env.AFFINE_INDEXER_ENABLED || '')) {
  const indexer = new URL(env.AFFINE_INDEXER_SEARCH_ENDPOINT || 'http://localhost:9308');
  await waitFor('Indexer', indexer.hostname.replace(/^\[|\]$/g, ''), Number(indexer.port || 80), false);
}
