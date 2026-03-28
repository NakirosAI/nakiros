function extractErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const code = 'code' in value ? value.code : undefined;
  return typeof code === 'string' && code.trim().length > 0 ? code : undefined;
}

function extractErrorDetails(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];

  const details: string[] = [];
  const syscall = 'syscall' in value ? value.syscall : undefined;
  const hostname = 'hostname' in value ? value.hostname : undefined;
  const address = 'address' in value ? value.address : undefined;
  const port = 'port' in value ? value.port : undefined;

  if (typeof syscall === 'string' && syscall.trim().length > 0) details.push(`syscall=${syscall}`);
  if (typeof hostname === 'string' && hostname.trim().length > 0) details.push(`host=${hostname}`);
  if (typeof address === 'string' && address.trim().length > 0) details.push(`address=${address}`);
  if (typeof port === 'number' || typeof port === 'string') details.push(`port=${port}`);

  return details;
}

function flattenErrorMessages(error: unknown, messages: string[], seen: Set<unknown>): void {
  if (!error || seen.has(error)) return;
  seen.add(error);

  if (error instanceof AggregateError) {
    for (const nested of error.errors) flattenErrorMessages(nested, messages, seen);
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0 && !messages.includes(message)) messages.push(message);

    const code = extractErrorCode(error);
    if (code && !messages.includes(code)) messages.push(code);

    for (const detail of extractErrorDetails(error)) {
      if (!messages.includes(detail)) messages.push(detail);
    }

    flattenErrorMessages((error as Error & { cause?: unknown }).cause, messages, seen);
    return;
  }

  if (typeof error === 'string') {
    const message = error.trim();
    if (message.length > 0 && !messages.includes(message)) messages.push(message);
    return;
  }

  const code = extractErrorCode(error);
  if (code && !messages.includes(code)) messages.push(code);

  for (const detail of extractErrorDetails(error)) {
    if (!messages.includes(detail)) messages.push(detail);
  }
}

function shouldHideMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return normalized === 'fetch failed' || normalized === 'error' || normalized === 'typeerror: fetch failed';
}

export function formatNetworkError(error: unknown, fallback: string): string {
  const messages: string[] = [];
  flattenErrorMessages(error, messages, new Set());

  const usefulMessages = messages.filter((message) => !shouldHideMessage(message));
  if (usefulMessages.length === 0) return fallback;

  return `${fallback}: ${usefulMessages.join(' | ')}`;
}
