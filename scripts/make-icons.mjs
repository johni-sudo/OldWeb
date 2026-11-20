import fs from 'node:fs';
import path from 'node:path';
const iconNames = [
  'arrow-right','arrow-up-right','menu','x','chevron-down','chevron-right','server','shield-check','sparkles','users','check','copy','log-out','user','crown','newspaper','book-open','sliders-horizontal','layout-dashboard','plus','pencil','trash-2','search','gamepad-2','globe-2','clock-3','wallet','external-link','download','refresh-cw','eye','lock','award','zap','waves','activity','calendar-days','filter','rotate-ccw','credit-card','user-cog','save','log-in','circle-help','mail','send','arrow-left','chevron-up','circle-check','circle-x','triangle-alert','loader-circle','shopping-bag','settings'
];
const symbols = [];
for (const name of iconNames) {
  let svg;
  try {
    const r = await fetch(`https://unpkg.com/lucide-static@0.468.0/icons/${name}.svg`);
    if (!r.ok) throw new Error(String(r.status));
    svg = await r.text();
  } catch (e) {
    console.warn('skip', name, e.message);
    continue;
  }
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</symbol>`);
}
try {
  const r = await fetch('https://cdn.simpleicons.org/steam/FFFFFF');
  if (r.ok) {
    const svg = await r.text();
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
    symbols.push(`<symbol id="i-steam-brand" viewBox="0 0 24 24" fill="currentColor" stroke="none">${inner}</symbol>`);
  }
} catch (e) { console.warn('steam icon', e.message); }
const sprite = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join('')}</svg>\n`;
fs.writeFileSync(path.join('public','assets','icons.svg'), sprite);
console.log('symbols', symbols.length, 'bytes', sprite.length);
