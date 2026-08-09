// Feature: flashflow-v2-upgrade, Property 12: i18n fallback never empty
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { translate } from '../LanguageContext';
import { resources } from '../locales';

describe('i18n translate()', () => {
  // --- Unit Tests ---

  describe('unit tests', () => {
    it('returns correct Vietnamese translation for known key', () => {
      expect(translate('app_name', 'vi')).toBe('FlashFlow');
      expect(translate('close', 'vi')).toBe('Đóng');
      expect(translate('loading', 'vi')).toBe('Đang tải...');
    });

    it('returns correct English translation for known key', () => {
      expect(translate('app_name', 'en')).toBe('FlashFlow');
      expect(translate('close', 'en')).toBe('Close');
      expect(translate('loading', 'en')).toBe('Loading...');
    });

    it('returns the key itself for unknown keys (vi)', () => {
      expect(translate('this_key_does_not_exist', 'vi')).toBe('this_key_does_not_exist');
    });

    it('returns the key itself for unknown keys (en)', () => {
      expect(translate('another_missing_key', 'en')).toBe('another_missing_key');
    });

    it('never returns empty string for any known key', () => {
      const viKeys = Object.keys(resources.vi);
      for (const key of viKeys) {
        const viResult = translate(key, 'vi');
        expect(viResult.length).toBeGreaterThan(0);
        const enResult = translate(key, 'en');
        expect(enResult.length).toBeGreaterThan(0);
      }
    });
  });

  // --- Property-Based Tests ---

  describe('property-based tests', () => {
    /**
     * **Validates: Requirements 6.5**
     * Property 12: For any translation key and locale, t(key) SHALL return the translation
     * if it exists, or return the key itself if no translation exists.
     * The result is NEVER an empty string.
     */
    it('t() never returns empty string for any random key and locale', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.constantFrom('vi' as const, 'en' as const),
          (key, locale) => {
            const result = translate(key, locale);
            return result.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 6.5**
     * Property 12: If a translation exists for the key, t() returns that translation.
     */
    it('t() returns the translation value when key exists in locale', () => {
      const knownKeys = Object.keys(resources.vi);
      fc.assert(
        fc.property(
          fc.constantFrom(...knownKeys),
          fc.constantFrom('vi' as const, 'en' as const),
          (key, locale) => {
            const dict = resources[locale] as Record<string, string>;
            const result = translate(key, locale);
            if (dict[key] && dict[key].length > 0) {
              return result === dict[key];
            }
            // If no translation, should return key itself
            return result === key;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 6.5**
     * Property 12: For unknown keys, t() returns the key itself (fallback).
     */
    it('t() returns key itself for keys not in the dictionary', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => !(s in resources.vi) && !(s in resources.en)),
          fc.constantFrom('vi' as const, 'en' as const),
          (key, locale) => {
            const result = translate(key, locale);
            return result === key;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
