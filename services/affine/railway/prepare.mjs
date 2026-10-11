// Writes AFFiNE's runtime configuration from Railway variables.
//
//  - ~/.affine/config/private.key : P-256 server key derived from
//    AFFINE_PRIVATE_KEY_SEED, so every container (and every redeploy) uses the
//    same key without a volume. AFFiNE signs tokens and encrypts stored secrets
//    with it. Skipped when AFFINE_PRIVATE_KEY is set directly.
//  - ~/.affine/config/config.json : blob storage (Railway Bucket), Redis client
//    options, AI/BYOK and sign-up defaults. Values saved later in the admin
//    panel (/admin/settings) are stored in Postgres and take precedence.
import { createECDH, createHash, createPrivateKey } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.affine', 'config');
const env = process.env;

const log = msg => console.log(`[railway] ${msg}`);
const fail = msg => {
  console.error(`[railway] ERROR: ${msg}`);
  process.exit(1);
};
const bool = (value, fallback) =>
  value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(value);

// P-256 group order.
const P256_N = BigInt(
  '0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'
);
const b64url = buf => Buffer.from(buf).toString('base64url');

function derivePrivateKey(seed) {
  const digest = createHash('sha256').update(`affine-railway-server-key:${seed}`).digest('hex');
  const scalar = (BigInt(`0x${digest}`) % (P256_N - 1n)) + 1n;
  const d = Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 0x04 || X || Y
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: b64url(d),
    x: b64url(pub.subarray(1, 33)),
    y: b64url(pub.subarray(33, 65)),
  };
  return createPrivateKey({ key: jwk, format: 'jwk' })
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
}

function bucketStorage() {
  return {
    provider: 'aws-s3',
    bucket: env.BUCKET_NAME,
    config: {
      endpoint: env.BUCKET_ENDPOINT,
      region: env.BUCKET_REGION || 'auto',
      forcePathStyle: bool(env.BUCKET_FORCE_PATH_STYLE, false),
      credentials: {
        accessKeyId: env.BUCKET_ACCESS_KEY_ID,
        secretAccessKey: env.BUCKET_SECRET_ACCESS_KEY,
      },
    },
  };
}

function buildConfig() {
  const config = {
    $schema: 'https://github.com/toeverything/affine/releases/latest/download/config.schema.json',
    server: {
      name: env.AFFINE_SERVER_NAME || 'AFFiNE',
    },
    // ioredis resolves IPv4 only by default; family 0 also accepts IPv6
    // (Railway's private network is IPv6-only in older environments).
    redis: { ioredis: { family: 0 } },
    auth: { allowSignup: bool(env.AFFINE_ALLOW_SIGNUP, false) },
    flags: { allowGuestDemoWorkspace: bool(env.AFFINE_ALLOW_GUEST_DEMO, false) },
    copilot: {
      enabled: bool(env.AFFINE_COPILOT_ENABLED, true),
      byok: { enabled: true, allowCustomEndpoint: true },
    },
  };

  const storageMode = (env.AFFINE_STORAGE || 'bucket').toLowerCase();
  if (storageMode === 'bucket') {
    for (const name of ['BUCKET_NAME', 'BUCKET_ENDPOINT', 'BUCKET_ACCESS_KEY_ID', 'BUCKET_SECRET_ACCESS_KEY']) {
      if (!env[name]) fail(`AFFINE_STORAGE=bucket needs ${name}`);
    }
    // Workspace blobs (<workspaceId>/<key>) and AI files (<userId>/<workspaceId>/<key>)
    // share the Bucket; their keys cannot collide. Avatars stay on the local
    // filesystem (the service volume): AFFiNE serves /api/avatars/ only for fs
    // storage and would otherwise link to the private Bucket directly.
    config.storages = { 'blob.storage': bucketStorage() };
    config.copilot.storage = bucketStorage();
    log(`storage: Railway Bucket ${env.BUCKET_NAME} (workspace blobs, AI files); avatars on the volume`);
  } else if (storageMode === 'fs') {
    log('storage: local filesystem ~/.affine/storage (add a volume at /root/.affine/storage)');
  } else {
    fail(`AFFINE_STORAGE must be 'bucket' or 'fs' (got '${storageMode}')`);
  }
  return config;
}

mkdirSync(CONFIG_DIR, { recursive: true });

if (env.AFFINE_PRIVATE_KEY) {
  log('server key: AFFINE_PRIVATE_KEY');
} else if (env.AFFINE_PRIVATE_KEY_SEED) {
  if (env.AFFINE_PRIVATE_KEY_SEED.length < 32) fail('AFFINE_PRIVATE_KEY_SEED must be at least 32 characters');
  writeFileSync(join(CONFIG_DIR, 'private.key'), derivePrivateKey(env.AFFINE_PRIVATE_KEY_SEED), { mode: 0o600 });
  log('server key: derived from AFFINE_PRIVATE_KEY_SEED');
} else {
  fail('set AFFINE_PRIVATE_KEY_SEED (or AFFINE_PRIVATE_KEY); without a stable key every restart logs users out');
}

writeFileSync(join(CONFIG_DIR, 'config.json'), `${JSON.stringify(buildConfig(), null, 2)}\n`, { mode: 0o600 });
log(`wrote ${join(CONFIG_DIR, 'config.json')}`);
