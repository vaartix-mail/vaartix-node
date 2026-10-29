import type {
  ClientOptions,
  CreateWebhookOptions,
  Email,
  EmailSummary,
  ListEmailsOptions,
  ListEmailsResponse,
  RequestOptions,
  Result,
  SendEmailOptions,
  SendEmailResponse,
  UpdateWebhookOptions,
  VaartixError,
  Webhook,
  WebhookDelivery,
  WebhookWithSecret,
} from './types.js';
import { type VerifyWebhookOptions, verifyWebhook } from './verify.js';

const VERSION = '0.2.0';
const DEFAULT_BASE_URL = 'https://api.vaartix.com';

/** Drop trailing slashes. A loop, not a regex, so a very long input can't slow it down. */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}

export class Vaartix {
  readonly emails: Emails;
  readonly batch: Batch;
  readonly webhooks: Webhooks;
  readonly #key: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(apiKey?: string, options: ClientOptions = {}) {
    const key = apiKey ?? process.env.VAARTIX_API_KEY;
    if (!key) {
      throw new Error(
        'Missing API key. Pass it to new Vaartix("vx_...") or set the VAARTIX_API_KEY environment variable.',
      );
    }
    this.#key = key;
    this.#baseUrl = trimTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.emails = new Emails(this);
    this.batch = new Batch(this);
    this.webhooks = new Webhooks(this);
  }

  /** @internal */
  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<Result<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#key}`,
      'User-Agent': `vaartix-node/${VERSION}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { data: null, error: { type: 'network_error', message, statusCode: null } };
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const err = (payload as { error?: { type?: string; message?: string } } | null)?.error;
      return {
        data: null,
        error: {
          type: err?.type ?? 'api_error',
          message: err?.message ?? `Request failed with status ${response.status}`,
          statusCode: response.status,
        },
      };
    }
    return { data: payload as T, error: null };
  }
}

/** Turn a `react` element into `html` and `text` with @react-email/render, loaded only when used. */
async function renderReact<T extends { react?: unknown; html?: string; text?: string }>(
  email: T,
): Promise<{ email: Omit<T, 'react'> } | { error: VaartixError }> {
  const { react, ...rest } = email;
  if (react === undefined) return { email: rest };
  const fail = (message: string) => ({
    error: { type: 'validation_error', message, statusCode: null },
  });
  if (rest.html !== undefined) return fail('Pass either `react` or `html`, not both.');

  let render: (node: unknown, options?: { plainText?: boolean }) => Promise<string>;
  try {
    ({ render } = (await import('@react-email/render')) as unknown as { render: typeof render });
  } catch {
    return fail(
      'Sending a `react` email needs @react-email/render. Install it with: npm install @react-email/render',
    );
  }
  try {
    const [html, text] = await Promise.all([
      render(react),
      rest.text ?? render(react, { plainText: true }),
    ]);
    return { email: { ...rest, html, text } };
  } catch (cause) {
    return fail(
      `Could not render the React email: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

class Emails {
  readonly #client: Vaartix;

  constructor(client: Vaartix) {
    this.#client = client;
  }

  /** Send an email. Resolves to `{ data: { id }, error: null }` once it is queued. */
  async send(
    email: SendEmailOptions,
    options?: RequestOptions,
  ): Promise<Result<SendEmailResponse>> {
    const rendered = await renderReact(email);
    if ('error' in rendered) return { data: null, error: rendered.error };
    return this.#client.request<SendEmailResponse>('POST', '/emails', rendered.email, options);
  }

  /** Look up an email, its status and its event timeline. Needs a full-access key. */
  get(id: string) {
    return this.#client.request<Email>('GET', `/emails/${encodeURIComponent(id)}`);
  }

  /** Recent emails, newest first. Needs a full-access key. */
  list(options: ListEmailsOptions = {}) {
    const query = new URLSearchParams();
    if (options.limit) query.set('limit', String(options.limit));
    if (options.before) query.set('before', options.before);
    const qs = query.toString();
    return this.#client.request<ListEmailsResponse>('GET', `/emails${qs ? `?${qs}` : ''}`);
  }

  /** Cancel a scheduled email before it is sent. Needs a full-access key. */
  cancel(id: string) {
    return this.#client.request<EmailSummary>('POST', `/emails/${encodeURIComponent(id)}/cancel`);
  }
}

class Batch {
  readonly #client: Vaartix;

  constructor(client: Vaartix) {
    this.#client = client;
  }

  /** Send up to 100 emails in one request (no attachments or scheduling). All or nothing. */
  async send(
    emails: Omit<SendEmailOptions, 'attachments' | 'scheduledAt'>[],
  ): Promise<Result<{ data: SendEmailResponse[] }>> {
    const rendered = [];
    for (const email of emails) {
      const result = await renderReact(email);
      if ('error' in result) return { data: null, error: result.error };
      rendered.push(result.email);
    }
    return this.#client.request<{ data: SendEmailResponse[] }>('POST', '/emails/batch', rendered);
  }
}

/** Webhook endpoints. Managing them needs a full-access key. */
class Webhooks {
  readonly #client: Vaartix;

  constructor(client: Vaartix) {
    this.#client = client;
  }

  /** Create an endpoint. The response includes the signing secret, shown only this once. */
  create(options: CreateWebhookOptions) {
    return this.#client.request<WebhookWithSecret>('POST', '/webhooks', options);
  }

  list() {
    return this.#client.request<{ data: Webhook[] }>('GET', '/webhooks');
  }

  get(id: string) {
    return this.#client.request<Webhook>('GET', `/webhooks/${encodeURIComponent(id)}`);
  }

  /** Change the URL or events, or turn the endpoint off (`status: 'disabled'`) and on. */
  update(id: string, options: UpdateWebhookOptions) {
    return this.#client.request<Webhook>('PATCH', `/webhooks/${encodeURIComponent(id)}`, options);
  }

  remove(id: string) {
    return this.#client.request<null>('DELETE', `/webhooks/${encodeURIComponent(id)}`);
  }

  /** Replace the signing secret. The old one stops working immediately. */
  rotateSecret(id: string) {
    return this.#client.request<WebhookWithSecret>(
      'POST',
      `/webhooks/${encodeURIComponent(id)}/rotate-secret`,
    );
  }

  /** Recent deliveries to an endpoint, newest first, with your server's responses. */
  deliveries(id: string, options: { limit?: number } = {}) {
    const qs = options.limit ? `?limit=${options.limit}` : '';
    return this.#client.request<{ data: WebhookDelivery[] }>(
      'GET',
      `/webhooks/${encodeURIComponent(id)}/deliveries${qs}`,
    );
  }

  /** Send a delivery again, with the same `webhook-id`. */
  retryDelivery(id: string, deliveryId: string) {
    return this.#client.request<WebhookDelivery>(
      'POST',
      `/webhooks/${encodeURIComponent(id)}/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    );
  }

  /** Check a request's signature and return its body. Same as the standalone `verifyWebhook`. */
  verify(options: VerifyWebhookOptions) {
    return verifyWebhook(options);
  }
}
