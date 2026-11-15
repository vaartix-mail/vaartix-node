import { describe, expect, it, vi } from 'vitest';
import { run } from './cli.js';

function setup(status = 200, body: unknown = { id: 'em_123' }) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    env: { VAARTIX_API_KEY: 'vx_test' },
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
    fetch,
    readFile: () => '<p>From file</p>',
  };
  const call = (i = 0) => {
    const [url, init] = fetch.mock.calls[i] as unknown as [string, RequestInit];
    return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined };
  };
  return { io, out, err, fetch, call };
}

describe('vaartix CLI', () => {
  it('sends an email with every option', async () => {
    const t = setup();
    const code = await run(
      [
        'send',
        '--from',
        'Acme <orders@acme.in>',
        '--to',
        'a@x.in,b@x.in',
        '--to',
        'c@x.in',
        '--subject',
        'Hi',
        '--html-file',
        'mail.html',
        '--reply-to',
        'help@acme.in',
        '--tag',
        'flow=order',
        '--scheduled-at',
        '2026-11-15T10:00:00+05:30',
        '--track-opens',
        '--idempotency-key',
        'k1',
      ],
      t.io,
    );
    expect(code).toBe(0);
    expect(t.out[0]).toBe('Sent em_123 (scheduled for 2026-11-15T10:00:00+05:30)');
    const { url, init, body } = t.call();
    expect(url).toBe('https://api.vaartix.com/emails');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1');
    expect(body).toEqual({
      from: 'Acme <orders@acme.in>',
      to: ['a@x.in', 'b@x.in', 'c@x.in'],
      subject: 'Hi',
      html: '<p>From file</p>',
      replyTo: ['help@acme.in'],
      tags: [{ name: 'flow', value: 'order' }],
      scheduledAt: '2026-11-15T10:00:00+05:30',
      tracking: { opens: true },
    });
  });

  it('prints JSON with --json', async () => {
    const t = setup();
    expect(
      await run(
        [
          'send',
          '--from',
          'a@acme.in',
          '--to',
          'b@x.in',
          '--subject',
          's',
          '--text',
          't',
          '--json',
        ],
        t.io,
      ),
    ).toBe(0);
    expect(JSON.parse(t.out[0] ?? '')).toEqual({ id: 'em_123' });
  });

  it('gets an email with the receiving server reply', async () => {
    const t = setup(200, {
      id: 'em_1',
      status: 'bounced',
      from: 'a@acme.in',
      to: ['old@x.in'],
      subject: 'Hi',
      createdAt: 'c',
      error: null,
      events: [
        {
          type: 'bounced',
          recipient: 'old@x.in',
          occurredAt: 't',
          data: { diagnosticCode: '550 5.1.1 user unknown' },
        },
      ],
    });
    expect(await run(['get', 'em_1'], t.io)).toBe(0);
    expect(t.out[0]).toContain('em_1  bounced');
    expect(t.out[0]).toContain('550 5.1.1 user unknown');
  });

  it('lists and cancels', async () => {
    const t = setup(200, {
      data: [{ id: 'em_2', status: 'delivered', createdAt: 'c', to: ['a@x.in'], subject: 'S' }],
      hasMore: true,
    });
    expect(await run(['list', '--limit', '5'], t.io)).toBe(0);
    expect(t.call().url).toBe('https://api.vaartix.com/emails?limit=5');
    expect(t.out[0]).toContain('More: vaartix list --before em_2');
    const t2 = setup(200, { id: 'em_3', status: 'canceled' });
    expect(await run(['cancel', 'em_3'], t2.io)).toBe(0);
    expect(t2.out[0]).toBe('em_3  canceled');
  });

  it('reports API errors with exit code 1', async () => {
    const t = setup(422, {
      error: { type: 'validation_error', message: 'to: not a valid email address.' },
    });
    expect(
      await run(
        ['send', '--from', 'a@acme.in', '--to', 'x', '--subject', 's', '--text', 't'],
        t.io,
      ),
    ).toBe(1);
    expect(t.err[0]).toBe('Error (validation_error, 422): to: not a valid email address.');
  });

  it('reports usage errors with exit code 2 and never calls the API', async () => {
    const cases = [
      ['send', '--from', 'a@acme.in', '--subject', 's', '--text', 't'],
      ['send', '--from', 'a@acme.in', '--to', 'b@x.in', '--subject', 's'],
      [
        'send',
        '--from',
        'a@acme.in',
        '--to',
        'b@x.in',
        '--subject',
        's',
        '--text',
        't',
        '--tag',
        'bad',
      ],
      ['list', '--limit', '500'],
      ['get'],
      ['frobnicate'],
      ['send', '--nope'],
    ];
    for (const argv of cases) {
      const t = setup();
      expect(await run(argv, t.io)).toBe(2);
      expect(t.fetch).not.toHaveBeenCalled();
    }
    const noKey = setup();
    expect(await run(['get', 'em_1'], { ...noKey.io, env: {} })).toBe(2);
    expect(noKey.err[0]).toContain('VAARTIX_API_KEY');
  });

  it('prints help and version', async () => {
    const t = setup();
    expect(await run(['--help'], t.io)).toBe(0);
    expect(t.out[0]).toContain('vaartix send');
    expect(await run(['--version'], t.io)).toBe(0);
    expect(t.out[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
