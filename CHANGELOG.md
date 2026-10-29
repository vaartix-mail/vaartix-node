# Changelog

## Unreleased

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
