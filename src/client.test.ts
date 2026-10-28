import { describe, expect, it, vi } from 'vitest';
import { Vaartix } from './client.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe('Vaartix SDK', () => {
  it('sends an email with auth, JSON and idempotency headers', async () => {
    const fetch = mockFetch(200, { id: 'em_123' });
    const vaartix = new Vaartix('vx_test', { fetch, baseUrl: 'https://api.example.test/' });

    const result = await vaartix.emails.send(
      { from: 'a@acme.in', to: 'b@example.com', subject: 'Hi', html: '<p>Hi</p>' },
      { idempotencyKey: 'order-42' },
    );

    expect(result).toEqual({ data: { id: 'em_123' }, error: null });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/emails');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vx_test');
    expect(headers['Idempotency-Key']).toBe('order-42');
    expect(JSON.parse(init.body as string)).toMatchObject({ subject: 'Hi' });
  });

  it('ignores any number of trailing slashes in baseUrl', async () => {
    const fetch = mockFetch(200, { id: 'em_1' });
    const vaartix = new Vaartix('vx_test', {
      fetch,
      baseUrl: `https://api.example.test${'/'.repeat(50_000)}`,
    });
    await vaartix.emails.get('em_1');
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://api.example.test/emails/em_1');
  });

  it('returns API errors instead of throwing', async () => {
    const fetch = mockFetch(422, {
      error: { type: 'validation_error', message: 'from is required' },
    });
    const vaartix = new Vaartix('vx_test', { fetch });
    const result = await vaartix.emails.send({ from: '', to: 'b@example.com', subject: 'Hi' });
    expect(result).toEqual({
      data: null,
      error: { type: 'validation_error', message: 'from is required', statusCode: 422 },
    });
  });

  it('returns network failures as errors', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const vaartix = new Vaartix('vx_test', { fetch });
    const result = await vaartix.emails.get('em_1');
    expect(result.error).toEqual({
      type: 'network_error',
      message: 'fetch failed',
      statusCode: null,
    });
  });

  it('sends a batch and builds list queries', async () => {
    const fetch = mockFetch(200, { data: [{ id: 'em_1' }, { id: 'em_2' }] });
    const vaartix = new Vaartix('vx_test', { fetch, baseUrl: 'https://api.example.test' });
    const batch = await vaartix.batch.send([
      { from: 'a@acme.in', to: 'b@example.com', subject: '1', text: '1' },
      { from: 'a@acme.in', to: 'c@example.com', subject: '2', text: '2' },
    ]);
    expect(batch.data?.data).toHaveLength(2);
    await vaartix.emails.list({ limit: 5, before: 'em_9' });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe('https://api.example.test/emails/batch');
    expect(calls[1]?.[0]).toBe('https://api.example.test/emails?limit=5&before=em_9');
  });

  it('requires an API key', () => {
    const saved = process.env.VAARTIX_API_KEY;
    delete process.env.VAARTIX_API_KEY;
    expect(() => new Vaartix()).toThrow(/Missing API key/);
    if (saved) process.env.VAARTIX_API_KEY = saved;
  });
});
