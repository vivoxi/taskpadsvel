const CODE_CLASS =
  'rounded bg-[var(--panel-soft)] px-1 font-mono text-[0.85em] text-[var(--text-primary)]';
const LINK_CLASS = 'text-[var(--accent)] underline underline-offset-2 hover:opacity-80';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function restoreAllowedTags(escapedHtml: string): string {
  return escapedHtml
    .replace(/&lt;(\/?)(strong|em|s|br)&gt;/gi, '<$1$2>')
    .replace(/&lt;code(?:\s[^&]*?)?&gt;/gi, `<code class="${CODE_CLASS}">`)
    .replace(/&lt;\/code&gt;/gi, '</code>')
    .replace(
      /&lt;a\s+[^&]*?href=&quot;(https?:\/\/[^&"]+)&quot;[^&]*?&gt;/gi,
      (_match, href: string) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}">`
    )
    .replace(/&lt;\/a&gt;/gi, '</a>');
}

export function sanitizeRichTextHtml(html: string): string {
  return restoreAllowedTags(escapeHtml(html));
}

export function markdownToHtml(text: string): string {
  if (!text.trim()) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/gs, '<s>$1</s>');
  html = html.replace(/`([^`\n]+?)`/g, `<code class="${CODE_CLASS}">$1</code>`);
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}">$1</a>`
  );
  html = html.replace(/\n/g, '<br>');
  return html;
}

export function toRichTextHtml(text: string): string {
  if (/<\/?(?:strong|em|s|code|a|br)\b/i.test(text)) {
    return sanitizeRichTextHtml(text);
  }

  return markdownToHtml(text);
}
