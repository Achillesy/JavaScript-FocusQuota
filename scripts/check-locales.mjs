#!/usr/bin/env node
// FocusQuota - Copyright (C) 2026 Achilles Newman
// SPDX-License-Identifier: GPL-3.0-or-later
// This file is part of FocusQuota, licensed under GNU GPL v3.0 or later; see LICENSE in the project root.

// FocusQuota — i18n consistency check (development tool; not part of the shipped runtime).
//
// Runs without a browser and verifies that:
//   1. every _locales/<lang>/messages.json is valid JSON;
//   2. all locales define exactly the same key set as the manifest's default_locale;
//   3. "$named$" placeholders match across locales and are declared in "placeholders";
//   4. every key referenced from HTML (data-i18n / -ph / -alt), from JS
//      (chrome.i18n.getMessage) and from the manifest (__MSG_key__) actually exists;
//   5. reports keys that are defined but never referenced (warning only).
//
// Usage:
//   node scripts/check-locales.mjs [project-root]
//
// Exit status: 0 = clean (warnings allowed), 1 = at least one error.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.argv[2] ?? join(SCRIPT_DIR, '..'));

const LOCALES_DIR = join(ROOT, '_locales');
const MANIFEST_PATH = join(ROOT, 'manifest.json');
// Directories never scanned for i18n references (build output, VCS, and this tool itself).
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'scripts']);

