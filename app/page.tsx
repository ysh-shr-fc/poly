import { listGlossaries } from "@/lib/glossary";
import { canonicalLocale } from "@/lib/languages";
import Translator from "./Translator";

// Each data/<locale>.glossary.csv becomes a target language in the picker.
export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const languages = listGlossaries();
  if (!languages.length) {
    return (
      <main>
        <section className="errorPanel" role="alert">
          <div className="errorHead"><strong>No glossaries found</strong></div>
          <pre>Add at least one data/&lt;locale&gt;.glossary.csv file (for example ar.glossary.csv or pt-BR.glossary.csv) and redeploy.</pre>
        </section>
      </main>
    );
  }

  const requested = (await searchParams).lang;
  const code = canonicalLocale((Array.isArray(requested) ? requested[0] : requested) ?? "");
  const initialLanguage = languages.find((language) => language.code === code)?.code;
  return <Translator languages={languages} initialLanguage={initialLanguage} />;
}
