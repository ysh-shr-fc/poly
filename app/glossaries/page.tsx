import type { Metadata } from "next";
import Link from "next/link";
import { listGlossaries, loadGlossary } from "@/lib/glossary";
import { glossaryHref, parseFilter, parsePage, splitMatch, viewGlossary, type RuleFilter } from "@/lib/glossary-view";
import { canonicalLocale } from "@/lib/languages";
import Topbar from "../Topbar";
import GlossaryControls from "./GlossaryControls";

export const metadata: Metadata = { title: "Glossaries · CopyGlot" };

type Params = { [key: string]: string | string[] | undefined };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const fmt = (n: number) => n.toLocaleString("en-US");

function Highlight({ text, q }: { text: string; q: string }) {
  const [before, hit, after] = splitMatch(text, q);
  return hit ? <>{before}<mark>{hit}</mark>{after}</> : <>{text}</>;
}

// Read-only view of every data/<locale>.glossary.csv. Search, filtering and paging all happen on the server.
export default async function GlossariesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const languages = listGlossaries();
  if (!languages.length) {
    return (
      <>
        <Topbar page="Glossaries" />
        <main>
          <section className="errorPanel" role="alert">
            <div className="errorHead"><strong>No glossaries found</strong></div>
            <pre>Add at least one data/&lt;locale&gt;.glossary.csv file and redeploy.</pre>
          </section>
        </main>
      </>
    );
  }

  const wanted = canonicalLocale(first(params.lang) ?? "");
  const found = languages.findIndex((candidate) => candidate.code === wanted);
  const index = found >= 0 ? found : Math.max(0, languages.findIndex((candidate) => candidate.code === "ar"));
  const language = languages[index];

  const q = (first(params.q) ?? "").slice(0, 200).trim();
  const type: RuleFilter = parseFilter(first(params.type));
  const { rules } = loadGlossary(language.code);
  const view = viewGlossary(rules, { q, type, page: parsePage(first(params.page)) });
  const totalRules = languages.reduce((sum, candidate) => sum + loadGlossary(candidate.code).rules.length, 0);

  const prev = languages[(index - 1 + languages.length) % languages.length];
  const next = languages[(index + 1) % languages.length];
  const link = (code: string, overrides: { q?: string; type?: RuleFilter; page?: number } = {}) =>
    glossaryHref(code, { q, type, ...overrides });
  const options = languages.map((candidate) => ({
    code: candidate.code,
    label: candidate.englishName === candidate.nativeName ? candidate.englishName : `${candidate.englishName} · ${candidate.nativeName}`,
    href: link(candidate.code, { page: 1 }),
  }));

  const chip = (key: RuleFilter, text: string, count: number) => (
    <Link key={key} className={`seg ${type === key ? "on" : ""}`} href={link(language.code, { type: key, page: 1 })} aria-current={type === key ? "true" : undefined}>
      {text} <b>{fmt(count)}</b>
    </Link>
  );

  const filtered = Boolean(q) || type !== "all";
  const shown = view.matches
    ? `Showing ${fmt(view.start + 1)}–${fmt(view.start + view.rows.length)} of ${fmt(view.matches)} ${filtered ? "matching rules" : "rules"}`
    : "0 matching rules";

  return (
    <>
      <Topbar page="Glossaries" />
      <main>
        <div className="pagehead">
          <Link className="back" href={`/?lang=${language.code}`}>← Back to translate</Link>
          <h1>Glossaries</h1>
          <p>{languages.length} language{languages.length === 1 ? "" : "s"} · {fmt(totalRules)} rules in total</p>
        </div>

        <section className="card" aria-label="Glossary viewer">
          <div className="toolbar">
            <label className="label" htmlFor="glossaryLanguage">Glossary</label>
            <GlossaryControls
              options={options}
              current={language.code}
              prevHref={link(prev.code, { page: 1 })}
              nextHref={link(next.code, { page: 1 })}
              position={`${index + 1} of ${languages.length}`}
            />
            <span className="spacer" />
            <form className="searchform" action="/glossaries" method="get" role="search">
              <input type="hidden" name="lang" value={language.code} />
              {type !== "all" && <input type="hidden" name="type" value={type} />}
              <div className="field search">
                <div className="icon" aria-hidden="true">⌕</div>
                <input key={q} type="search" name="q" defaultValue={q} placeholder="Search terms or translations…" aria-label="Search glossary" maxLength={200} />
              </div>
            </form>
          </div>

          <div className="filters">
            {chip("all", "All rules", view.counts.all)}
            {chip("translate", "Translations", view.counts.translate)}
            {chip("preserve", "Kept in English", view.counts.preserve)}
            {q && <Link className="textlink clear" href={link(language.code, { q: "", page: 1 })}>Clear search</Link>}
          </div>

          <div className="tablewrap">
            <table>
              <caption className="sr">{language.englishName} glossary</caption>
              <thead>
                <tr>
                  <th scope="col" className="sorted">English term ↑</th>
                  <th scope="col" className="target-h" data-dir={language.dir}>Required output · {language.englishName}</th>
                  <th scope="col">Type</th>
                  <th scope="col">Match</th>
                  <th scope="col">Enforcement</th>
                  <th scope="col">Revised by</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {view.rows.length ? view.rows.map((rule) => (
                  <tr key={rule.source}>
                    <td className="termcell"><Highlight text={rule.source} q={q} /></td>
                    <td className="target" dir={language.dir} lang={language.code}><Highlight text={rule.target} q={q} /></td>
                    <td><span className={`pill ${rule.ruleType}`}>{rule.ruleType === "preserve" ? "Kept in English" : "Translate"}</span></td>
                    <td className="muted">{rule.matchLevel.replace(/_/g, " ")}</td>
                    <td>{rule.enforcement === "grammatical" ? <span className="pill flex">grammatical</span> : <span className="muted">exact</span>}</td>
                    <td className="muted">{rule.revisedBy || "—"}</td>
                    <td className="muted">{rule.date || "—"}</td>
                  </tr>
                )) : (
                  <tr className="empty"><td colSpan={7}>No {language.englishName} rules match{q ? ` “${q}”` : " these filters"}.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="foot tall">
            <span>{shown}</span>
            <div className="pager">
              {view.page > 1
                ? <Link className="ghost" href={link(language.code, { page: view.page - 1 })}>Previous</Link>
                : <span className="ghost disabled" aria-disabled="true">Previous</span>}
              <span>Page {view.page} of {view.pages}</span>
              {view.page < view.pages
                ? <Link className="ghost" href={link(language.code, { page: view.page + 1 })}>Next</Link>
                : <span className="ghost disabled" aria-disabled="true">Next</span>}
            </div>
          </div>
        </section>

        <p className="note">Read-only. To change a glossary, edit its file in <code>data/</code> (for example <code>{language.code}.glossary.csv</code>) and redeploy.</p>
      </main>
    </>
  );
}
