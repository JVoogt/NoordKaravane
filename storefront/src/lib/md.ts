import { Marked } from 'marked';
import { slugify, decodeEntities } from './format';

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, '');
      return `<h${depth} id="${slugify(decodeEntities(plain))}">${text}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const ext = /^https?:\/\//.test(href);
      return `<a href="${href}"${title ? ` title="${title}"` : ''}${ext ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
    },
  },
});

export default async function markdownToHtml(src: string): Promise<string> {
  return marked.parse(src, { async: false }) as string;
}

export function extractHeadings(html: string) {
  return [...html.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h\1>/g)].map((m) => ({ depth: Number(m[1]), id: m[2], text: decodeEntities(m[3].replace(/<[^>]+>/g, '')) }));
}
