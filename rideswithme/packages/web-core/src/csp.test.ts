import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './bff';

const directive = (csp: string, name: string) =>
  csp.split('; ').find((d) => d.startsWith(`${name} `));

describe('contentSecurityPolicy', () => {
  it('allows only nonced inline styles and scripts in production', () => {
    const csp = contentSecurityPolicy({ nonce: 'abc', dev: false });
    expect(directive(csp, 'style-src')).toBe("style-src 'self' 'nonce-abc'");
    expect(directive(csp, 'script-src')).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe');
  });

  it("relaxes styles and eval only for Next.js's development tools", () => {
    const csp = contentSecurityPolicy({ nonce: 'abc', dev: true });
    expect(directive(csp, 'style-src')).toBe("style-src 'self' 'unsafe-inline'");
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'");
  });

  it('adds the allowed connection origins', () => {
    const csp = contentSecurityPolicy({
      nonce: 'n',
      dev: false,
      connectSrc: ['https://api.example.ng', 'wss://api.example.ng'],
    });
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://api.example.ng wss://api.example.ng",
    );
  });
});
