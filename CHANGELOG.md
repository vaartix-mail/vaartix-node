# Changelog

## Unreleased

## 0.3.0

- Open and click tracking: `tracking: { opens, clicks }` on `emails.send()` and on each email in
  `batch.send()`, overriding the sending domain's defaults. `emails.get()` returns the email's own
  `tracking` setting (or `null` when it uses the domain's defaults).
- `domains.update(id, { openTracking, clickTracking })` changes a domain's tracking defaults.
- `email.opened` and `email.clicked` webhook events, with typed `details` (`OpenedEventDetails`,
  `ClickedEventDetails`). `WebhookPayload` is now a union you can narrow by `type`; other events'
  `details` stay `Record<string, unknown>`.

## 0.2.0

- Nodemailer transport: `nodemailer.createTransport(vaartixTransport())` sends existing
  `sendMail()` calls through Vaartix, with attachments, inline images, headers, tags and
  idempotency keys. `info.messageId` is the Vaartix email ID.

- `baseUrl` trailing slashes are trimmed without a regular expression (flagged by CodeQL; only
  the developer controls this value).

## 0.1.1

- The package now lives in its own public repository, github.com/vaartix-mail/vaartix-node, so the
  npm page links to the source.

## 0.1.0

- First release: `emails.send`, `get`, `list`, `cancel`, `batch.send`, webhook endpoints, and
  `verifyWebhook` for signed webhooks.
- Send React Email components with `react: <MyEmail />` (needs `@react-email/render`).
- Idempotency keys, scheduled sending and test mode.
