import Link from "next/link";

// Shared by the translate and glossary pages. The brand links back to the translate page.
export default function Topbar({ page }: { page: string }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/favicon.png" alt="" width={26} height={26} />
        <Link className="name" href="/">CopyGlot</Link>
        <span className="sep">/</span>
        <span className="page">{page}</span>
      </div>
      <span className="status"><i /> Ready</span>
    </header>
  );
}
