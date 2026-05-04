import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walkDir(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkDir(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface Finding {
  file: string;
  line: number;
  text: string;
  reason: string;
}

function scanFile(file: string): Finding[] {
  const findings: Finding[] = [];
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  let inBlockComment = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let i = 0;
    let lineHasCode = false;

    while (i < line.length) {
      const c = line[i];

      if (inBlockComment) {
        if (c === '*' && line[i + 1] === '/') {
          inBlockComment = false;
          i += 2;
          continue;
        }
        i++;
        continue;
      }

      if (c === '/' && line[i + 1] === '/') break;
      if (c === '/' && line[i + 1] === '*') {
        inBlockComment = true;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        const quote = c;
        i++;
        while (i < line.length && line[i] !== quote) {
          if (line[i] === '\\') {
            i += 2;
            continue;
          }
          if (quote === '`' && line[i] === '$' && line[i + 1] === '{') {
            let depth = 1;
            i += 2;
            while (i < line.length && depth > 0) {
              if (line[i] === '{') depth++;
              else if (line[i] === '}') depth--;
              i++;
            }
            continue;
          }
          i++;
        }
        i++;
        lineHasCode = true;
        continue;
      }

      if (c === ' ' || c === '\t') {
        i++;
        continue;
      }

      if (c === '/' && line[i + 1] !== '/' && line[i + 1] !== '*' && line[i + 1] !== ' ') {
        let prev = i - 1;
        while (prev >= 0 && (line[prev] === ' ' || line[prev] === '\t')) prev--;
        const prevChar = prev >= 0 ? line[prev] : '';
        const regexCtx =
          prevChar === '' ||
          prevChar === '=' ||
          prevChar === '(' ||
          prevChar === ',' ||
          prevChar === '[' ||
          prevChar === '!' ||
          prevChar === '&' ||
          prevChar === '|' ||
          prevChar === '?' ||
          prevChar === ':' ||
          prevChar === ';' ||
          prevChar === '{' ||
          prevChar === '}' ||
          prevChar === 'n';

        if (regexCtx && lineHasCode === false && (prevChar === '=' || prevChar === '(' || prevChar === ',')) {
          let k = i + 1;
          let found = false;
          while (k < line.length) {
            if (line[k] === '\\') {
              k += 2;
              continue;
            }
            if (line[k] === '/') {
              found = true;
              break;
            }
            k++;
          }
          if (found) {
            findings.push({ file, line: li + 1, text: line.trim(), reason: 'regex literal' });
            i = k + 1;
            continue;
          }
        }
      }

      const rest = line.slice(i);
      if (rest.startsWith('new RegExp')) {
        findings.push({ file, line: li + 1, text: line.trim(), reason: 'new RegExp' });
      }
      if (rest.startsWith('.match(/') || rest.startsWith('.test(/')) {
        findings.push({ file, line: li + 1, text: line.trim(), reason: 'inline regex .match/.test' });
      }

      lineHasCode = true;
      i++;
    }
  }
  return findings;
}

describe('no-regex policy', () => {
  it('src/ contains no regex literal or new RegExp', () => {
    const files = walkDir('src');
    const findings: Finding[] = [];
    for (const f of files) findings.push(...scanFile(f));
    if (findings.length > 0) {
      const msg = findings.map((f) => `${f.file}:${f.line} (${f.reason}) → ${f.text}`).join('\n');
      throw new Error(`regex usage detected in src/:\n${msg}`);
    }
    expect(findings).toHaveLength(0);
  });
});
