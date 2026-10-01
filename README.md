# Terminology Translator

A Vercel-ready app that translates English into any language with a glossary, with deterministic glossary matching, protected terms, overlap resolution, HTML checks, and one automatic repair attempt.

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

## Glossaries and target languages

Each target language has one glossary file in `data/`, named `<locale>.glossary.csv`, where `<locale>` is a BCP 47 code with or without a region:

```
data/ar.glossary.csv      → Arabic
data/fr.glossary.csv      → French
data/es-MX.glossary.csv   → Spanish (Mexico) · español (México)
data/pt-BR.glossary.csv   → Portuguese (Brazil) · português (Brasil)
```

To add a language, add its file and redeploy; it appears in the UI's "Translate into" picker automatically. Display names come from the code (`Intl.DisplayNames`), and right-to-left layout is applied automatically for Arabic, Hebrew, Persian, Urdu, and other RTL scripts. Codes are normalized, so `pt-br.glossary.csv` is listed as `pt-BR`. A file with an invalid code, a parse error, or a mismatched language column is skipped (the reason is logged) and the other languages keep working.

Each file uses the exported Copy.ai table columns plus `Match Level` and `Enforcement`. The `Target Language` column is optional: the filename decides the language. If a row does fill it in, it must match the file's code or its base language (`es` is fine in `es-MX.glossary.csv`); otherwise the file is rejected so copy-paste mistakes are caught.

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

## Viewing the glossaries

`/glossaries` shows every `data/<locale>.glossary.csv` as a read-only table: English term, required output, whether it is translated or kept in English, match level, enforcement, who revised it, and when. Use the ‹ › buttons, the dropdown, or the ← → keys to move between languages one at a time. Search covers terms and translations, the chips filter by type, and results are paged 25 at a time. Everything runs on the server, so large glossaries stay fast and the page works without JavaScript.

The translate page links to it from the Applied terminology section ("View the … glossary →"), and each applied term opens its own rule in the glossary for the language you translated into. The glossary page's "← Back to translate" link returns to the same language (`/?lang=fr`).

## API

The web form and other systems use the same endpoint.

### Authentication

Send a key as `Authorization: Bearer <key>`. Keys live in the `TRANSLATOR_API_KEYS` environment variable as comma-separated `name:key` pairs, one per caller, so a caller can be revoked by deleting its entry and redeploying:

```bash
openssl rand -hex 32          # generate a key (at least 32 characters)
# TRANSLATOR_API_KEYS=cms-prod:<key>,crm:<key>
```

Requests from the app's own pages (the web form) are accepted without a key. Everything else needs a key. Never commit keys.

**A key used from browser code can be copied by anyone who can see that code.** Give each browser-side caller its own key, keep the rate limits below in place, and rotate it if it leaks. For anything public-facing, call the API from a server instead.

### Browsers (CORS)

Set `TRANSLATOR_ALLOWED_ORIGINS` to a comma-separated list of exact origins (e.g. `https://app.example.com`). Listed origins can read responses, including errors, and preflight (`OPTIONS`) requests are answered without a key. CORS only controls which web pages can read responses; it does not authenticate anyone. If Vercel Authentication is enabled for the deployment, browsers get a login redirect on the preflight and the call fails, so disable it for production.

### Endpoints

`POST /api/translate` (JSON body):

| Field | Required | Notes |
| --- | --- | --- |
| `text` | yes | Up to 50,000 characters. |
| `language` | yes | A code from `GET /api/languages`, e.g. `ar`, `es-MX`. |
| `format` | no | `text`, `json`, or `xml`. Detected from `filename` or the content when omitted. |
| `filename` | no | Only used to detect the format. |

```bash
curl https://YOUR-APP/api/translate \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"text": "Rain Bird valves last longer.", "language": "es-MX"}'
```

The response contains `translation`, `format`, `language`, `matches` (glossary terms applied), `validation`, and `glossarySize`. XML is translated in place with its markup untouched; JSON keeps its keys and structure.

`GET /api/languages` lists the available target languages as `{ languages: [{ code, englishName, nativeName, dir }] }`.

### Errors

Every error is `{ "error": { "code": "...", "message": "..." } }`, and every response carries an `X-Request-Id` header (also in the logs).

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Not JSON, wrong content type, missing `text`, or an unknown `format`. |
| 400 | `unsupported_language` | No glossary for `language`; the body lists `available` codes. |
| 401 | `unauthorized` | Missing or wrong key. |
| 413 | `too_large` | More than 50,000 characters. |
| 422 | `invalid_document` | Malformed XML or JSON, or no translatable text. |
| 422 | `validation_failed` | The translation failed the glossary or structure checks after one retry. |
| 429 | `rate_limited` | Per-key limit reached; see `Retry-After`. |
| 502 | `upstream_error` | The model provider failed or timed out. |
| 500 | `internal_error` | Anything else. |

Requests are synchronous and can take a minute or more for large documents; the function limit is 300 seconds.

### Rate limits

API keys are limited to 30 requests per minute and 500,000 characters per day each (`TRANSLATOR_RATE_PER_MINUTE`, `TRANSLATOR_DAILY_CHARS`). The counters live in Upstash Redis, added from the Vercel Marketplace, which provides `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*` equivalents). **Without those variables, or if the store is unreachable, limiting is skipped and a warning is logged.** The web form is not rate limited.

The full contract is in [docs/openapi.yaml](docs/openapi.yaml).

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import the repository in Vercel.
3. Add the three model environment variables under Project Settings → Environment Variables.
4. Deploy.

No Vercel-specific build configuration is required for this Next.js project. Add authentication or deployment protection before sharing a cost-bearing endpoint publicly.

## Current scope

- Choose any target language with a glossary in `data/`.
- Paste or drop text, HTML, JSON, or XML (.txt, .json, .xml, .html, .htm, .md) and translate it; download the result as `<name>.<locale>.<ext>`.
- JSON is translated as one document and rejected if keys, array lengths, or non-string values change.
- XML markup never reaches the model: text nodes and CDATA contents are translated as separate segments and spliced back into the original markup.
- Text inside internal XML elements listed in `UNTRANSLATED_ELEMENTS` (`lib/xml.ts`, default `<name>`) stays in English; add element names to that set to keep more fields untranslated.
- Preserve identity translations through placeholders.
- Select only glossary rules found in the submitted text.
- Validate exact terminology and byte-for-byte HTML tags.
- Retry once when validation fails.
- Limit requests to 50,000 characters.

PDF/DOCX upload is intentionally deferred. The API boundary already accepts extracted text, so those extractors can be added without changing the matching or translation pipeline.
