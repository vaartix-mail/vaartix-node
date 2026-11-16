# vaartix

Official Node.js SDK for [Vaartix](https://vaartix.com), the email API for Indian developers.

> Create a free account at [app.vaartix.com](https://app.vaartix.com): 5,000 emails a month on the free plan, no card needed to start.

```sh
npm install vaartix
```

```ts
import { Vaartix } from 'vaartix';

const vaartix = new Vaartix(process.env.VAARTIX_API_KEY);

const { data, error } = await vaartix.emails.send({
  from: 'Acme <onboarding@acme.in>',
  to: ['priya@example.com'],
  subject: 'Hello from Vaartix',
  html: '<strong>It works!</strong>',
});
```

Every method resolves to `{ data, error }` and never throws for API or network errors.

```ts
// Retry safely: the same key within 24 hours returns the first email instead of sending twice.
await vaartix.emails.send({ ...email }, { idempotencyKey: `welcome-${user.id}` });

// Send later (up to 30 days ahead), and cancel if plans change.
const { data } = await vaartix.emails.send({ ...email, scheduledAt: '2026-11-01T09:00:00+05:30' });
await vaartix.emails.cancel(data!.id);

// Up to 100 emails in one request.
await vaartix.batch.send([email1, email2]);

// Try it without a domain: test addresses simulate delivery, bounces and complaints.
await vaartix.emails.send({
  from: 'onboarding@test.vaartix.com',
  to: 'delivered@test.vaartix.com',
  subject: 'Hello',
  html: '<p>It works!</p>',
});
```

## React Email

Write emails as React components with [React Email](https://react.email) and pass them as `react`. The SDK renders the HTML and a plain-text version for you.

```sh
npm install @react-email/render @react-email/components
```

```tsx
import { WelcomeEmail } from './emails/welcome';

await vaartix.emails.send({
  from: 'Acme <onboarding@acme.in>',
  to: 'priya@example.com',
  subject: 'Welcome to Acme',
  react: <WelcomeEmail name="Priya" />,
});
```

Pass `text` as well if you want to write the plain-text version yourself.

## Nodemailer

Already using [Nodemailer](https://nodemailer.com)? Swap the transport and keep your
`sendMail()` code:

```ts
import nodemailer from 'nodemailer';
import { vaartixTransport } from 'vaartix';

const transporter = nodemailer.createTransport(vaartixTransport()); // reads VAARTIX_API_KEY

const info = await transporter.sendMail({
  from: 'Acme <orders@acme.in>',
  to: 'priya@example.com',
  subject: 'Order confirmed',
  html: '<p>Thanks for your order!</p>',
  attachments: [{ filename: 'invoice.pdf', path: './invoice.pdf' }],
});
console.log(info.messageId); // em_...
```

Attachments (any Nodemailer source), inline images (`cid`), cc, bcc, reply-to and custom headers
work as usual. Add `tags`, `idempotencyKey` or `scheduledAt` to `sendMail()` to use those Vaartix
features. Errors reject with `code` set to the Vaartix error type.

## Open and click tracking

Tracking is off unless you turn it on, for a whole domain or for one email. Only HTML emails are
tracked. Keep click tracking off for password-reset, magic-link and OTP emails.

```ts
// Default for every email from a domain (needs a full-access key from an owner or admin).
// domainId is the domain's ID from the dashboard or the API.
await vaartix.domains.update(domainId, { openTracking: true, clickTracking: true });

// Override for one email
await vaartix.emails.send({
  from: 'Acme <orders@acme.in>',
  to: 'priya@example.com',
  subject: 'Your order has shipped',
  html: '<p>Track it <a href="https://acme.in/orders/123">here</a></p>',
  tracking: { opens: true, clicks: true },
});
```

## Webhooks

Endpoints receive `email.opened` and `email.clicked` only if they subscribe to them. Each has
`details.machine`, which is `true` when the open or click was most likely not a person (an image
proxy, Apple Mail Privacy Protection or a link scanner), with the reason in `details.machineReason`.

Check that a webhook request really came from Vaartix before you trust it. Use the raw body, not parsed JSON.

```ts
import { verifyWebhook, WebhookVerificationError } from 'vaartix';

app.post('/webhooks/vaartix', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = verifyWebhook({
      payload: req.body,
      headers: req.headers,
      secret: process.env.VAARTIX_WEBHOOK_SECRET!,
    });
    if (event.type === 'email.bounced') {
      // stop emailing event.data.recipient
    }
    if (event.type === 'email.clicked' && !event.data.details.machine) {
      // a person clicked event.data.details.link
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

## Command line

The package includes a `vaartix` command, handy for testing and for AI coding agents:

```sh
export VAARTIX_API_KEY=vx_...
npx vaartix send --from "Acme <hello@acme.in>" --to delivered@test.vaartix.com \
  --subject "Hello" --html-file welcome.html
npx vaartix get em_...                 # status, events and the receiving server's reply
npx vaartix list --limit 20
npx vaartix cancel em_...              # a scheduled email
```

`--to`, `--cc`, `--bcc`, `--reply-to` and `--tag name=value` can be repeated. Add `--json` for the API's
JSON, `--scheduled-at` to send later, `--track-opens` / `--track-clicks`, and `--idempotency-key` for safe
retries. Exit codes: 0 success, 1 API error, 2 usage error. Run `npx vaartix --help` for everything.

## Docs

Full API reference and guides: [vaartix.com/docs](https://vaartix.com/docs). Guides for
[Next.js](https://vaartix.com/docs/guides/nextjs/) and [Express](https://vaartix.com/docs/guides/express/).

## Contributing and security

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Please report
security problems privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
