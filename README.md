# Terminology Translator

A Vercel-ready English-to-Arabic translation app with deterministic glossary matching, protected terms, overlap resolution, HTML checks, and one automatic repair attempt.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Configure the model

Set these server-side environment variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL` (optional, defaults to `https://api.openai.com/v1`)
- `OPENAI_TIMEOUT_MS` (optional, defaults to `120000`, or 120 seconds per model call)

The provider must expose an OpenAI-compatible `POST /chat/completions` endpoint. The browser never receives the API key.

The Vercel route allows up to 300 seconds so an initial translation and one validation-repair call can complete. A timed-out response identifies which of those stages exceeded the per-call timeout.

## Replace the sample glossary

Replace `data/glossary.csv` with the full exported Copy.ai table. Keep the existing columns and append `Match Level` and `Enforcement`:

```csv
Rule,Target Language,Term,Revised by,Date,Match Level,Enforcement
من الخزان إلى الرشاش,ar,reservoir-to-rotor,Asleif,2025.12.30,phrase,exact
Cycle + Soak™,ar,Cycle + Soak™,Asleif,2025.12.09,exact,exact
```

Allowed values:

- `Match Level`: `exact`, `case_insensitive`, `whole_word`, `phrase`, `inflected`
- `Enforcement`: `exact`, `grammatical`

`Term` is the English source and `Rule` is the required target output. When `Term` and `Rule` are identical after trimming, the loader treats the row as a protected term. Single-word entries default to `whole_word`; multiword entries default to `phrase`.

CSV order defines duplicate priority. Terms are compared case-insensitively, and the first row for a term supplies its target, match level, and enforcement. Later duplicates and case variants are ignored. For protected terms such as separate `CirrusPRO → CirrusPRO` and `CIRRUSPRO → CIRRUSPRO` rows, the first rule matches both while preserving the casing found in the source text.

The loader rejects conflicting duplicates. Matching happens only in visible text, never inside HTML tags. Longest overlapping phrases take precedence.

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import the repository in Vercel.
3. Add the three model environment variables under Project Settings → Environment Variables.
4. Deploy.

No Vercel-specific build configuration is required for this Next.js project. Add authentication or deployment protection before sharing a cost-bearing endpoint publicly.

## Current scope

- Paste or drop text, HTML, JSON, or XML (.txt, .json, .xml, .html, .htm, .md) and translate it to Arabic; download the result with the original extension.
- JSON is translated as one document and rejected if keys, array lengths, or non-string values change.
- XML markup never reaches the model: text nodes and CDATA contents are translated as separate segments and spliced back into the original markup.
- Preserve identity translations through placeholders.
- Select only glossary rules found in the submitted text.
- Validate exact terminology and byte-for-byte HTML tags.
- Retry once when validation fails.
- Limit requests to 50,000 characters.

PDF/DOCX upload is intentionally deferred. The API boundary already accepts extracted text, so those extractors can be added without changing the matching or translation pipeline.
