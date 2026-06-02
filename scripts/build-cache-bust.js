#!/usr/bin/env node
/**
 * build-cache-bust.js
 * ============================================================
 * Înlocuiește automat parametrii ?v=... din index.html cu
 * hash-uri MD5 calculate din conținutul real al fișierelor.
 *
 * Rulare: node scripts/build-cache-bust.js
 * Sau automat prin GitHub Actions la fiecare push.
 * ============================================================
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_HTML = join(ROOT, 'index.html');

// Citim index.html
let html = readFileSync(INDEX_HTML, 'utf8');

// Regex care prinde orice script src local (nu CDN extern)
// Exemplu: js/modules/drive-viewer.js?v=4  sau  js/app.js  sau  js/config.js
const scriptRegex = /(<script\s+src=")([^"]+\.js)(\?[^"]*)?(")/g;

let replacements = 0;

html = html.replace(scriptRegex, (match, open, path, _oldQuery, close) => {
  // Ignorăm CDN-uri externe (http/https)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return match;
  }

  const filePath = join(ROOT, path);

  let hash;
  try {
    const content = readFileSync(filePath);
    hash = createHash('md5').update(content).digest('hex').slice(0, 8);
  } catch {
    // Fișierul nu există local (CDN sau dinamic) — păstrăm ca atare
    console.warn(`  ⚠  Nu am găsit: ${path}`);
    return match;
  }

  replacements++;
  const newTag = `${open}${path}?v=${hash}${close}`;
  console.log(`  ✓  ${path} → ?v=${hash}`);
  return newTag;
});

writeFileSync(INDEX_HTML, html, 'utf8');
console.log(`\n✅ Cache-bust complet: ${replacements} fișiere actualizate în index.html\n`);
