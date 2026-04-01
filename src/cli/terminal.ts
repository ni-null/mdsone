// ============================================================
// src/cli/terminal.ts
// Shared terminal capability checks (TTY / color / rewritable line).
// ============================================================

export type TtyLikeStream = {
  isTTY?: boolean;
};

export function isTty(stream: TtyLikeStream | null | undefined): boolean {
  return !!stream?.isTTY;
}

export function isInteractiveTerminal(options?: {
  stdout?: TtyLikeStream;
  stderr?: TtyLikeStream;
}): boolean {
  const stdout = options?.stdout ?? process.stdout;
  const stderr = options?.stderr ?? process.stderr;
  return isTty(stdout) || isTty(stderr);
}

export function isColorOutputEnabled(options?: {
  env?: Record<string, string | undefined>;
  stdout?: TtyLikeStream;
  stderr?: TtyLikeStream;
}): boolean {
  const env = options?.env ?? process.env;
  if (env["NO_COLOR"] !== undefined) return false;
  return isInteractiveTerminal(options);
}

export function canRewriteLine(stream: TtyLikeStream = process.stderr): boolean {
  return isTty(stream);
}

