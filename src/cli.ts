#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Vaartix, VERSION } from './client.js';
import type { Result, SendEmailOptions } from './types.js';

const HELP = `Vaartix CLI: send and check transactional email from your terminal.

Usage:
  vaartix send --from <addr> --to <addr> --subject <text> (--html <html> | --html-file <path> | --text <text> | --text-file <path>)
               [--cc <addr>] [--bcc <addr>] [--reply-to <addr>] [--tag name=value] [--scheduled-at <iso>]
               [--track-opens] [--track-clicks] [--idempotency-key <key>]
  vaartix get <email-id>
  vaartix list [--limit <1-100>] [--before <email-id>]
  vaartix cancel <email-id>

Options for every command:
  --api-key <key>   Defaults to the VAARTIX_API_KEY environment variable
  --json            Print the API's JSON response
  --help, --version

--to, --cc, --bcc, --reply-to and --tag can be repeated. Test addresses such as
delivered@test.vaartix.com never send real email. Docs: https://vaartix.com/docs`;

export interface CliIO {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  fetch?: typeof fetch;
  readFile?: (path: string) => string;
}

class UsageError extends Error {}

const list = (v: string[] | undefined) =>
  (v ?? [])
    .flatMap((x) => x.split(','))
    .map((x) => x.trim())
    .filter(Boolean);

