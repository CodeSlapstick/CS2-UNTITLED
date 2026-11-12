export const DEFAULT_AFTER_LOGIN = "/matches";

export function safeNext(next: string | null): string {
  const unsafe = !next || /[\\\u0000-\u001f\u007f]/.test(next);
  return !unsafe && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : DEFAULT_AFTER_LOGIN;
}
