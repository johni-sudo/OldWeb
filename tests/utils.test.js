import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  formatDuration,
  formatPrice,
  renderMarkdown,
} from '../public/assets/js/utils.js';

test('escapeHtml neutralises every HTML metacharacter', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
  );
});

test('markdown renderer supports the documented subset and escapes HTML', () => {
  const html = renderMarkdown(
    '# Title\n\nText with **bold**, *italic*, `code` and <script>alert(1)</script>.\n\n- One\n- Two\n\n> Quote\n\n[site](https://example.org) [bad](javascript:alert(1)) [proto](//evil.test)',
  );
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>Quote<\/p><\/blockquote>/);
  assert.match(html, /href="https:\/\/example.org"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /href="\/\/evil/);
});

test('markdown renderer handles code fences and ordered lists', () => {
  const html = renderMarkdown('1. First\n2. Second\n\n```js\n<script>x</script>\n```');
  assert.match(html, /<ol><li>First<\/li><li>Second<\/li><\/ol>/);
  assert.match(html, /<pre><code>&lt;script&gt;x&lt;\/script&gt;<\/code><\/pre>/);
});

test('price and duration formatting handles rubles and lifetime products', () => {
  assert.match(formatPrice(14900, 'RUB'), /149/);
  assert.equal(formatDuration(null), 'Навсегда');
  assert.equal(formatDuration(30), '30 дней');
  assert.equal(formatDuration(1), '1 день');
  assert.equal(formatDuration(3), '3 дня');
});
