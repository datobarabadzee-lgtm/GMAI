'use client';

import { useState } from 'react';
import type { ComparisonTopic, GuidelineBody } from '@/knowledge/guidelines';
import type { Source } from '@/schemas/evidence';
import { Badge, Bullets, EmptyState, ExportBar, Panel } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export function GuidelineComparator({ bodies, topics, sources }: { bodies: GuidelineBody[]; topics: ComparisonTopic[]; sources: Source[] }) {
  const [activeId, setActiveId] = useState(topics[0]?.id ?? '');
  const [selectedBodies, setSelectedBodies] = useState<string[]>(topics[0]?.bodies ?? []);
  const topic = topics.find((t) => t.id === activeId);

  if (!topics.length) {
    return <EmptyState title="შედარებადი თემა არ არის" description="Guideline Comparator-ის რეესტრი ივსება ingestion pipeline-ით. დაამატეთ გაიდლაინები /dev/ingest გვერდიდან." />;
  }

  const shown = topic ? topic.bodies.filter((b) => selectedBodies.includes(b)) : [];

  const md = topic
    ? `# ${topic.questionKa}\n\n${shown.map((b) => `## ${bodies.find((x) => x.id === b)?.shortName}\n${topic.positions[b]}`).join('\n\n')}\n\n## კონსენსუსი\n${topic.consensus.map((c) => `- ${c}`).join('\n')}\n\n## განსხვავებები\n${topic.differences.map((c) => `- ${c}`).join('\n')}\n\n## განსხვავების მიზეზი\n${topic.reasonForDisagreement}\n\n## ვისზე ვრცელდება\n${topic.applicableGroups}\n\n## ქართული კონტექსტი\n${topic.georgiaContext}\n\n## უახლესი განახლება\n${topic.newestUpdate}\n\n## წყაროები\n${sources.filter((s) => shown.some((b) => bodies.find((x) => x.id === b)?.sourceId === s.source_id)).map((s) => `- ${s.citation_text}`).join('\n')}`
    : '';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Panel title="კლინიკური კითხვა" subtitle="აირჩიეთ თემა და შესადარებელი ორგანიზაციები">
        <div className="flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveId(t.id);
                setSelectedBodies(t.bodies);
              }}
              className={cn('rounded-full border px-3 py-1 text-xs transition', t.id === activeId ? 'border-cyan/50 bg-cyan/15 text-fg' : 'border-line text-slate-400 hover:text-slate-200')}
            >
              {t.questionKa}
            </button>
          ))}
        </div>
        {topic && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {topic.bodies.map((b) => {
              const body = bodies.find((x) => x.id === b);
              return (
                <label key={b} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', selectedBodies.includes(b) ? 'border-cyan/45 text-fg' : 'border-line text-slate-400')}>
                  <input type="checkbox" className="h-3 w-3 accent-cyan" checked={selectedBodies.includes(b)} onChange={(e) => setSelectedBodies((p) => (e.target.checked ? [...p, b] : p.filter((x) => x !== b)))} />
                  {body?.shortName}
                </label>
              );
            })}
          </div>
        )}
      </Panel>

      {topic && shown.length > 0 && (
        <>
          <Panel title="შედარების ცხრილი" subtitle={topic.questionEn} actions={<ExportBar text={md} json={topic} filename={`guideline-${topic.id}`} />}>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-ink-850/80">
                    <th className="w-[220px] border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">კლინიკური კითხვა</th>
                    {shown.map((b) => (
                      <th key={b} className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {bodies.find((x) => x.id === b)?.shortName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-b border-line/60 px-3 py-3 align-top text-slate-200">{topic.questionKa}</td>
                    {shown.map((b) => (
                      <td key={b} className="border-b border-line/60 px-3 py-3 align-top text-slate-300">
                        {topic.positions[b]}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="კონსენსუსი">
              <Bullets items={topic.consensus} />
            </Panel>
            <Panel title="განსხვავებები">
              <Bullets items={topic.differences} />
            </Panel>
            <Panel title="განსხვავების მიზეზი">
              <p className="text-sm leading-relaxed text-slate-300">{topic.reasonForDisagreement}</p>
            </Panel>
            <Panel title="ვისზე ვრცელდება">
              <p className="text-sm leading-relaxed text-slate-300">{topic.applicableGroups}</p>
            </Panel>
          </div>

          <Panel title="ქართული კონტექსტი" subtitle="ლოკალური ფაქტორები ცალკე ბლოკად — გლობალურ მტკიცებულებასთან შერევის გარეშე">
            <p className="text-sm leading-relaxed text-slate-300">{topic.georgiaContext}</p>
          </Panel>

          <Panel title="სიახლე და წყაროები" actions={<Badge tone="low">{topic.newestUpdate}</Badge>}>
            <ul className="space-y-2">
              {sources
                .filter((s) => shown.some((b) => bodies.find((x) => x.id === b)?.sourceId === s.source_id))
                .map((s) => (
                  <li key={s.source_id} className="rounded-lg border border-line bg-ink-850/40 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={s.freshness === 'current' ? 'low' : s.freshness === 'review_due' ? 'moderate' : 'neutral'}>{s.freshness}</Badge>
                      <Badge>{s.rights_status}</Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">{s.citation_text}</p>
                  </li>
                ))}
            </ul>
          </Panel>
        </>
      )}

      {topic && shown.length === 0 && <EmptyState title="აირჩიეთ მინიმუმ ერთი ორგანიზაცია" description="შედარებისთვის მონიშნეთ სულ მცირე ერთი გაიდლაინი." />}
    </div>
  );
}
