import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { sectionAnchor } from "@/lib/anchors";
import { getDoc, listDocs } from "@/lib/data/docs";

export function generateStaticParams() {
  return listDocs().map((d) => ({ doc: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/knowledge/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return { title: getDoc(doc)?.title ?? "Document" };
}

export default function DocPage({ params }: PageProps<"/knowledge/[doc]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading document…</p>}>
      <DocContent params={params} />
    </Suspense>
  );
}

async function DocContent({ params }: { params: PageProps<"/knowledge/[doc]">["params"] }) {
  const { doc: slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-3 text-[13px]">
          <Link href="/knowledge" className="text-muted hover:text-text">
            ← All documents
          </Link>
          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">Sections</p>
          <ul className="space-y-1.5">
            {doc.sections.map((s) => (
              <li key={s}>
                <a href={`#${sectionAnchor(s)}`} className="text-muted hover:text-text">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <article className="min-w-0 rounded-md border border-border bg-surface px-5 py-6 sm:px-8">
        <Link href="/knowledge" className="text-[13px] text-muted hover:text-text lg:hidden">
          ← All documents
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-xs text-muted">
          Version <span className="font-mono">{doc.version}</span> · Updated {doc.lastUpdated} · Owner: {doc.owner}
        </p>
        <div className="doc-body mt-4" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </article>
    </div>
  );
}
