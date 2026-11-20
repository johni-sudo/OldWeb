import fs from 'node:fs';
import path from 'node:path';

const publicDir = path.resolve('public');
const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith('.html'));
const routeMap = {
  '/': 'index.html',
  '/servers': 'servers.html',
  '/privileges': 'privileges.html',
  '/news': 'news.html',
  '/rules': 'rules.html',
  '/account': 'account.html',
  '/admin': 'admin.html',
  '/article': 'article.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};
const failures = [];

function exists(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (!clean || clean === '/') return fs.existsSync(path.join(publicDir, 'index.html'));
  if (routeMap[clean]) return fs.existsSync(path.join(publicDir, routeMap[clean]));
  if (clean.startsWith('/api/') || clean.startsWith('mailto:') || clean.startsWith('http')) return true;
  const target = path.join(publicDir, clean.replace(/^\/+/, ''));
  return fs.existsSync(target);
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(publicDir, file), 'utf8');
  const attributePattern = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = attributePattern.exec(source))) {
    const url = match[1];
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    if (!exists(url)) failures.push(`${file}: missing local target ${url}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'site.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) {
  if (!exists(icon.src)) failures.push(`site.webmanifest: missing icon ${icon.src}`);
}

const cssFiles = fs
  .readdirSync(path.join(publicDir, 'assets', 'css'))
  .filter((name) => name.endsWith('.css'));
for (const file of cssFiles) {
  const source = fs.readFileSync(path.join(publicDir, 'assets', 'css', file), 'utf8');
  const urlPattern = /url\(['"]?(\/assets\/[^'")]+)['"]?\)/g;
  let match;
  while ((match = urlPattern.exec(source))) {
    if (!exists(match[1])) failures.push(`css/${file}: missing ${match[1]}`);
  }
}

if (failures.length) {
  console.error('Asset check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Asset check passed: ${htmlFiles.length} HTML pages, ${cssFiles.length} CSS files.`);
}
