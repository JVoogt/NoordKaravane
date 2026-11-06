import { getCollection } from 'astro:content';
import { fill } from './business';
import markdownToHtml, { extractHeadings } from './md';

type Name = 'legal' | 'pages';

/** Load one entry by id (file name without extension). Placeholders in the body and frontmatter are filled at render time. */
export async function getEntry(collection: Name, id: string) {
  let entries: Awaited<ReturnType<typeof getCollection<Name>>> = [];
  try { entries = await getCollection(collection); } catch { return null; }
  const e = entries.find((x) => x.id === id || x.id.replace(/\.(md|mdx)$/, '') === id);
  if (!e) return null;
  const filledBody = fill(e.body ?? '');
  const html = await markdownToHtml(filledBody);
  return {
    id: e.id,
    title: fill(e.data.title),
    description: fill(e.data.description),
    updated: e.data.updated,
    order: e.data.order ?? 999,
    html,
    headings: extractHeadings(html),
  };
}

export async function listEntries(collection: Name) {
  try {
    const all = await getCollection(collection);
    return all.map((e) => ({ id: e.id.replace(/\.(md|mdx)$/, ''), title: fill(e.data.title), description: fill(e.data.description), order: e.data.order ?? 999 })).sort((a, b) => a.order - b.order);
  } catch { return []; }
}

/** Home-page copy blocks from content/pages/home.md ("## key" sections). Optional: callers fall back to built-in copy. */
export async function homeBlocks(): Promise<Record<string, string>> {
  try {
    const all = await getCollection('pages');
    const e = all.find((x) => x.id.replace(/\.(md|mdx)$/, '') === 'home');
    if (!e?.body) return {};
    const body = fill(e.body).replace(/<!--[\s\S]*?-->/g, '');
    const out: Record<string, string> = {};
    for (const part of body.split(/^## /m).slice(1)) {
      const nl = part.indexOf('\n');
      out[part.slice(0, nl).trim().replace(/:$/, '')] = part.slice(nl + 1).trim();
    }
    return out;
  } catch { return {}; }
}

export function field(block: string | undefined, label: string): string | undefined {
  return block?.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`))?.[1]?.trim();
}
/** Paragraph text of a block, excluding **Label:** lines, lists and Link lines. */
export function paragraphs(block: string | undefined): string[] {
  return (block ?? '').split(/\n{2,}/).map((s) => s.trim()).filter((s) => s && !s.startsWith('**') && !s.startsWith('-') && !/^\d\./.test(s) && !s.startsWith('Link') && !s.startsWith('###'));
}
export function routeBlurbs(block: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (block ?? '').split(/^### /m).slice(1)) {
    const [name, ...rest] = part.split('\n');
    const para = rest.join('\n').split(/\n{2,}/).map((s) => s.trim()).find((s) => s && !s.startsWith('Link'));
    if (para) out[name.trim().toLowerCase()] = para;
  }
  return out;
}
