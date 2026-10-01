"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type GlossaryOption = { code: string; label: string; href: string };

// Previous/next links work without JavaScript; the dropdown and the arrow keys are conveniences on top.
export default function GlossaryControls({
  options,
  current,
  prevHref,
  nextHref,
  position,
}: {
  options: GlossaryOption[];
  current: string;
  prevHref: string;
  nextHref: string;
  position: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") router.push(prevHref);
      if (event.key === "ArrowRight") router.push(nextHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prevHref, nextHref]);

  return (
    <>
      <Link className="icon-btn" href={prevHref} aria-label="Previous glossary">‹</Link>
      <div className="field picker">
        <div className="icon">T</div>
        <select
          id="glossaryLanguage"
          aria-label="Glossary language"
          value={current}
          onChange={(event) => {
            const next = options.find((option) => option.code === event.target.value);
            if (next) router.push(next.href);
          }}
        >
          {options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
        </select>
      </div>
      <Link className="icon-btn" href={nextHref} aria-label="Next glossary">›</Link>
      <span className="counter">{position}</span>
      <span className="hint"><kbd>←</kbd> <kbd>→</kbd> to switch</span>
    </>
  );
}
