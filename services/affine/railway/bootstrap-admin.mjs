// Creates the first AFFiNE administrator through AFFiNE's own setup endpoint
// (POST /api/setup/create-admin-user, only accepted while no user exists), so
// a fresh public domain is never left on the "create admin" page.
// Runs in the background next to the server; never stops the server.
const env = process.env;
const email = (env.AFFINE_ADMIN_EMAIL || '').trim();
const password = env.AFFINE_ADMIN_PASSWORD || '';
const port = env.AFFINE_SERVER_PORT || env.PORT || '3010';
const base = `http://127.0.0.1:${port}`;
const log = msg => console.log(`[railway] admin bootstrap: ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!email || !password) {
  log('AFFINE_ADMIN_EMAIL/AFFINE_ADMIN_PASSWORD not set; open the site to create the admin account');
  process.exit(0);
}

const deadline = Date.now() + 15 * 60 * 1000;
while (Date.now() < deadline) {
  try {
    const info = await fetch(`${base}/info`);
    if (info.ok) break;
  } catch {
    // server not listening yet
  }
  await sleep(3000);
}

try {
  const res = await fetch(`${base}/api/setup/create-admin-user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: env.AFFINE_ADMIN_NAME || 'Admin', email, password }),
  });
  const text = await res.text();
  if (res.ok) {
    log(`created administrator ${email}`);
  } else if (/already created|ACTION_FORBIDDEN/i.test(text)) {
    log('administrator already exists; nothing to do');
  } else {
    log(`setup endpoint answered ${res.status}: ${text.slice(0, 300)}`);
  }
} catch (err) {
  log(`could not reach the server: ${err.message}`);
}
