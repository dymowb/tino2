import { describe, expect, it } from 'vitest';
import { toInternalPath } from './internalPath';

describe('toInternalPath', () => {
  it('accepts in-app paths, including query strings and fragments', () => {
    expect(toInternalPath('/bookings')).toBe('/bookings');
    expect(toInternalPath('/bookings?quoteId=abc#top')).toBe('/bookings?quoteId=abc#top');
    expect(toInternalPath('  /messages?conversationId=1  ')).toBe('/messages?conversationId=1');
  });

  it('rejects anything that can leave the origin or execute', () => {
    const hostile = [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/bookings\\..\\evil',
      // eslint-disable-next-line no-script-url
      'javascript:alert(1)',
      // eslint-disable-next-line no-script-url
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:someone@example.com',
      'bookings',
      '/book\nings',
      '',
      '   ',
    ];

    for (const value of hostile) {
      expect(toInternalPath(value), value).toBeNull();
    }
  });

  it('rejects non-string values', () => {
    expect(toInternalPath(undefined)).toBeNull();
    expect(toInternalPath(null)).toBeNull();
    expect(toInternalPath(42)).toBeNull();
    expect(toInternalPath({ toString: () => '/bookings' })).toBeNull();
  });
});
