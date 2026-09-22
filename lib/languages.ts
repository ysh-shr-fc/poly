// Shared by the browser and the server, so keep this free of Node imports.

export type TargetLanguage = {
  code: string;
  englishName: string;
  nativeName: string;
  dir: "ltr" | "rtl";
};

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

// Returns the canonical BCP 47 form (e.g. "pt-br" → "pt-BR"), or null if invalid.
export function canonicalLocale(code: string): string | null {
  try {
    return Intl.getCanonicalLocales(code)[0] ?? null;
  } catch {
    return null;
  }
}

function displayName(code: string, inLocale: string): string {
  try {
    return new Intl.DisplayNames([inLocale], { type: "language", languageDisplay: "standard" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function describeLanguage(code: string): TargetLanguage {
  const base = code.split("-")[0].toLowerCase();
  return {
    code,
    englishName: displayName(code, "en"),
    nativeName: displayName(code, code),
    dir: RTL_LANGUAGES.has(base) ? "rtl" : "ltr",
  };
}
