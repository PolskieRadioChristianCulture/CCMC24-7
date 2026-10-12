#!/usr/bin/env node
// Użycie:
//   node automation/kc/prepare-lesson.mjs --source automation/kc/sources/2026-10-12-dzien-012 \
//        [--page ścieżka/do/dzien-12.html] [--check] [--allow-revision] [--report raport.json]
// --check: nic nie zapisuje; sprawdza, czy rekord w queue/pending zgadza się ze źródłami (dla CI).
// Skrypt nie łączy się z siecią i nie używa sekretów.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCalendar, validateSources, auditLessonPage, buildRecord, queueFileName, writePending } from './lib/kc-lesson.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = name => args.includes(name);

const source = opt('--source');
if (!source) { console.error('Brak --source'); process.exit(2); }
const queueRoot = resolve(opt('--queue') || join(here, 'queue'));
const report = { source, mode: flag('--check') ? 'CHECK' : 'PREPARE', result: null, errors: [], warnings: [], lessonPageFindings: [] };

function finish(code) {
  const out = opt('--report');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(code);
}

try {
  const calendar = loadCalendar(join(here, 'data', 'kalendarz_66_ksiag.json'));
  const meta = JSON.parse(readFileSync(join(source, 'meta.json'), 'utf8'));
  const texts = {};
  for (const k of ['tts', 'web', 'sms']) {
    const p = join(source, `${k}.txt`);
    texts[k] = existsSync(p) ? readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n') : '';
  }
  const { errors, warnings, expected } = validateSources(meta, texts, calendar);
  report.errors = errors;
  report.warnings = warnings;
  if (errors.length) { report.result = 'REJECTED'; finish(1); }

  const page = opt('--page');
  if (page) report.lessonPageFindings = auditLessonPage(readFileSync(page, 'utf8'), meta);

  const record = buildRecord(meta, texts, expected, { warnings, pageFindings: report.lessonPageFindings });
  const fileName = queueFileName(meta);
  report.recordId = record.id;
  report.file = `queue/pending/${fileName}`;
  report.contentHash = record.contentHash;
  report.status = record.status;

  if (flag('--check')) {
    const p = join(queueRoot, 'pending', fileName);
    if (!existsSync(p)) { report.result = 'MISSING_IN_QUEUE'; finish(1); }
    const committed = JSON.parse(readFileSync(p, 'utf8'));
    report.committedStatus = committed.status;
    report.result = committed.contentHash === record.contentHash ? 'IN_SYNC' : 'OUT_OF_SYNC';
    finish(report.result === 'IN_SYNC' ? 0 : 1);
  }

  const res = writePending(queueRoot, record, fileName, { allowRevision: flag('--allow-revision') });
  report.result = res.action;
  report.version = res.version;
  if (res.archived) report.archived = res.archived;
  finish(0);
} catch (e) {
  report.result = 'ERROR';
  report.errors.push(e.message);
  finish(1);
}
