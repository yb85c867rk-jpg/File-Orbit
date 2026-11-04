import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
function option(name, fallback = null) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; }
const out = resolve(option('--out', 'evidence/stage3g/test-summary.json'));
const report = option('--report', null);
const logs = args.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && args[index - 1] === '--out') && !(index > 0 && args[index - 1] === '--report'));
const sources = [];
const totals = { tests: 0, passed: 0, failed: 0, skipped: 0 };
for (const path of logs) {
  const bytes = readFileSync(path);
  const text = bytes[0] === 0xFF && bytes[1] === 0xFE ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
  const read = (label) => { const matches = [...text.matchAll(new RegExp('ℹ ' + label + ' (\\d+)', 'g'))]; return matches.length ? Number(matches.at(-1)[1]) : 0; };
  const source = { file: path, tests: read('tests'), passed: read('pass'), failed: read('fail'), skipped: read('skipped') };
  sources.push(source);
  totals.tests += source.tests; totals.passed += source.passed; totals.failed += source.failed; totals.skipped += source.skipped;
}
let reportCheck = null;
if (report) {
  const text = readFileSync(report, 'utf8');
  const number = (value) => value.toLocaleString('en-US');
  const expected = `${number(totals.tests)} tests, ${number(totals.passed)} pass, ${number(totals.skipped)} skip`;
  reportCheck = { file: report, expected, matched: text.includes(expected) };
}
const summary = { generatedAt: new Date().toISOString(), sources, totals, report: reportCheck };
mkdirSync(resolve(out, '..'), { recursive: true });
writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (reportCheck && !reportCheck.matched) process.exitCode = 1;


