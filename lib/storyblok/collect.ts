import type { FieldKind, TranslatableSchema } from "./schema";
import { extractRichtext, type RtNode } from "./richtext";

export type Job = {
  holder: Record<string, unknown>;
  field: string;
  kind: FieldKind;
  segments: string[];
  build: (translated: string[]) => unknown;
};

export type Collected = { jobs: Job[]; skipped: { existing: number; empty: number } };

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasText = (value: unknown): value is string => typeof value === "string" && /\p{L}/u.test(value);

function hasTranslation(value: unknown, kind: FieldKind): boolean {
  if (kind === "text") return typeof value === "string" && value.trim() !== "";
  return isObject(value) && Array.isArray(value.content) && value.content.length > 0;
}

// Walks a story's content for components with Translatable text fields. Nested blocks are reached through
// every array/object (including blocks embedded in rich text); existing `__i18n__` values are skipped
// unless `overwrite` is set, and are never walked themselves.
export function collectJobs(content: unknown, schema: TranslatableSchema, i18nSuffix: string, overwrite = false): Collected {
  const jobs: Job[] = [];
  const skipped = { existing: 0, empty: 0 };

  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!isObject(value)) return;

    const fields = typeof value.component === "string" ? schema[value.component] : undefined;
    for (const [field, kind] of Object.entries(fields ?? {})) {
      const current = value[field];
      if (!overwrite && hasTranslation(value[`${field}__i18n__${i18nSuffix}`], kind)) {
        skipped.existing += 1;
      } else if (kind === "text") {
        if (hasText(current)) {
          const text = current.trim();
          const lead = current.slice(0, current.indexOf(text));
          const tail = current.slice(lead.length + text.length);
          jobs.push({ holder: value, field, kind, segments: [text], build: ([translated]) => lead + translated + tail });
        } else {
          skipped.empty += 1;
        }
      } else if (isObject(current) && current.type === "doc") {
        const { segments, build } = extractRichtext(current as RtNode);
        if (segments.length) jobs.push({ holder: value, field, kind, segments, build });
        else skipped.empty += 1;
      } else {
        skipped.empty += 1;
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (!key.includes("__i18n__")) visit(child);
    }
  };

  visit(content);
  return { jobs, skipped };
}

// Writes each job's translation next to the original as `<field>__i18n__<suffix>`; the originals are not touched.
export function applyTranslations(jobs: Job[], translations: string[], i18nSuffix: string): void {
  // Build every value first so a failure leaves the content untouched.
  let offset = 0;
  const values = jobs.map((job) => {
    const slice = translations.slice(offset, offset + job.segments.length);
    offset += job.segments.length;
    return job.build(slice);
  });
  jobs.forEach((job, index) => {
    job.holder[`${job.field}__i18n__${i18nSuffix}`] = values[index];
  });
}
