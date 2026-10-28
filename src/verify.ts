import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookPayload } from './types.js';

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface VerifyWebhookOptions {
  /** The raw request body, exactly as received. Don't parse and re-serialise it first. */
  payload: string | Buffer;
  /** The request headers: a `Headers` object or a plain object such as `req.headers`. */
  headers: Headers | Record<string, string | string[] | undefined>;
  /** The endpoint's signing secret (`whsec_...`). */
  secret: string;
  /** Reject requests signed longer ago than this, to stop replays. Default 300 seconds. */
  toleranceSeconds?: number;
}

function header(headers: VerifyWebhookOptions['headers'], name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function')
    return (headers as Headers).get(name) ?? undefined;
  const record = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(record).find((k) => k.toLowerCase() === name);
  const value = key === undefined ? undefined : record[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Check that a webhook request really came from Vaartix and return its parsed body.
 * Throws `WebhookVerificationError` if the signature or timestamp is wrong.
 *
 * Follows the Standard Webhooks spec, so any Standard Webhooks library works too.
 */
export function verifyWebhook(options: VerifyWebhookOptions): WebhookPayload {
  const id = header(options.headers, 'webhook-id');
  const timestamp = header(options.headers, 'webhook-timestamp');
  const signatures = header(options.headers, 'webhook-signature');
  if (!id || !timestamp || !signatures) {
    throw new WebhookVerificationError(
      'Missing webhook-id, webhook-timestamp or webhook-signature header.',
    );
  }

  const sentAt = Number(timestamp);
  const tolerance = options.toleranceSeconds ?? 300;
  if (!Number.isInteger(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > tolerance) {
    throw new WebhookVerificationError('The webhook timestamp is too old or in the future.');
  }

  if (!options.secret.startsWith('whsec_')) {
    throw new WebhookVerificationError('The secret should start with whsec_.');
  }
  const body =
    typeof options.payload === 'string' ? options.payload : options.payload.toString('utf8');
  const key = Buffer.from(options.secret.slice('whsec_'.length), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();

  // The header can hold several space-separated signatures, e.g. while a secret is rotated.
  const valid = signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!valid) throw new WebhookVerificationError('The webhook signature does not match.');

  return JSON.parse(body) as WebhookPayload;
}
