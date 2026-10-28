export interface Tag {
  name: string;
  value: string;
}

export interface Attachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  /** Detected from the filename if omitted. */
  contentType?: string;
  /** For inline images: reference it in your HTML as `cid:<contentId>`. */
  contentId?: string;
}

export interface SendEmailOptions {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /**
   * A React Email element, such as `<WelcomeEmail name="Priya" />`. The SDK renders it to `html`
   * (and `text`, unless you pass one) before sending. Needs `@react-email/render` installed.
   */
  react?: unknown;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string | string[];
  headers?: Record<string, string>;
  tags?: Tag[];
  attachments?: Attachment[];
  /** ISO 8601 date-time to send later, e.g. `2026-11-01T09:00:00+05:30`. */
  scheduledAt?: string;
}

export interface SendEmailResponse {
  id: string;
}

export type EmailStatus =
  | 'queued'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'suppressed'
  | 'failed'
  | 'canceled';

export interface EmailEvent {
  type: string;
  recipient: string | null;
  data: Record<string, unknown>;
  occurredAt: string;
}

export interface EmailSummary {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  status: EmailStatus;
  tags: Tag[];
  attachments: { filename: string; contentType: string; size: number }[];
  scheduledAt: string | null;
  sentAt: string | null;
  lastEventAt: string | null;
  error: string | null;
  createdAt: string;
}

export interface Email extends EmailSummary {
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  events: EmailEvent[];
}

export interface ListEmailsOptions {
  /** 1 to 100, default 20. */
  limit?: number;
  /** Return emails older than this email ID (for paging). */
  before?: string;
}

export interface ListEmailsResponse {
  data: EmailSummary[];
  hasMore: boolean;
}

export interface RequestOptions {
  /** Retrying a request with the same key within 24 hours returns the first result. */
  idempotencyKey?: string;
}

export interface VaartixError {
  type: string;
  message: string;
  statusCode: number | null;
}

/** Every method resolves to `{ data, error }`: exactly one of them is set. */
export type Result<T> = { data: T; error: null } | { data: null; error: VaartixError };

export interface ClientOptions {
  /** Defaults to https://api.vaartix.com */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type WebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.rejected'
  | 'email.rendering_failure'
  | 'email.suppressed';

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEventType[];
  status: 'enabled' | 'disabled';
  createdAt: string;
}

export interface WebhookWithSecret extends Webhook {
  /** The signing secret (`whsec_...`). Only returned when created or rotated. */
  secret: string;
}

export interface CreateWebhookOptions {
  /** A public `https://` URL. */
  url: string;
  events: WebhookEventType[];
}

export interface UpdateWebhookOptions {
  url?: string;
  events?: WebhookEventType[];
  status?: 'enabled' | 'disabled';
}

/** The JSON body Vaartix posts to your endpoint. */
export interface WebhookPayload {
  type: WebhookEventType;
  /** When the event happened. Deliveries can arrive out of order; sort by this. */
  createdAt: string;
  data: {
    emailId: string;
    eventId: string;
    recipient: string | null;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    tags: Tag[];
    emailCreatedAt: string;
    details: Record<string, unknown>;
  };
}

export interface WebhookDelivery {
  /** Also sent as the `webhook-id` header. */
  id: string;
  type: WebhookEventType;
  eventId: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  responseStatus: number | null;
  responseBody: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  payload: WebhookPayload;
}
