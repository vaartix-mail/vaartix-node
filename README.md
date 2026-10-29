# vaartix

Official Node.js SDK for [Vaartix](https://vaartix.com), the email API for Indian developers.

> Vaartix is in private beta. The API opens with the beta.

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

## Webhooks

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
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookVerificationError) return res.sendStatus(400);
    throw err;
  }
});
```

## Docs

Full API reference and guides: [vaartix.com/docs](https://vaartix.com/docs). Guides for
[Next.js](https://vaartix.com/docs/guides/nextjs/) and [Express](https://vaartix.com/docs/guides/express/).

## Contributing and security

Issues and pull requests are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Please report
security problems privately as described in [SECURITY.md](SECURITY.md).

## License

MIT
