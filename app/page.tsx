import { listGlossaries } from "@/lib/glossary";
import Translator from "./Translator";

// Each data/<locale>.glossary.csv becomes a target language in the picker.
export default function Home() {
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
  return <Translator languages={languages} />;
}
