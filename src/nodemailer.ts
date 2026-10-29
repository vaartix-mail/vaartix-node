import { Vaartix } from './client.js';
import type { Attachment, SendEmailOptions, Tag } from './types.js';

/** Headers Vaartix builds from the email itself; passing them again would conflict. */
const RESERVED_HEADERS = new Set([
  'from',
  'to',
  'cc',
  'bcc',
  'reply-to',
  'sender',
  'subject',
  'date',
  'message-id',
  'content-type',
  'content-transfer-encoding',
  'mime-version',
]);

export interface VaartixTransportOptions {
  /** Defaults to the VAARTIX_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.vaartix.com */
  baseUrl?: string;
  /** Use an existing client instead of creating one. */
  client?: Vaartix;
}

type AddressObject = { name?: string; address: string };
type AddressValue = string | AddressObject | (string | AddressObject)[] | undefined;

interface NormalizedMail {
  from?: AddressValue;
  to?: AddressValue;
  cc?: AddressValue;
  bcc?: AddressValue;
  replyTo?: AddressValue;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, unknown> | { key: string; value: unknown }[];
  attachments?: {
    filename?: string | false;
    content?: string;
    encoding?: string;
    contentType?: string;
    cid?: string;
  }[];
  /** Vaartix extras you can pass to sendMail(). */
  tags?: Tag[];
  idempotencyKey?: string;
  scheduledAt?: string;
}

/** The subset of Nodemailer's MailMessage the transport uses. */
interface MailMessage {
  normalize(callback: (err: Error | null, data?: NormalizedMail) => void): void;
  message: { getEnvelope(): { from: string | false; to: string[] } };
}

export interface VaartixNodemailerTransport {
  name: string;
  version: string;
  send(
    mail: MailMessage,
    callback: (
      err: Error | null,
      info?: { messageId: string; envelope: { from: string | false; to: string[] } },
    ) => void,
  ): void;
}

function addressList(value: AddressValue): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((a) => {
    if (typeof a === 'string') return a;
    const name = a.name?.replace(/["<>]/g, '').trim();
    return name ? `${name} <${a.address}>` : a.address;
  });
}

function toBase64(content: string, encoding: string | undefined): string {
  if (encoding === 'base64') return content;
  return Buffer.from(content, (encoding as BufferEncoding | undefined) ?? 'utf8').toString(
    'base64',
  );
}

function headerEntries(headers: NormalizedMail['headers']): [string, unknown][] {
  if (!headers) return [];
  return Array.isArray(headers)
    ? headers.map((h) => [h.key, h.value] as [string, unknown])
    : Object.entries(headers);
}

/** @internal Exported for tests. */
export function toSendOptions(data: NormalizedMail): SendEmailOptions {
  const email: SendEmailOptions = {
    from: addressList(data.from)[0] ?? '',
    to: addressList(data.to),
    subject: data.subject ?? '',
  };
  const cc = addressList(data.cc);
  const bcc = addressList(data.bcc);
  const replyTo = addressList(data.replyTo);
  if (cc.length) email.cc = cc;
  if (bcc.length) email.bcc = bcc;
  if (replyTo.length) email.replyTo = replyTo;
  if (typeof data.html === 'string') email.html = data.html;
  if (typeof data.text === 'string') email.text = data.text;

  const headers: Record<string, string> = {};
  for (const [key, value] of headerEntries(data.headers)) {
    if (RESERVED_HEADERS.has(key.toLowerCase()) || value === undefined || value === null) continue;
    headers[key] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }
  if (Object.keys(headers).length) email.headers = headers;

  const attachments: Attachment[] = (data.attachments ?? []).map((a) => {
    const attachment: Attachment = {
      filename: a.filename || 'attachment',
      content: toBase64(a.content ?? '', a.encoding),
    };
    if (a.contentType) attachment.contentType = a.contentType;
    if (a.cid) attachment.contentId = a.cid;
    return attachment;
  });
  if (attachments.length) email.attachments = attachments;
  if (data.tags?.length) email.tags = data.tags;
  if (data.scheduledAt) email.scheduledAt = data.scheduledAt;
  return email;
}

/**
 * A Nodemailer transport that sends through the Vaartix API, so existing
 * `transporter.sendMail()` code keeps working:
 *
 *     const transporter = nodemailer.createTransport(vaartixTransport());
 *     await transporter.sendMail({ from, to, subject, html, attachments });
 *
 * `info.messageId` is the Vaartix email ID. Pass `tags`, `idempotencyKey` or `scheduledAt` in
 * sendMail() to use those Vaartix features.
 */
export function vaartixTransport(
  options: VaartixTransportOptions = {},
): VaartixNodemailerTransport {
  const client =
    options.client ??
    new Vaartix(options.apiKey, options.baseUrl ? { baseUrl: options.baseUrl } : {});
  return {
    name: 'vaartix',
    version: '0.2.0',
    send(mail, callback) {
      mail.normalize((err, data) => {
        if (err || !data) {
          callback(err ?? new Error('Could not read the email.'));
          return;
        }
        const envelope = mail.message.getEnvelope();
        client.emails
          .send(
            toSendOptions(data),
            data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : undefined,
          )
          .then(({ data: sent, error }) => {
            if (error) {
              const failure = new Error(`Vaartix: ${error.message} (${error.type})`);
              Object.assign(failure, { code: error.type, responseCode: error.statusCode });
              callback(failure);
            } else {
              callback(null, { messageId: sent.id, envelope });
            }
          }, callback);
      });
    },
  };
}
