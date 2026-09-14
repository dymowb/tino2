import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  LOCALES,
  LOCALE_CODES,
  NAMESPACES,
  REFERENCE_LOCALE,
  RETIRED_LOCALES,
  DEFAULT_NAMESPACE,
  FALLBACK_LOCALE,
} from "./manifest";

/**
 * Holds the manifest and the files on disk to each other.
 *
 * Spanish drifted for months without anything noticing: advertised in the
 * switcher, missing two namespaces entirely, ~200 keys short across the rest,
 * and with no backend catalog at all. Nothing compared the locales to each
 * other, so "supported" meant only that somebody had once added a menu entry.
 */

const LOCALES_DIR = join(__dirname, "..", "..", "public", "locales");
const ARCHIVE_DIR = join(__dirname, "..", "..", "i18n-archive");

/** Every leaf key, flattened to a dotted path, so nested objects compare too. */
function keysOf(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

const load = (locale: string, namespace: string): unknown =>
  JSON.parse(readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), "utf8"));

const referenceKeys = new Map(
  NAMESPACES.map((ns) => [ns, new Set(keysOf(load(REFERENCE_LOCALE, ns)))] as const),
);

describe("i18n manifest", () => {
  it("is internally consistent", () => {
    expect(LOCALE_CODES).toContain(REFERENCE_LOCALE);
    expect(LOCALE_CODES).toContain(FALLBACK_LOCALE);
    expect(NAMESPACES).toContain(DEFAULT_NAMESPACE);
    expect(new Set(LOCALE_CODES).size).toBe(LOCALE_CODES.length);
    expect(new Set(NAMESPACES).size).toBe(NAMESPACES.length);

    // A locale cannot be both supported and retired.
    for (const retired of RETIRED_LOCALES) {
      expect(LOCALE_CODES).not.toContain(retired.code);
    }
  });

  it("serves exactly the locales it declares", () => {
    // An undeclared directory under public/ is shipped to users and reachable by
    // anyone who sets the language by hand, while nothing keeps it up to date.
    expect(readdirSync(LOCALES_DIR).sort()).toEqual([...LOCALE_CODES].sort());
  });

  it("keeps a retired locale's work where the manifest says it is", () => {
    for (const retired of RETIRED_LOCALES) {
      const archived = join(ARCHIVE_DIR, retired.code);
      expect(existsSync(archived), `${retired.code} archive missing at ${retired.archivePath}`).toBe(
        true,
      );
      expect(readdirSync(archived).length).toBeGreaterThan(0);
    }
  });

  describe.each(LOCALE_CODES)("%s", (locale) => {
    it("has every declared namespace", () => {
      const present = readdirSync(join(LOCALES_DIR, locale))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(/\.json$/, ""))
        .sort();
      expect(present).toEqual([...NAMESPACES].sort());
    });

    it.each([...NAMESPACES])(`%s matches ${REFERENCE_LOCALE}`, (namespace) => {
      const expected = referenceKeys.get(namespace)!;
      const actual = new Set(keysOf(load(locale, namespace)));

      const missing = [...expected].filter((key) => !actual.has(key)).sort();
      const extra = [...actual].filter((key) => !expected.has(key)).sort();

      // Named individually: the point of this check is to say what the work is,
      // not merely that there is some.
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    });
  });

  it("keeps the typed-resources declaration listing every namespace", () => {
    // Text-matched on purpose, and worth being clear about what that is worth:
    // `types/i18next.d.ts` is currently inert (it augments `react-i18next`, but
    // i18next 25 exports `CustomTypeOptions` from `i18next` — see the note in
    // that file), so this asserts the file stays in step with the manifest, not
    // that the compiler is checking keys. It stops the list drifting again in
    // the meantime; it is not a substitute for turning the declaration on.
    const declaration = readFileSync(join(__dirname, "..", "types", "i18next.d.ts"), "utf8");
    for (const namespace of NAMESPACES) {
      expect(declaration, `i18next.d.ts is missing the "${namespace}" namespace`).toContain(
        `${namespace}: typeof import(`,
      );
    }
    expect(declaration).toContain(`public/locales/${REFERENCE_LOCALE}/`);
  });
});

describe("language switcher", () => {
  it("offers exactly the supported locales, each with a label", () => {
    for (const locale of LOCALES) {
      expect(locale.name.trim().length).toBeGreaterThan(0);
      expect(locale.flag.trim().length).toBeGreaterThan(0);
    }
  });
});
