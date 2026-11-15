import type { Faker } from '@faker-js/faker';
import { Decimal, Nested, Text } from './fields.js';

export class Geo {
  @Decimal(-90, 90, { example: 40.7128 }, 6)
  lat: number;

  @Decimal(-180, 180, { example: -74.006 }, 6)
  lng: number;
}

export class Address {
  @Text(1, 120, { example: '742 Evergreen Terrace' })
  street: string;

  @Text(1, 60, { example: 'Apt. 12' }, true)
  suite: string | null;

  @Text(1, 80, { example: 'Springfield' })
  city: string;

  @Text(1, 80, { example: 'Oregon' })
  state: string;

  @Text(1, 20, { example: '97403' })
  zipCode: string;

  @Text(2, 80, { example: 'United States' })
  country: string;

  @Text(2, 2, { example: 'US' })
  countryCode: string;

  @Nested(() => Geo)
  geo: Geo;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'code' });

export function fakeAddress(faker: Faker): Address {
  const countryCode = faker.location.countryCode('alpha-2');
  return {
    street: faker.location.streetAddress(),
    suite: faker.datatype.boolean({ probability: 0.3 }) ? faker.location.secondaryAddress() : null,
    city: faker.location.city(),
    state: faker.location.state(),
    zipCode: faker.location.zipCode(),
    // Country name matches the code (faker's country() and countryCode() are independent).
    country: regionNames.of(countryCode) ?? countryCode,
    countryCode,
    geo: {
      lat: faker.location.latitude({ min: -55, max: 70, precision: 6 }),
      lng: faker.location.longitude({ precision: 6 }),
    },
  };
}

/** Deterministic Picsum image: the same seed always renders the same picture. */
export const picsum = (seed: string, width: number, height: number) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const slugify = (faker: Faker, text: string) => faker.helpers.slugify(text).toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