/** Run the CLI. Returns the exit code: 0 ok, 1 API error, 2 usage error. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (e) {
    io.err(`${(e as Error).message}\nRun "vaartix --help" for usage.`);
    return 2;
  }
  const { values: v, positionals } = parsed;
  if (v.version) {
    io.out(VERSION);
    return 0;
  }
  const [command, ...args] = positionals;
  if (v.help || !command) {
    io.out(HELP);
    return v.help ? 0 : 2;
  }
  const key = v['api-key'] ?? io.env.VAARTIX_API_KEY;
  if (!key) {
    io.err('Missing API key: pass --api-key or set VAARTIX_API_KEY.');
    return 2;
  }
  const client = new Vaartix(key, { baseUrl: v['base-url'], fetch: io.fetch });
  const read = io.readFile ?? ((p: string) => readFileSync(p, 'utf8'));

  try {
    switch (command) {
      case 'send': {
        const email = buildEmail(v, read);
        const res = await client.emails.send(email, { idempotencyKey: v['idempotency-key'] });
        return print(
          res,
          io,
          v.json,
          (d) => `Sent ${d.id}${email.scheduledAt ? ` (scheduled for ${email.scheduledAt})` : ''}`,
        );
      }
      case 'get': {
        const id = need(args[0], 'get needs an email ID, e.g. vaartix get em_...');
        return print(await client.emails.get(id), io, v.json, (e) =>
          [
            `${e.id}  ${e.status}`,
            `From:     ${e.from}`,
            `To:       ${e.to.join(', ')}`,
            `Subject:  ${e.subject}`,
            `Created:  ${e.createdAt}`,
            ...(e.error ? [`Error:    ${e.error}`] : []),
            'Events:',
            ...e.events.map((ev) => {
              const reply = (ev.data as { diagnosticCode?: string }).diagnosticCode;
              return `  ${ev.occurredAt}  ${ev.type}${ev.recipient ? `  ${ev.recipient}` : ''}${reply ? `\n    ${reply}` : ''}`;
            }),
          ].join('\n'),
        );
      }
      case 'list': {
        const limit = v.limit === undefined ? undefined : Number(v.limit);
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
          throw new UsageError('--limit must be a whole number from 1 to 100.');
        }
        return print(
          await client.emails.list({ limit, before: v.before }),
          io,
          v.json,
          (page) =>
            [
              ...page.data.map(
                (e) =>
                  `${e.id}  ${e.status.padEnd(16)}  ${e.createdAt}  ${e.to.join(', ')}  ${e.subject}`,
              ),
              ...(page.hasMore ? [`More: vaartix list --before ${page.data.at(-1)?.id}`] : []),
            ].join('\n') || 'No emails yet.',
        );
      }
      case 'cancel': {
        const id = need(args[0], 'cancel needs an email ID, e.g. vaartix cancel em_...');
        return print(await client.emails.cancel(id), io, v.json, (e) => `${e.id}  ${e.status}`);
      }
      default:
        throw new UsageError(`Unknown command "${command}".`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`${e.message}\nRun "vaartix --help" for usage.`);
      return 2;
    }
    throw e;
  }
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      'api-key': { type: 'string' },
      'base-url': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      from: { type: 'string' },
      to: { type: 'string', multiple: true },
      cc: { type: 'string', multiple: true },
      bcc: { type: 'string', multiple: true },
      'reply-to': { type: 'string', multiple: true },
      subject: { type: 'string' },
      html: { type: 'string' },
      'html-file': { type: 'string' },
      text: { type: 'string' },
      'text-file': { type: 'string' },
      tag: { type: 'string', multiple: true },
      'scheduled-at': { type: 'string' },
      'track-opens': { type: 'boolean' },
      'track-clicks': { type: 'boolean' },
      'idempotency-key': { type: 'string' },
      limit: { type: 'string' },
      before: { type: 'string' },
    },
  });
}

type Values = ReturnType<typeof parse>['values'];

function buildEmail(v: Values, read: (p: string) => string): SendEmailOptions {
  const to = list(v.to);
  if (!v.from || to.length === 0 || !v.subject)
    throw new UsageError('send needs --from, --to and --subject.');
  const html = v.html ?? (v['html-file'] ? read(v['html-file']) : undefined);
  const text = v.text ?? (v['text-file'] ? read(v['text-file']) : undefined);
  if (html === undefined && text === undefined) {
    throw new UsageError('send needs a body: --html, --html-file, --text or --text-file.');
  }
  const tags = (v.tag ?? []).map((t) => {
    const i = t.indexOf('=');
    if (i < 1) throw new UsageError(`--tag must look like name=value, got "${t}".`);
    return { name: t.slice(0, i), value: t.slice(i + 1) };
  });
  const tracking =
    v['track-opens'] || v['track-clicks']
      ? {
          ...(v['track-opens'] ? { opens: true } : {}),
          ...(v['track-clicks'] ? { clicks: true } : {}),
        }
      : undefined;
  return {
    from: v.from,
    to,
    subject: v.subject,
    ...(html !== undefined ? { html } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(list(v.cc).length ? { cc: list(v.cc) } : {}),
    ...(list(v.bcc).length ? { bcc: list(v.bcc) } : {}),
    ...(list(v['reply-to']).length ? { replyTo: list(v['reply-to']) } : {}),
    ...(tags.length ? { tags } : {}),
    ...(v['scheduled-at'] ? { scheduledAt: v['scheduled-at'] } : {}),
    ...(tracking ? { tracking } : {}),
  };
}

function need(value: string | undefined, message: string): string {
  if (!value) throw new UsageError(message);
  return value;
}

// Control characters (except tab and newline) and bidirectional overrides, written as visible escapes.
// Email fields such as a bounce's SMTP reply or a subject can come from third parties, and a
// terminal would otherwise act on escape sequences in them (rewrite lines, set links, the clipboard).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const UNSAFE = /[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;

export function terminalSafe(text: string): string {
  return text.replace(UNSAFE, (c) => {
    const code = c.charCodeAt(0);
    return code <= 0xff
      ? `\\x${code.toString(16).padStart(2, '0')}`
      : `\\u${code.toString(16).padStart(4, '0')}`;
  });
}

function print<T>(
  res: Result<T>,
  io: CliIO,
  json: boolean | undefined,
  human: (data: T) => string,
): number {
  if (res.error) {
    if (json) io.out(JSON.stringify({ error: res.error }, null, 2));
    else
      io.err(
        terminalSafe(
          `Error (${res.error.type}${res.error.statusCode ? `, ${res.error.statusCode}` : ''}): ${res.error.message}`,
        ),
      );
    return 1;
  }
  io.out(json ? JSON.stringify(res.data, null, 2) : terminalSafe(human(res.data)));
  return 0;
}

// Run when executed directly (npx vaartix ...), not when imported by tests.
const invoked = process.argv[1] ?? '';
if (/(^|[\\/])(cli\.(c?js|ts)|vaartix)$/.test(invoked)) {
  run(process.argv.slice(2), {
    env: process.env,
    out: (l) => process.stdout.write(`${l}\n`),
    err: (l) => process.stderr.write(`${l}\n`),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
