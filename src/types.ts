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

/**
 * Open and click tracking for one email. Each field overrides the sending domain's default
 * (both off unless changed); a field left out uses the domain's setting. Only HTML parts are
 * tracked, and only http/https links are rewritten.
 */
export interface TrackingSettings {
  /** Add an open-tracking pixel. */
  opens?: boolean;
  /** Rewrite links to count clicks. */
  clicks?: boolean;
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
  /** Open and click tracking for this email, overriding the domain's defaults. */
  tracking?: TrackingSettings;
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
  /** The email's own tracking setting, or null when it uses the domain's defaults. */
  tracking: TrackingSettings | null;
  events: EmailEvent[];
}

/** A sending domain. Only the tracking fields are typed so far. */
export interface Domain {
  id: string;
  /** Open tracking for this domain's emails unless an email overrides it. */
  openTracking: boolean;
  /** Click tracking for this domain's emails unless an email overrides it. */
  clickTracking: boolean;
  [field: string]: unknown;
}

/** Fields left out keep their current value. */
export interface UpdateDomainOptions {
  openTracking?: boolean;
  clickTracking?: boolean;
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
  | 'email.suppressed'
  | 'email.opened'
  | 'email.clicked';

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

/** `details` of an `email.opened` event. */
export interface OpenedEventDetails {
  /** True when the open was most likely not a person, such as an image proxy or Apple Mail Privacy Protection. */
  machine: boolean;
  machineReason: 'image_proxy' | 'apple_mpp' | 'too_fast' | null;
  /** For example `Chrome`, `Apple Mail` or `Gmail image proxy`. More values may be added. */
  userAgentFamily: string;
  /** Two-letter country code, when known. */
  country: string | null;
  /** Network (autonomous system) number, when known. */
  asn: number | null;
  [field: string]: unknown;
}

/** `details` of an `email.clicked` event. */
export interface ClickedEventDetails {
  /** True when the click was most likely not a person, such as a link scanner. */
  machine: boolean;
  machineReason: 'scanner' | 'scanner_network' | 'too_fast' | 'burst' | null;
  /** Position of the link in the email's HTML, starting at 0. */
  linkIndex: number;
  /** The original link URL. */
  link: string;
  /** For example `Chrome`, `Outlook` or `scanner`. More values may be added. */
  userAgentFamily: string;
  /** Two-letter country code, when known. */
  country: string | null;
  /** Network (autonomous system) number, when known. */
  asn: number | null;
  [field: string]: unknown;
}

/** The `details` object for each event type. */
export type WebhookEventDetails<T extends WebhookEventType = WebhookEventType> =
  T extends 'email.opened'
    ? OpenedEventDetails
    : T extends 'email.clicked'
      ? ClickedEventDetails
      : Record<string, unknown>;

interface WebhookPayloadOf<T extends WebhookEventType> {
  type: T;
  /** When the event happened. Deliveries can arrive out of order; sort by this. */
  createdAt: string;
  data: {
    emailId: string;
    eventId: string;
    /** `null` when the email had more than one recipient. */
    recipient: string | null;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    tags: Tag[];
    emailCreatedAt: string;
    details: WebhookEventDetails<T>;
  };
}

/**
 * The JSON body Vaartix posts to your endpoint. Check `type` to narrow it:
 * after `if (payload.type === 'email.clicked')`, `payload.data.details.link` is a string.
 */
export type WebhookPayload<T extends WebhookEventType = WebhookEventType> =
  T extends WebhookEventType ? WebhookPayloadOf<T> : never;

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
