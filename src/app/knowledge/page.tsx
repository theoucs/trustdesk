import type { Metadata } from "next";
import Link from "next/link";
import { listDocs } from "@/lib/data/docs";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  const docs = listDocs();
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="mt-1 text-muted">
          The approved documents answers are drafted from. Each section is a citable source. Nothing outside these
          documents is used.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Document</th>
              <th className="px-4 py-2 font-medium">Sections</th>
              <th className="px-4 py-2 font-medium">Owner</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Last updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {docs.map((d) => (
              <tr key={d.slug} className="hover:bg-surface-muted">
                <td className="px-4 py-2.5">
                  <Link href={`/knowledge/${d.slug}`} className="font-medium text-accent hover:underline">
                    {d.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-muted">{d.sections.length}</td>
                <td className="px-4 py-2.5 text-muted">{d.owner}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{d.version}</td>
                <td className="px-4 py-2.5 text-muted">{d.lastUpdated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
