import { parseArgs } from 'node:util';
import open from 'open';
import { bootstrapDaemonRuntime, createDaemonServer } from '../src/daemon/server.js';
import { findFreePort, DEFAULT_PORT } from '../src/daemon/port.js';
import { runBaselineCleanup } from '../src/scripts/baseline-cleanup.js';

const HELP = `
nakiros — local daemon that observes Claude Code and lets you inspect,
audit, evaluate and improve skills from your browser.

Usage:
  nakiros [options]                  Start the daemon (default).
  nakiros baseline:cleanup [opts]    Remove legacy baseline run dirs.

Options (daemon):
  --port <n>   Preferred port (default 4242 or NAKIROS_PORT). Falls
               back to the next free port if taken.
  --no-open    Do not open the browser automatically.
  -h, --help   Show this help.

Environment:
  NAKIROS_PORT  Override default port.

Examples:
  nakiros
  nakiros --port 5000
  nakiros --no-open
  nakiros baseline:cleanup           # dry-run, see what would be deleted
  nakiros baseline:cleanup --apply
`;

async function main(): Promise<void> {
  // Subcommand dispatch — runs before parseArgs so the daemon flags don't
  // collide with subcommand-specific ones. Subcommands take everything after
  // their name as their own args.
  const subcommand = process.argv[2];
  if (subcommand === 'baseline:cleanup') {
    const code = await runBaselineCleanup(process.argv.slice(3));
    process.exit(code);
  }

  const { values } = parseArgs({
    options: {
      port: { type: 'string' },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: false,
  });

  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const requested = values.port
    ? Number.parseInt(values.port as string, 10)
    : Number.parseInt(process.env.NAKIROS_PORT ?? '', 10) || DEFAULT_PORT;

  if (!Number.isFinite(requested) || requested <= 0) {
    process.stderr.write(`Invalid port: ${values.port}\n`);
    process.exit(1);
  }

  const port = await findFreePort(requested);
  const app = await createDaemonServer();

  // Rehydrate in-flight fix/create runs & cleanup stray eval artifacts.
  // Matches what the old Electron main.ts did at `app.whenReady()`.
  bootstrapDaemonRuntime();

  await app.listen({ port, host: '127.0.0.1' });

  const url = `http://localhost:${port}`;
  if (port !== requested) {
    process.stdout.write(`Port ${requested} was taken, using ${port} instead.\n`);
  }
  process.stdout.write(`Nakiros daemon ready at ${url}\n`);

  if (!values['no-open']) {
    await open(url).catch(() => undefined);
  }

  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\nReceived ${signal}, shutting down...\n`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err) => {
  process.stderr.write(`Failed to start daemon: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