const errors = [];
const warnings = [];
const error = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// key -> Set of files that reference it
const referenced = new Map();
const addRef = (key, file) => {
  if (!referenced.has(key)) referenced.set(key, new Set());
  referenced.get(key).add(file);
};

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    error(`cannot read ${relative(ROOT, path)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    error(`invalid JSON in ${relative(ROOT, path)}: ${err.message}`);
    return null;
  }
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.(html|js|mjs)$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

// Chrome placeholder syntax: $name$ is a named placeholder, $1..$9 are substitutions.
// "$$" is an escaped literal "$" and intentionally does not match.
const namedPlaceholders = (message) =>
  new Set([...String(message).matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1]));

// ---- load manifest + locales ----

const manifest = readJson(MANIFEST_PATH);
const defaultLocale = manifest?.default_locale;

let localeDirs;
try {
  localeDirs = readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
} catch {
  error('cannot read _locales/');
  localeDirs = [];
}

if (!defaultLocale) error('manifest.json has no "default_locale"');
else if (!localeDirs.includes(defaultLocale))
  error(`default_locale "${defaultLocale}" has no _locales/${defaultLocale}/messages.json`);

const locales = new Map();
for (const lang of localeDirs) {
  const table = readJson(join(LOCALES_DIR, lang, 'messages.json'));
  if (table) locales.set(lang, table);
}

const base = locales.get(defaultLocale);

// ---- checks ----

if (!base) {
  error(`cannot run key checks: no usable messages for default locale "${defaultLocale}"`);
} else {
  // Per-message shape: non-empty "message", declared placeholders actually used and vice versa.
  for (const [lang, table] of locales) {
    for (const [key, entry] of Object.entries(table)) {
      const where = `${lang}:${key}`;
      const message = entry?.message;

      if (typeof message !== 'string' || message.trim() === '') {
        error(`${where}: missing or empty "message"`);
        continue;
      }
      if (typeof entry?.description !== 'string' || entry.description.trim() === '') {
        warn(`${where}: missing "description"`);
      }

      const declared = entry.placeholders && typeof entry.placeholders === 'object'
        ? entry.placeholders
        : {};
      const used = namedPlaceholders(message);

      for (const name of used) {
        const ph = declared[name];
        if (!ph) {
          error(`${where}: uses $${name}$ but "placeholders.${name}" is not declared`);
          continue;
        }
        const content = String(ph.content ?? '');
        const match = /^\$(\d+)$/.exec(content);
        if (!match || Number(match[1]) < 1 || Number(match[1]) > 9) {
          error(`${where}: placeholders.${name}.content must be "$1".."$9" (got ${JSON.stringify(ph.content)})`);
        }
        if (typeof ph.example !== 'string' || ph.example === '') {
          warn(`${where}: placeholders.${name} has no "example"`);
        }
      }
      for (const name of Object.keys(declared)) {
        if (!used.has(name)) {
          error(`${where}: declares placeholders.${name} but the message never uses $${name}$`);
        }
      }
    }
  }

  // Key parity against the default locale.
  const baseKeys = new Set(Object.keys(base));
  for (const [lang, table] of locales) {
    if (lang === defaultLocale) continue;
    const keys = new Set(Object.keys(table));
    for (const key of baseKeys) if (!keys.has(key)) error(`key "${key}" is missing from ${lang}`);
    for (const key of keys) if (!baseKeys.has(key)) error(`key "${key}" exists only in ${lang}, not in ${defaultLocale}`);
  }

  // Placeholder agreement across locales: same names, same $n mapping.
  for (const key of baseKeys) {
    const ref = base[key];
    if (!ref) continue;
    const refUsed = namedPlaceholders(ref.message);
    for (const [lang, table] of locales) {
      if (lang === defaultLocale) continue;
      const other = table[key];
      if (!other || typeof other.message !== 'string') continue;
      const otherUsed = namedPlaceholders(other.message);
      for (const name of refUsed) {
        if (!otherUsed.has(name)) error(`${lang}:${key}: placeholder $${name}$ is missing (present in ${defaultLocale})`);
      }
      for (const name of refUsed) {
        const expected = ref.placeholders?.[name]?.content;
        const actual = other.placeholders?.[name]?.content;
        if (expected && actual && expected !== actual) {
          error(`${lang}:${key}: placeholders.${name}.content is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)} to match ${defaultLocale}`);
        }
      }
    }
  }

  // Collect every i18n key referenced from HTML, JS and the manifest.
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.html')) {
      for (const m of text.matchAll(/data-i18n(?:-ph|-alt)?="([^"]+)"/g)) addRef(m[1], rel);
    } else {
      for (const m of text.matchAll(/getMessage\(\s*['"]([^'"]+)['"]/g)) addRef(m[1], rel);
    }
  }
  try {
    const manifestText = readFileSync(MANIFEST_PATH, 'utf8');
    for (const m of manifestText.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) addRef(m[1], 'manifest.json');
  } catch {
    /* already reported by readJson */
  }

  for (const [key, files] of referenced) {
    if (!baseKeys.has(key)) {
      error(`key "${key}" is referenced by ${[...files].sort().join(', ')} but is not defined in ${defaultLocale}`);
    }
  }
  for (const key of baseKeys) {
    if (!referenced.has(key)) warn(`key "${key}" is defined but never referenced`);
  }
}

// ---- report ----

function report() {
  const files = new Set([...referenced.values()].flatMap((set) => [...set]));
  const localeCounts = [...locales.entries()].map(([lang, table]) => `${lang}=${Object.keys(table).length}`);

  console.log('FocusQuota locale check');
  console.log(`  root:       ${ROOT}`);
  console.log(`  locales:    ${localeCounts.join(', ') || '(none)'}${defaultLocale ? `  [default: ${defaultLocale}]` : ''}`);
  console.log(`  references: ${referenced.size} key(s) from ${files.size} file(s)`);

  if (warnings.length > 0) {
    console.log('');
    console.log(`WARNINGS (${warnings.length})`);
    for (const w of warnings) console.log(`  WARN  ${w}`);
  }
  if (errors.length > 0) {
    console.log('');
    console.log(`ERRORS (${errors.length})`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    console.log('');
    console.log(`FAILED: ${errors.length} error(s), ${warnings.length} warning(s).`);
  } else {
    console.log('');
    console.log(`OK: locale check passed (0 errors, ${warnings.length} warning(s)).`);
  }
}

report();
process.exit(errors.length > 0 ? 1 : 0);
