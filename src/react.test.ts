import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Vaartix } from './client.js';

function setup() {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
  return { fetch, vaartix: new Vaartix('vx_test', { fetch }) };
}

const body = (fetch: ReturnType<typeof setup>['fetch'], call = 0) =>
  JSON.parse((fetch.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

function Welcome({ name }: { name: string }) {
  return createElement('div', null, createElement('h1', null, `Welcome, ${name}`));
}

describe('React emails', () => {
  it('renders `react` to html and text before sending', async () => {
    const { fetch, vaartix } = setup();
    const result = await vaartix.emails.send({
      from: 'a@acme.in',
      to: 'b@example.com',
      subject: 'Hi',
      react: createElement(Welcome, { name: 'Priya' }),
    });
    expect(result.error).toBeNull();
    const sent = body(fetch);
    expect(sent.react).toBeUndefined();
    expect(sent.html).toContain('<h1>Welcome, Priya</h1>');
    expect(sent.text).toMatch(/WELCOME, PRIYA/i);
  });

  it('keeps your own text version and works in batches', async () => {
    const { fetch, vaartix } = setup();
    await vaartix.batch.send([
      {
        from: 'a@acme.in',
        to: 'b@example.com',
        subject: 'Hi',
        text: 'Plain',
        react: createElement(Welcome, { name: 'Ravi' }),
      },
    ]);
    const [sent] = body(fetch);
    expect(sent.text).toBe('Plain');
    expect(sent.html).toContain('Welcome, Ravi');
  });

  it('refuses react and html together without calling the API', async () => {
    const { fetch, vaartix } = setup();
    const result = await vaartix.emails.send({
      from: 'a@acme.in',
      to: 'b@example.com',
      subject: 'Hi',
      html: '<p>x</p>',
      react: createElement(Welcome, { name: 'x' }),
    });
    expect(result.error?.type).toBe('validation_error');
    expect(fetch).not.toHaveBeenCalled();
  });
});
