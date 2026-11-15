import {
  type Faker,
  fakerAR,
  fakerDE,
  fakerEN,
  fakerEN_GB,
  fakerEN_IN,
  fakerES,
  fakerFR,
  fakerIT,
  fakerJA,
  fakerKO,
  fakerNL,
  fakerPL,
  fakerPT_BR,
  fakerSV,
  fakerTR,
  fakerZH_CN,
} from '@faker-js/faker';

/**
 * Every date is generated relative to this instant, so the dataset is identical
 * across restarts and replicas. Bump DATA_VERSION when generators change shape.
 */
export const REFERENCE_DATE = new Date('2026-01-01T00:00:00.000Z');
export const DATA_VERSION = '1';

export const LOCALES = {
  en: fakerEN,
  en_GB: fakerEN_GB,
  en_IN: fakerEN_IN,
  de: fakerDE,
  fr: fakerFR,
  es: fakerES,
  it: fakerIT,
  nl: fakerNL,
  pl: fakerPL,
  sv: fakerSV,
  tr: fakerTR,
  pt_BR: fakerPT_BR,
  ar: fakerAR,
  ja: fakerJA,
  ko: fakerKO,
  zh_CN: fakerZH_CN,
} as const satisfies Record<string, Faker>;

export type LocaleCode = keyof typeof LOCALES;
export const LOCALE_CODES = Object.keys(LOCALES) as LocaleCode[];
export const DEFAULT_LOCALE: LocaleCode = 'en';

for (const faker of Object.values(LOCALES)) {
  faker.setDefaultRefDate(REFERENCE_DATE);
}

export function isLocale(value: string): value is LocaleCode {
  return Object.hasOwn(LOCALES, value);
}

/** FNV-1a 32-bit: a fast, stable hash used to derive one seed per entity. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
