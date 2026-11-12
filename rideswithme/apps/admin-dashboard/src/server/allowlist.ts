/** API paths the browser may reach through this server's proxy. Everything else is refused. */
const ALLOWED = [
  /^v1\/me$/,
  /^v1\/auth\/mfa\/totp\/(setup|activate|verify)$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/admin\/(users|roles|audit-logs|drivers)(\/.*)?$/,
  /^v1\/vehicle-categories$/,
];

export function isAllowedApiPath(path: string): boolean {
  if (path.includes('..') || path.includes('//')) return false;
  return ALLOWED.some((re) => re.test(path));
}
