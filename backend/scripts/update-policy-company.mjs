import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

// Apply the owner's approved company/contact changes after verifying DOCX sources.
// Match across Word formatting runs so headings and footers stay consistent.
const replacements = [
  [/KY\s*MORA\s+DIGITAL\s+LTD/gi, "ZENTRYA LTD"],
  [/16889468/g, "16881475"],
  [/\s+or call us on\s*(?:\+?44[\s-]*7874[\s-]*402826)?\s*(?=\.)/gi, ""],
  [/(support@lexihive\.com)\s+or\s*(?:\+?44[\s-]*7874[\s-]*402826)?\s*(?=\.)/gi, "$1"],
  [/\+?44[\s-]*7874[\s-]*402826/g, ""],
];

function replaceInlines(inlines, expression, replacement) {
  const text = inlines.map((run) => run.text).join("");
  const matches = [...text.matchAll(expression)];
  if (!matches.length) return inlines;
  const runs = [];
  function appendRange(start, end) {
    let offset = 0;
    for (const run of inlines) {
      const next = offset + run.text.length;
      const value = run.text.slice(Math.max(0, start - offset), Math.max(0, Math.min(end, next) - offset));
      if (value && next > start && offset < end) runs.push({ ...run, text: value });
      offset = next;
    }
  }
  let cursor = 0;
  for (const match of matches) {
    appendRange(cursor, match.index);
    const value = replacement.replace(/\$(\d+)/g, (_, group) => match[Number(group)] ?? "");
    if (value) {
      let offset = 0;
      const style = inlines.find((run) => {
        offset += run.text.length;
        return offset > match.index;
      });
      runs.push({ ...style, text: value });
    }
    cursor = match.index + match[0].length;
  }
  appendRange(cursor, text.length);
  return runs;
}

function updateBlocks(blocks) {
  return blocks.flatMap((block) => {
    if (block.kind === "table") {
      for (const row of block.rows) for (const cell of row.cells) cell.blocks = updateBlocks(cell.blocks);
      return [block];
    }
    let inlines = block.inlines;
    for (const [expression, replacement] of replacements) inlines = replaceInlines(inlines, expression, replacement);
    block.inlines = inlines.filter((run) => !run.href?.startsWith("tel:"));
    block.text = block.inlines.map((run) => run.text).join("");
    return block.text.trim() ? [block] : [];
  });
}

function flatten(blocks) {
  return blocks.flatMap((block) => block.kind === "table"
    ? block.rows.flatMap((row) => row.cells.flatMap((cell) => flatten(cell.blocks)))
    : [block.text]);
}

const contentUrl = new URL("../../frontend/src/content/policies.json", import.meta.url);
const indexUrl = new URL("../../frontend/src/content/policy-index.json", import.meta.url);
const policies = JSON.parse(await readFile(contentUrl, "utf8"));
for (const policy of policies) {
  // Compare against the existing paragraph text as well as the actual rendered runs.
  const expected = policy.sourceText.map((text) => {
    for (const [expression, replacement] of replacements) text = text.replace(expression, replacement);
    return text;
  }).filter((text) => text.trim());
  policy.blocks = updateBlocks(policy.blocks);
  policy.footers = updateBlocks(policy.footers);
  policy.sourceText = [...flatten(policy.blocks), ...flatten(policy.footers)];
  assert.deepEqual(policy.sourceText, expected, `${policy.path}: preserve all other policy wording`);
  policy.paragraphCount = policy.sourceText.length;
}
await writeFile(contentUrl, JSON.stringify(policies, null, "\t") + "\n");
const index = policies.map(({ path, title, sourceFile, sourceSha256, paragraphCount }) => ({ path, title, sourceFile, sourceSha256, paragraphCount }));
if (JSON.stringify(JSON.parse(await readFile(indexUrl, "utf8"))) !== JSON.stringify(index)) {
  await writeFile(indexUrl, JSON.stringify(index, null, "\t") + "\n");
}
console.log(`Updated company/contact details in ${policies.length} policies; other wording preserved.`);
