import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vaartix } from './client.js';
import type { WebhookPayload } from './types.js';
import { verifyWebhook, WebhookVerificationError } from './verify.js';

// The Standard Webhooks reference example.
// Test-only secrets. The prefix is kept separate so secret scanners don't mistake them for real ones.
const PREFIX = 'whsec_';
// The example secret from the Standard Webhooks specification.
const secret = `${PREFIX}MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`;
const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const timestamp = 1614265330;
const payload = '{"test": 2432232314}';
const signature = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

const headers = (sig = signature, ts = timestamp) => ({
  'webhook-id': id,
  'webhook-timestamp': String(ts),
  'webhook-signature': sig,
});

describe('verifyWebhook', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts the reference example and returns the parsed body', () => {
    vi.useFakeTimers({ now: timestamp * 1000 + 10_000 });
    expect(verifyWebhook({ payload, headers: headers(), secret })).toEqual({ test: 2432232314 });
    // Headers objects and Buffers work too, and any one of several signatures may match.
    expect(
      verifyWebhook({
        payload: Buffer.from(payload),
        headers: new Headers(headers(`v1,bm90LXRoaXM= ${signature}`)),
        secret,
      }),
    ).toEqual({ test: 2432232314 });
  });

  it('rejects a changed body, a wrong secret or a stale timestamp', () => {
    vi.useFakeTimers({ now: timestamp * 1000 });
    expect(() => verifyWebhook({ payload: '{"test": 1}', headers: headers(), secret })).toThrow(
      WebhookVerificationError,
    );
    expect(() =>
      verifyWebhook({ payload, headers: headers(), secret: `${PREFIX}c2VjcmV0c2VjcmV0c2VjcmV0` }),
    ).toThrow(/does not match/);
    vi.setSystemTime(timestamp * 1000 + 301_000);
    expect(() => verifyWebhook({ payload, headers: headers(), secret })).toThrow(/too old/);
    expect(() => verifyWebhook({ payload, headers: {}, secret })).toThrow(/Missing/);
  });

  it('verifies a freshly signed request', () => {
    const now = Math.floor(Date.now() / 1000);
    const key = Buffer.from(secret.slice(6), 'base64');
    const body = JSON.stringify({
      type: 'email.delivered',
      createdAt: new Date().toISOString(),
      data: {},
    });
    const sig = `v1,${createHmac('sha256', key).update(`whd_1.${now}.${body}`).digest('base64')}`;
    const vaartix = new Vaartix('vx_test');
    const event = vaartix.webhooks.verify({
      payload: body,
      headers: {
        'Webhook-Id': 'whd_1',
        'Webhook-Timestamp': String(now),
        'Webhook-Signature': sig,
      },
      secret,
    });
    expect(event.type).toBe('email.delivered');
  });
});

describe('webhooks API', () => {
  it('creates an endpoint and lists deliveries', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: 'wh_1', secret: 'whsec_x' }), { status: 201 }),
    );
    const vaartix = new Vaartix('vx_test', { fetch, baseUrl: 'https://api.example.test' });
    const created = await vaartix.webhooks.create({
      url: 'https://acme.in/hooks',
      events: ['email.bounced'],
    });
    expect(created.data?.secret).toBe('whsec_x');
    await vaartix.webhooks.deliveries('wh_1', { limit: 10 });
    await vaartix.webhooks.retryDelivery('wh_1', 'whd_9');
    const urls = (fetch.mock.calls as unknown as [string, RequestInit][]).map(
      ([url, init]) => `${init.method} ${url}`,
    );
    expect(urls).toEqual([
      'POST https://api.example.test/webhooks',
      'GET https://api.example.test/webhooks/wh_1/deliveries?limit=10',
      'POST https://api.example.test/webhooks/wh_1/deliveries/whd_9/retry',
    ]);
  });
});

describe('open and click events', () => {
  afterEach(() => vi.useRealTimers());

  it('returns a typed email.clicked payload that narrows on type', () => {
    const body = JSON.stringify({
      type: 'email.clicked',
      createdAt: '2026-10-28T10:05:41.000Z',
      data: {
        emailId: 'em_7hq2kv9xr4m1c8d3',
        eventId: 'evt_5k2m8q1v7c3x9d4p',
        recipient: 'rahul@example.in',
        from: 'Acme <orders@acme.in>',
        to: ['rahul@example.in'],
        cc: [],
        bcc: [],
        subject: 'Your order has shipped',
        tags: [{ name: 'flow', value: 'shipping' }],
        emailCreatedAt: '2026-10-28T10:00:00.000Z',
        details: {
          machine: false,
          machineReason: null,
          linkIndex: 0,
          link: 'https://acme.in/orders/123',
          userAgentFamily: 'Chrome',
          country: 'IN',
          asn: 24560,
        },
      },
    });
    const sig = createHmac('sha256', Buffer.from(secret.slice(PREFIX.length), 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64');
    vi.useFakeTimers({ now: timestamp * 1000 });

    const event = verifyWebhook({ payload: body, headers: headers(`v1,${sig}`), secret });
    if (event.type !== 'email.clicked') throw new Error('expected email.clicked');
    // Type-checked: after narrowing, these fields have their real types.
    const link: string = event.data.details.link;
    const linkIndex: number = event.data.details.linkIndex;
    const reason: 'scanner' | 'scanner_network' | 'too_fast' | 'burst' | null =
      event.data.details.machineReason;
    expect({ link, linkIndex, reason, machine: event.data.details.machine }).toEqual({
      link: 'https://acme.in/orders/123',
      linkIndex: 0,
      reason: null,
      machine: false,
    });
  });
});

describe('delay and bounce details', () => {
  it('narrows email.delivery_delayed and email.bounced details', () => {
    const delayed = {
      type: 'email.delivery_delayed',
      data: {
        details: {
          delayType: 'TransientCommunicationFailure',
          diagnosticCode: '421 4.7.0 [TSS04] Messages from 1.2.3.4 temporarily deferred',
          statusCode: '4.7.0',
          expirationTime: '2026-11-15T10:00:00.000Z',
        },
      },
    } as unknown as WebhookPayload;
    const bounced = {
      type: 'email.bounced',
      data: {
        details: {
          bounceType: 'Permanent',
          bounceSubType: 'General',
          diagnostics: [],
          diagnosticCode: '550 5.1.1 user unknown',
          statusCode: '5.1.1',
        },
      },
    } as unknown as WebhookPayload;
    const reasons: (string | undefined)[] = [];
    for (const event of [delayed, bounced]) {
      if (event.type === 'email.delivery_delayed') {
        const d = event.data.details;
        reasons.push('bounceType' in d ? `soft bounce: ${d.diagnosticCode}` : d.diagnosticCode);
      } else if (event.type === 'email.bounced') {
        const kind: 'Permanent' | 'Transient' | 'Undetermined' = event.data.details.bounceType;
        reasons.push(`${kind}: ${event.data.details.diagnosticCode}`);
      }
    }
    expect(reasons).toEqual([
      '421 4.7.0 [TSS04] Messages from 1.2.3.4 temporarily deferred',
      'Permanent: 550 5.1.1 user unknown',
    ]);
  });
});
