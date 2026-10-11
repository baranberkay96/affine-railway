// Sets the Railway Bucket's CORS rule (S3 PutBucketCors, SigV4, no SDK).
//
// With S3 storage AFFiNE answers GET /api/workspaces/:id/blobs/:key with a
// redirect to a short-lived presigned Bucket URL, which the web app fetches
// with fetch(). Browsers only accept that cross-origin response if the Bucket
// sends CORS headers. Presigned URLs carry their own authorization, so the rule
// allows any origin (web, desktop and mobile clients) for GET/HEAD only.
// Best effort: a failure is logged and never blocks the deploy.
import { createHash, createHmac } from 'node:crypto';

const env = process.env;
const log = msg => console.log(`[railway] bucket CORS: ${msg}`);

if ((env.AFFINE_STORAGE || 'bucket').toLowerCase() !== 'bucket') process.exit(0);
if (/^(0|false|no|off)$/i.test(env.BUCKET_CORS_ENABLED || 'true')) {
  log('skipped (BUCKET_CORS_ENABLED=false)');
  process.exit(0);
}
for (const name of ['BUCKET_NAME', 'BUCKET_ENDPOINT', 'BUCKET_ACCESS_KEY_ID', 'BUCKET_SECRET_ACCESS_KEY']) {
  if (!env[name]) {
    log(`skipped (${name} not set)`);
    process.exit(0);
  }
}

const origins = (env.BUCKET_CORS_ORIGINS || '*').split(/[\s,]+/).filter(Boolean);
const body =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><CORSRule>' +
  origins.map(o => `<AllowedOrigin>${o}</AllowedOrigin>`).join('') +
  '<AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod>' +
  '<AllowedHeader>*</AllowedHeader>' +
  '<ExposeHeader>ETag</ExposeHeader><ExposeHeader>Content-Length</ExposeHeader>' +
  '<ExposeHeader>Content-Type</ExposeHeader><ExposeHeader>Content-Range</ExposeHeader>' +
  '<MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>';

const endpoint = new URL(env.BUCKET_ENDPOINT);
const pathStyle = /^(1|true|yes|on)$/i.test(env.BUCKET_FORCE_PATH_STYLE || '');
const host = pathStyle ? endpoint.host : `${env.BUCKET_NAME}.${endpoint.host}`;
const path = pathStyle ? `/${env.BUCKET_NAME}` : '/';
const url = `${endpoint.protocol}//${host}${path}?cors=`;
const region = env.BUCKET_REGION || 'auto';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

const now = new Date();
const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = amzDate.slice(0, 8);
const payloadHash = sha256(body);
const headers = {
  'content-md5': createHash('md5').update(body).digest('base64'),
  'content-type': 'application/xml',
  host,
  'x-amz-content-sha256': payloadHash,
  'x-amz-date': amzDate,
};
const names = Object.keys(headers).sort();
const signedHeaders = names.join(';');
const canonicalHeaders = names.map(k => `${k}:${headers[k]}\n`).join('');
const canonicalRequest = ['PUT', path, 'cors=', canonicalHeaders, signedHeaders, payloadHash].join('\n');
const scope = `${day}/${region}/s3/aws4_request`;
const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
let key = hmac(`AWS4${env.BUCKET_SECRET_ACCESS_KEY}`, day);
for (const part of [region, 's3', 'aws4_request']) key = hmac(key, part);
const signature = createHmac('sha256', key).update(stringToSign).digest('hex');

const { host: _host, ...sendHeaders } = headers;
try {
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...sendHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${env.BUCKET_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (res.ok) {
    log(`rule applied (origins: ${origins.join(', ')}; GET/HEAD)`);
  } else {
    log(`WARNING: PutBucketCors answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
} catch (err) {
  log(`WARNING: request failed: ${err.message}`);
}
