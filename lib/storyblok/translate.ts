import { ApiError } from "../errors";
import type { TargetLanguage } from "../languages";
import { translateSegments } from "../segments";
import type { GlossaryRule } from "../types";
import { applyTranslations, collectJobs } from "./collect";
import type { TranslatableSchema } from "./schema";

export const MAX_STORY_CHARACTERS = 200_000;

export type StoryTranslation = {
  fieldsTranslated: number;
  segments: number;
  skipped: { existing: number; empty: number };
  matches: Awaited<ReturnType<typeof translateSegments>>["matches"];
};

// Translates every Translatable text/rich-text field in `content` and writes the results beside the originals.
// Mutates `content`. Nothing is written if any segment fails, because translateSegments throws before applying.
export async function translateStoryContent(
  content: unknown,
  schema: TranslatableSchema,
  target: { i18nSuffix: string; language: TargetLanguage; rules: GlossaryRule[] },
  options: { overwrite?: boolean; maxCharacters?: number } = {},
): Promise<StoryTranslation> {
  const { jobs, skipped } = collectJobs(content, schema, target.i18nSuffix, options.overwrite);
  const segments = jobs.flatMap((job) => job.segments);
  const characters = segments.reduce((sum, segment) => sum + segment.length, 0);
  const limit = options.maxCharacters ?? MAX_STORY_CHARACTERS;
  if (characters > limit) {
    throw new ApiError("too_large", `This story has ${characters.toLocaleString("en-US")} translatable characters; the limit is ${limit.toLocaleString("en-US")}.`);
  }
  if (!segments.length) return { fieldsTranslated: 0, segments: 0, skipped, matches: [] };

  const { translations, matches } = await translateSegments(segments, target.rules, target.language);
  applyTranslations(jobs, translations, target.i18nSuffix);
  return { fieldsTranslated: jobs.length, segments: segments.length, skipped, matches };
}
