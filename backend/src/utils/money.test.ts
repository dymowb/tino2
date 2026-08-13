import {
  PLATFORM_CURRENCY,
  currencyExponent,
  fromStripeMinorUnits,
  roundMajorUnits,
  toStripeMinorUnits,
} from './money';

describe('money conversion', () => {
  describe('toStripeMinorUnits', () => {
    it('converts the audit exact-value cases', () => {
      expect(toStripeMinorUnits(0.5, 'BRL')).toBe(50);
      expect(toStripeMinorUnits(100.0, 'BRL')).toBe(10000);
      expect(toStripeMinorUnits(275, 'BRL')).toBe(27500);
      expect(toStripeMinorUnits(148, 'BRL')).toBe(14800);
    });

    it('does not multiply zero-decimal currencies', () => {
      // The bug this prevents: ¥100 sent as 10000 is a 100x overcharge.
      expect(toStripeMinorUnits(100, 'JPY')).toBe(100);
      expect(toStripeMinorUnits(1500, 'KRW')).toBe(1500);
    });

    it('rounds rather than truncating float artifacts', () => {
      // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
      expect(toStripeMinorUnits(19.99, 'BRL')).toBe(1999);
      expect(toStripeMinorUnits(0.07, 'BRL')).toBe(7);
      expect(toStripeMinorUnits(1.005, 'BRL')).toBe(101);
    });

    it('is case-insensitive about the currency code', () => {
      expect(toStripeMinorUnits(100, 'jpy')).toBe(100);
      expect(toStripeMinorUnits(100, 'brl')).toBe(10000);
    });

    it('refuses non-finite amounts instead of sending NaN to Stripe', () => {
      expect(() => toStripeMinorUnits(NaN, 'BRL')).toThrow();
      expect(() => toStripeMinorUnits(Infinity, 'BRL')).toThrow();
    });
  });

  describe('fromStripeMinorUnits', () => {
    it('round-trips major units', () => {
      for (const amount of [0.5, 19.99, 100, 275, 999999.99]) {
        expect(fromStripeMinorUnits(toStripeMinorUnits(amount, 'BRL'), 'BRL')).toBeCloseTo(
          amount,
          2
        );
      }
    });

    it('round-trips zero-decimal currencies', () => {
      expect(fromStripeMinorUnits(toStripeMinorUnits(100, 'JPY'), 'JPY')).toBe(100);
    });
  });

  describe('currencyExponent', () => {
    it('reports 2 for decimal currencies and 0 for zero-decimal ones', () => {
      expect(currencyExponent('BRL')).toBe(2);
      expect(currencyExponent('USD')).toBe(2);
      expect(currencyExponent('JPY')).toBe(0);
      expect(currencyExponent('VND')).toBe(0);
    });
  });

  describe('roundMajorUnits', () => {
    it('clamps derived values to the currency precision', () => {
      // 275 * 0.029 + 0.30 = 8.275 -> must not persist into numeric(10,2) as-is.
      expect(roundMajorUnits(275 * 0.029 + 0.3, 'BRL')).toBe(8.28);
      expect(roundMajorUnits(13.75, 'BRL')).toBe(13.75);
      expect(roundMajorUnits(13.756, 'JPY')).toBe(14);
    });
  });

  describe('platform currency', () => {
    it('is BRL — every price in the product is quoted in reais', () => {
      expect(PLATFORM_CURRENCY).toBe('BRL');
    });
  });
});
