import { canonicalLocale, type TargetLanguage } from "../languages";

export type SpaceLanguage = { code: string; name?: string };

// Storyblok space codes look like "es", "pt-br" or "es_mx"; glossaries use canonical BCP 47 ("es-MX").
export function toGlossaryCode(spaceCode: string): string | null {
  return canonicalLocale(spaceCode.replace(/_/g, "-"));
}

// Translations are stored as `<field>__i18n__<code>` with underscores in the code, as configured in the space.
export function i18nSuffix(spaceCode: string): string {
  return spaceCode.replace(/-/g, "_");
}

export type OfferedLanguage = { spaceCode: string; language: TargetLanguage };

// Only languages that exist in both the space and the glossaries can be offered.
export function offeredLanguages(spaceLanguages: SpaceLanguage[], glossaries: TargetLanguage[]): OfferedLanguage[] {
  const byCode = new Map(glossaries.map((language) => [language.code, language]));
  const offered: OfferedLanguage[] = [];
  for (const { code } of spaceLanguages) {
    const glossaryCode = toGlossaryCode(code);
    const language = glossaryCode ? byCode.get(glossaryCode) : undefined;
    if (language) offered.push({ spaceCode: code, language });
  }
  return offered;
}
