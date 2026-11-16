#!/usr/bin/env node
/**
 * scripts/check-messages.mjs
 *
 * 1. src/messages/tr.json and src/messages/en.json have exactly the same keys.
 * 2. Every static translation key used in src/ exists in both files.
 *
 * Translator bindings recognised:
 *   const t = useTranslations()            const t = useTranslations("ns")
 *   const t = await getTranslations()      const t = await getTranslations({ locale, namespace: "ns" })
 * Calls recognised: t("key"), t('key'), t(`key`) and t.rich/raw/markup(...).
 * Keys containing ${...} and calls of a translator passed in as a parameter
 * are counted as "not checked" and listed.
 *
 * Exits 1 on any mismatch. Run: node scripts/check-messages.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const tr = JSON.parse(readFileSync(join(SRC, "messages/tr.json"), "utf8"));
const en = JSON.parse(readFileSync(join(SRC, "messages/en.json"), "utf8"));

const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
const has = (obj, key) =>
  key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj) !== undefined;

let failed = 0;

// 1) parity
const trKeys = new Set(flatten(tr));
const enKeys = new Set(flatten(en));
const onlyTr = [...trKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !trKeys.has(k));
console.log(`tr.json: ${trKeys.size} keys, en.json: ${enKeys.size} keys`);
for (const k of onlyTr) { console.log(`  only in tr.json: ${k}`); failed++; }
for (const k of onlyEn) { console.log(`  only in en.json: ${k}`); failed++; }

// 2) usage
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
};
walk(SRC);

let checked = 0;
const notChecked = [];
const bindingRe =
  /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)"|\{[^}]*namespace:\s*"([^"]*)"[^}]*\}|\{[^}]*\}|)\s*\)/g;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const bindings = [...src.matchAll(bindingRe)].map((m) => ({ name: m[1], ns: m[2] ?? m[3] ?? "", at: m.index }));
  const names = new Set(bindings.map((b) => b.name));
  for (const name of names) {
    const callRe = new RegExp(`\\b${name}(?:\\.(?:rich|raw|markup))?\\(\\s*(["'\`])([^"'\`]*?)\\1`, "g");
    for (const c of src.matchAll(callRe)) {
      const line = src.slice(0, c.index).split("\n").length;
      const where = `${relative(ROOT, file).replace(/\\/g, "/")}:${line}`;
      const binding = bindings.filter((b) => b.name === name && b.at <= c.index).pop();
      if (!binding || c[2].includes("${")) { notChecked.push(`${where}  ${c[0]}`); continue; }
      const key = binding.ns ? `${binding.ns}.${c[2]}` : c[2];
      checked++;
      for (const [label, msgs] of [["tr", tr], ["en", en]]) {
        if (!has(msgs, key)) { console.log(`  missing in ${label}.json: ${key}  (${where})`); failed++; }
      }
    }
  }
}
console.log(`static keys checked: ${checked}, not checked: ${notChecked.length}`);
for (const n of notChecked) console.log(`  not checked: ${n}`);

if (failed) { console.log(`\n${failed} problem(s).`); process.exit(1); }
console.log("\nOK: tr/en parity and all static keys present.");
