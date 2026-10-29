import nodemailer from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import { Vaartix } from './client.js';
import { vaartixTransport } from './nodemailer.js';

function setup(status = 200, body: unknown = { id: 'em_nm' }) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const transporter = nodemailer.createTransport(
    vaartixTransport({ client: new Vaartix('vx_test', { fetch }) }),
  );
  const sent = () =>
    JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  return { fetch, transporter, sent };
}

describe('Nodemailer transport', () => {
  it('sends sendMail() through Vaartix and returns its email ID', async () => {
    const { transporter, sent } = setup();
    const info = await transporter.sendMail({
      from: 'Acme Orders <orders@acme.in>',
      to: 'Priya <priya@example.com>, ravi@example.com',
      cc: 'cc@example.com',
      bcc: 'audit@acme.in',
      replyTo: 'support@acme.in',
      subject: 'Order confirmed',
      text: 'Thanks for your order',
      html: '<p>Thanks for your order</p>',
      headers: { 'X-Order': '1042' },
    });
    expect(info.messageId).toBe('em_nm');
    expect(info.envelope.to).toContain('audit@acme.in');
    expect(sent()).toEqual({
      from: 'Acme Orders <orders@acme.in>',
      to: ['Priya <priya@example.com>', 'ravi@example.com'],
      cc: ['cc@example.com'],
      bcc: ['audit@acme.in'],
      replyTo: ['support@acme.in'],
      subject: 'Order confirmed',
      text: 'Thanks for your order',
      html: '<p>Thanks for your order</p>',
      headers: { 'X-Order': '1042' },
    });
  });

  it('converts text and binary attachments to base64 and keeps inline image IDs', async () => {
    const { transporter, sent } = setup();
    await transporter.sendMail({
      from: 'a@acme.in',
      to: 'b@example.com',
      subject: 'Invoice',
      html: '<img src="cid:logo"> Attached',
      attachments: [
        { filename: 'invoice.txt', content: 'total: 100' },
        { filename: 'logo.png', content: Buffer.from('png bytes'), cid: 'logo' },
      ],
    });
    const [file, image] = sent().attachments;
    expect(file).toEqual({
      filename: 'invoice.txt',
      content: Buffer.from('total: 100').toString('base64'),
      contentType: 'text/plain',
    });
    expect(image.contentId).toBe('logo');
    expect(image.contentType).toBe('image/png');
    expect(Buffer.from(image.content, 'base64').toString()).toBe('png bytes');
  });

  it('passes Vaartix tags and the idempotency key', async () => {
    const { fetch, transporter, sent } = setup();
    await transporter.sendMail({
      from: 'a@acme.in',
      to: 'b@example.com',
      subject: 'Welcome',
      text: 'Hi',
      tags: [{ name: 'type', value: 'welcome' }],
      idempotencyKey: 'welcome-42',
    } as nodemailer.SendMailOptions);
    expect(sent().tags).toEqual([{ name: 'type', value: 'welcome' }]);
    const headers = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers['Idempotency-Key']).toBe('welcome-42');
  });

  it('rejects with the Vaartix error type', async () => {
    const { transporter } = setup(422, {
      error: { type: 'domain_not_verified', message: 'Verify acme.in first' },
    });
    await expect(
      transporter.sendMail({ from: 'a@acme.in', to: 'b@example.com', subject: 'Hi', text: 'x' }),
    ).rejects.toMatchObject({
      message: 'Vaartix: Verify acme.in first (domain_not_verified)',
      code: 'domain_not_verified',
      responseCode: 422,
    });
  });
});
