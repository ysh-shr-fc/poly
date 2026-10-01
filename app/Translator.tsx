"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ACCEPTED_EXTENSIONS,
  MAX_CHARACTERS,
  detectFormat,
  formatLabel,
  isAcceptedFile,
  translatedFilename,
  type DocumentFormat,
} from "@/lib/formats";
import { glossaryHref } from "@/lib/glossary-view";
import type { TargetLanguage } from "@/lib/languages";
import Topbar from "./Topbar";

type Match = {
  source: string;
  matchedText: string;
  target: string;
  ruleType: "translate" | "preserve";
  matchLevel: string;
  enforcement: string;
};

type Result = {
  format: DocumentFormat;
  language: TargetLanguage;
  translation: string;
  matches: Match[];
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  glossarySize: number;
};

const EXAMPLE = "Rain Bird valves use a balanced pressure diaphragm to maintain a consistent flow rate.";
const LANGUAGE_KEY = "targetLanguage";

function defaultLanguage(languages: TargetLanguage[]): string {
  return (languages.find((language) => language.code === "ar") ?? languages[0]).code;
}

// `initialLanguage` comes from ?lang= (e.g. returning from the glossary page) and wins over the remembered choice.
export default function Translator({ languages, initialLanguage }: { languages: TargetLanguage[]; initialLanguage?: string }) {
  const [source, setSource] = useState("");
  const [languageCode, setLanguageCode] = useState(() => initialLanguage ?? defaultLanguage(languages));
  const language = languages.find((candidate) => candidate.code === languageCode) ?? languages[0];
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const characters = useMemo(() => new Intl.NumberFormat().format(source.length), [source.length]);
  const format = useMemo(() => detectFormat(source, fileName || undefined), [source, fileName]);

  // Restored after mount so the server and first client render agree.
  useEffect(() => {
    if (initialLanguage) return;
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      if (saved && languages.some((candidate) => candidate.code === saved)) setLanguageCode(saved);
    } catch {}
  }, [languages, initialLanguage]);

  function chooseLanguage(code: string) {
    setLanguageCode(code);
    setResult(null);
    try {
      localStorage.setItem(LANGUAGE_KEY, code);
    } catch {}
  }

  // Stop the browser from opening a file dropped outside the drop zone.
  useEffect(() => {
    const block = (event: globalThis.DragEvent) => event.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (!isAcceptedFile(file.name)) {
      setError(`${file.name} isn't supported. Use one of: ${ACCEPTED_EXTENSIONS.join(", ")}.`);
      return;
    }
    const text = await file.text();
    if (text.includes("\u0000")) {
      setError(`${file.name} looks like a binary file, not text.`);
      return;
    }
    if (text.length > MAX_CHARACTERS) {
      setError(`${file.name} has ${new Intl.NumberFormat().format(text.length)} characters; the limit is 50,000.`);
      return;
    }
    setSource(text.replace(/^\uFEFF/, ""));
    setFileName(file.name);
    setResult(null);
    setError("");
  }

  function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length > 1) setError("Drop one file at a time; only the first was loaded.");
    void loadFile(event.dataTransfer.files[0]);
  }

  function clearFile() {
    setFileName("");
    setSource("");
    setResult(null);
  }

  function downloadResult() {
    if (!result) return;
    const type = result.format === "xml" ? "application/xml" : result.format === "json" ? "application/json" : "text/plain";
    const url = URL.createObjectURL(new Blob([result.translation], { type: `${type};charset=utf-8` }));
    const link = document.createElement("a");
    link.href = url;
    link.download = translatedFilename(result.format, result.language.code, fileName || undefined);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function translate() {
    if (!source.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source, format, language: language.code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error((typeof body.error === "string" ? body.error : body.error?.message) || "Translation failed.");
      setResult(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Translation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (result) await navigator.clipboard.writeText(result.translation);
  }

  const outputName = translatedFilename(format, language.code, fileName || undefined);

  return (
    <>
      <Topbar page="Translate" />

      <main>
        <div className="pagehead">
          <h1>English to {language.englishName}</h1>
          <p>{languages.length} target language{languages.length === 1 ? "" : "s"} · glossary controlled</p>
        </div>

        <section className="workspace" aria-label="Translation workspace">
          <article
            className={`card sourceCard ${dragging ? "dragging" : ""}`}
            onDragEnter={onDragEnter}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="cardhead">
              <span className="label">Source</span>
              <div className="field"><div className="icon">T</div><div className="value">English</div></div>
              <div className="actions">
                <button className="ghost" type="button" onClick={() => fileInput.current?.click()}>Open file</button>
                <button className="ghost" type="button" onClick={() => { setSource(EXAMPLE); setFileName(""); setResult(null); }}>Use example</button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_EXTENSIONS.join(",")}
                hidden
                onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }}
              />
            </div>
            {fileName && (
              <div className="strip">
                <span>{fileName}</span>
                <button className="stripAction" type="button" onClick={clearFile} aria-label={`Remove ${fileName}`}>Remove</button>
              </div>
            )}
            <textarea
              className={format !== "text" ? "code" : ""}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Paste text, HTML, JSON or XML here, or drop a .txt, .json, .xml or .html file…"
              aria-label="English source text"
              spellCheck={format === "text"}
            />
            <div className="dropOverlay" aria-hidden="true">Drop to load file</div>
            <div className="foot"><span>{characters} / 50,000 characters</span><span className="pill">{formatLabel(format)}</span></div>
          </article>

          <article className="card">
            <div className="cardhead">
              <span className="label">Target</span>
              <div className="field"><div className="icon">T</div><div className="value">{language.englishName}</div></div>
              <div className="actions">
                <button className="ghost" type="button" disabled={!result} onClick={copyResult}>Copy result</button>
                <button className="ghost" type="button" disabled={!result} onClick={downloadResult}>Download</button>
              </div>
            </div>
            {fileName && (
              <div className="strip">
                <span>{outputName}</span>
                <span className="stripNote">Output file</span>
              </div>
            )}
            <div
              className={`output ${!result ? "empty" : ""} ${result && result.format !== "text" ? "code" : ""}`}
              dir={result && result.format !== "text" ? "ltr" : (result?.language ?? language).dir}
              lang={result?.language.code ?? language.code}
            >
              {loading ? <div className="loading"><span /><span /><span /></div> : result?.translation || "The translation will appear here"}
            </div>
            <div className="foot">
              <span>{result ? `${result.matches.length} glossary matches` : "Glossary checked automatically"}</span>
              <span className="ok">{result?.validation.valid ? "Validated" : ""}</span>
            </div>
          </article>
        </section>

        <div className="actionrow">
          <label className="label" htmlFor="targetLanguage">Translate into</label>
          <div className="field">
            <div className="icon">T</div>
            <select
              id="targetLanguage"
              value={language.code}
              onChange={(event) => chooseLanguage(event.target.value)}
              disabled={loading}
            >
              {languages.map((candidate) => (
                <option key={candidate.code} value={candidate.code}>
                  {candidate.englishName === candidate.nativeName
                    ? candidate.englishName
                    : `${candidate.englishName} · ${candidate.nativeName}`}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" type="button" onClick={translate} disabled={!source.trim() || loading}>
            {loading ? "Translating…" : "Translate"}<span aria-hidden="true">→</span>
          </button>
          <span className="note">Glossary rules are checked automatically.</span>
        </div>

        {error && (
          <section className="errorPanel" role="alert" aria-live="assertive">
            <div className="errorHead">
              <strong>Error details</strong>
              <button className="textButton" type="button" onClick={() => navigator.clipboard.writeText(error)}>Copy error</button>
            </div>
            <pre>{error}</pre>
          </section>
        )}

        <section className="terminology" aria-live="polite">
          <div className="sectionhead">
            <div><span className="label">Applied terminology</span><h2>{result ? `${result.matches.length} matches in this submission` : "Terms will appear after translation"}</h2></div>
            <div className="sectionlinks">
              <Link className="textlink" href={glossaryHref(language.code)}>View the {language.englishName} glossary →</Link>
              {result && <span className="sub">{result.glossarySize} rules loaded</span>}
            </div>
          </div>
          {result?.matches.length ? (
            <div className="termGrid">
              {result.matches.map((match, index) => (
                <Link className="term" key={`${match.source}-${index}`} href={glossaryHref(result.language.code, { q: match.source })} title={`Open this rule in the ${result.language.englishName} glossary`}>
                  <div><strong>{match.matchedText}</strong><span>{match.ruleType === "preserve" ? "Preserved" : match.matchLevel.replace(/_/g, " ")}</span></div>
                  <b className="arrow" aria-hidden="true">→</b>
                  <div className="target" dir={result.language.dir} lang={result.language.code}><strong>{match.target}</strong><span>{match.enforcement}</span></div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="emptyTerms">The service selects only the glossary entries that occur in the source text.</div>
          )}
        </section>
      </main>
    </>
  );
}
