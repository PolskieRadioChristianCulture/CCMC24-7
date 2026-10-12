import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadCalendar, expectedForDate, validateSources, auditLessonPage, buildRecord, queueFileName, writePending, STATUS_PENDING } from '../lib/kc-lesson.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'sources', '2026-10-12-dzien-012');
const calendar = loadCalendar(join(root, 'data', 'kalendarz_66_ksiag.json'));
const realMeta = () => JSON.parse(readFileSync(join(SRC, 'meta.json'), 'utf8'));
const realTexts = () => ({ tts: readFileSync(join(SRC, 'tts.txt'), 'utf8'), web: readFileSync(join(SRC, 'web.txt'), 'utf8'), sms: readFileSync(join(SRC, 'sms.txt'), 'utf8') });
const tmp = t => { const d = mkdtempSync(join(tmpdir(), 'kc-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };

test('kalendarz: numeracja 2009 lekcji i granice', () => {
  assert.deepEqual(expectedForDate(calendar, '2026-10-12').lessonGlobalNumber, 12);
  assert.equal(expectedForDate(calendar, '2026-10-12').bookName, 'Rodzaju');
  const nov = expectedForDate(calendar, '2026-11-01');
  assert.equal(nov.lessonGlobalNumber, 32);
  assert.equal(nov.bookName, 'Wyjścia');
  assert.equal(nov.lessonMonthNumber, 1);
  assert.equal(expectedForDate(calendar, '2032-03-31').lessonGlobalNumber, 2009);
  assert.throws(() => expectedForDate(calendar, '2032-04-01'), /DATE_OUT_OF_COURSE/);
  assert.throws(() => expectedForDate(calendar, '2026-09-30'), /DATE_OUT_OF_COURSE/);
});

test('prawdziwa lekcja dnia 12 przechodzi walidację bez błędów', () => {
  const { errors, warnings } = validateSources(realMeta(), realTexts(), calendar);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.startsWith('RIGHTS_NOT_ACCEPTED')));
});

test('odrzuca niezgodność daty i numeru dnia', () => {
  const meta = { ...realMeta(), lessonGlobalNumber: 11 };
  const { errors } = validateSources(meta, realTexts(), calendar);
  assert.ok(errors.some(e => e.startsWith('NUMBER_DATE_MISMATCH')));
});

test('odrzuca treść innego dnia pod numerem 12 (pomieszanie dni)', () => {
  const texts = realTexts();
  texts.web = texts.web.replace('Dzień 12', 'Dzień 11');
  const { errors } = validateSources(realMeta(), texts, calendar);
  assert.ok(errors.some(e => e.startsWith('WEB_HEADER_DAY')));
});

test('odrzuca brakującą wersję tekstu i niekompletne metadane', () => {
  const texts = { ...realTexts(), sms: '  ' };
  assert.ok(validateSources(realMeta(), texts, calendar).errors.includes('TEXT_MISSING:sms'));
  const meta = realMeta(); delete meta.rightsDeclaration;
  assert.ok(validateSources(meta, realTexts(), calendar).errors.includes('META_MISSING:rightsDeclaration'));
});

test('odrzuca treść przypominającą sekret', () => {
  const texts = realTexts();
  texts.web += '\nAIzaSyA1234567890abcdefghijklmnopqrstu';
  assert.ok(validateSources(realMeta(), texts, calendar).errors.includes('SECRET_LIKE_CONTENT_REFUSED'));
});

test('odrzuca zakres czytań spoza księgi miesiąca', () => {
  const meta = { ...realMeta(), scriptureRange: 'Wj 3:1–22' };
  assert.ok(validateSources(meta, realTexts(), calendar).errors.some(e => e.startsWith('SCRIPTURE_BOOK')));
});

test('rekord: status oczekujący, brak zatwierdzenia, nic nie opublikowane', () => {
  const meta = realMeta();
  const { expected } = validateSources(meta, realTexts(), calendar);
  const rec = buildRecord(meta, realTexts(), expected);
  assert.equal(rec.status, STATUS_PENDING);
  assert.equal(rec.approval.approvedBy, null);
  assert.equal(rec.approval.rightsAccepted, false);
  assert.equal(rec.id, 'CC-2026-KC012');
  for (const [name, t] of Object.entries(rec.targets)) {
    assert.equal(t.status, 'NOT_PUBLISHED', name);
    assert.equal(t.writtenAt, null, name);
  }
  assert.equal(rec.targets['cc-mission-control/web_inspirations'].docId, 'ref_day12_2026-10-12');
  assert.equal(rec.targets['lumina-cc/lumina_posts'].preview.authorSlug, 'cezaryrgowski');
  // deterministyczny: ten sam wejściowy materiał = ten sam hash
  assert.equal(rec.contentHash, buildRecord(meta, realTexts(), expected).contentHash);
});

test('kolejka: utworzenie, brak duplikatów, brak nadpisania, historia wersji, blokada po zatwierdzeniu', t => {
  const q = tmp(t);
  const meta = realMeta();
  const { expected } = validateSources(meta, realTexts(), calendar);
  const name = queueFileName(meta);
  const rec = buildRecord(meta, realTexts(), expected);
  assert.equal(writePending(q, rec, name).action, 'CREATED');
  assert.equal(writePending(q, rec, name).action, 'UNCHANGED');

  const changedTexts = { ...realTexts(), sms: realTexts().sms + ' ' };
  const rec2 = buildRecord(meta, changedTexts, expected);
  assert.throws(() => writePending(q, rec2, name), /CONFLICT/);
  const res = writePending(q, rec2, name, { allowRevision: true });
  assert.equal(res.action, 'REVISED');
  assert.equal(res.version, 2);
  assert.ok(existsSync(join(q, 'history', name.replace('.json', '.v1.json'))));

  assert.throws(() => writePending(q, rec, 'kc-2026-10-12-dzien-012-kopia.json'), /DUPLICATE_LESSON/);

  const p = join(q, 'pending', name);
  const locked = JSON.parse(readFileSync(p, 'utf8'));
  locked.status = 'APPROVED';
  writeFileSync(p, JSON.stringify(locked));
  assert.throws(() => writePending(q, rec, name, { allowRevision: true }), /LOCKED/);
  assert.equal(readdirSync(join(q, 'pending')).length, 1);
});

test('audyt strony: wykrywa pomieszanie dnia 11 i 12 na obecnej podstronie', () => {
  const html = readFileSync(join(SRC, 'lesson-page.snapshot.html'), 'utf8');
  const findings = auditLessonPage(html, realMeta());
  assert.ok(findings.some(f => f.startsWith('PAGE_BREADCRUMB')));
  assert.ok(findings.some(f => f.startsWith('PAGE_HEADING')));
  assert.ok(findings.some(f => f.startsWith('PAGE_READING')));
  assert.ok(findings.some(f => f.startsWith('PAGE_NEXT_TEASER')));
});

test('audyt strony: spójna strona nie daje uwag', () => {
  const meta = realMeta();
  const html = `<title>Dzień 12: X (${meta.scriptureRange})</title><meta property="og:description" content="Dzień 12. x" />
  <div>DZIEŃ 12</div><div>DZIEŃ 12 — 12 PAŹDZIERNIKA 2026</div><h1>${meta.title}</h1><p>${meta.subtitle} — ${meta.scriptureRange}</p>
  <div>Czytanie</div><div>${meta.scriptureRange}</div><div>Tekst pamięciowy</div><div>${meta.memoryVerse.reference}</div><div>Zapowiedź — Dzień 13</div>`;
  assert.deepEqual(auditLessonPage(html, meta), []);
});

test('CLI --check: zatwierdzony w repo rekord jest zgodny ze źródłami', () => {
  const out = execFileSync(process.execPath, [join(root, 'prepare-lesson.mjs'), '--source', SRC, '--page', join(SRC, 'lesson-page.snapshot.html'), '--check'], { encoding: 'utf8' });
  const r = JSON.parse(out);
  assert.equal(r.result, 'IN_SYNC');
  assert.equal(r.committedStatus, 'PENDING_APPROVAL');
});
