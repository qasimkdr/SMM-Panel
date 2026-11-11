import { Fragment, type ReactNode } from "react";

/**
 * Tiny, safe Markdown renderer for admin-written pages (Terms, Privacy…).
 * Builds React elements — never injects HTML — so page content can't run scripts.
 * Supports: # ## ### headings, paragraphs, - / 1. lists, **bold**, *italic*, `code`, [links](https://…).
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|\/|mailto:)[^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-[0.9em]">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      const external = href!.startsWith("http");
      out.push(
        <a key={k} href={href} className="text-accent underline underline-offset-2" {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {label}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    const k = `l${blocks.length}`;
    blocks.push(
      <Tag key={k} className={list.ordered ? "list-decimal pl-6" : "list-disc pl-6"}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `${k}-${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1]!.length;
      const k = `h${blocks.length}`;
      const content = inline(h[2]!, k);
      blocks.push(level === 1 ? <h2 key={k}>{content}</h2> : level === 2 ? <h3 key={k}>{content}</h3> : <h4 key={k}>{content}</h4>);
    } else if (li) {
      flushPara();
      const ordered = Boolean(li[2]);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(li[3]!);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return (
    <div className="grid gap-4 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-4 [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mt-3 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:text-ink [&_h4]:font-semibold [&_h4]:text-ink [&_li]:mt-1">
      {blocks.length ? blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>) : <p className="text-ink-3">Nothing here yet.</p>}
    </div>
  );
}
