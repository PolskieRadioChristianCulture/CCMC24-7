// Kurs Codzienny „Z Biblią za Pan Brat” — przygotowanie lekcji do zatwierdzenia.
// Zero kosztów: tylko Node.js (bez zależności, bez sekretów, bez modeli AI, bez zapisu do chmury).
// Ten moduł NIE publikuje niczego w Firestore ani LUMINA. Tworzy rekord PENDING_APPROVAL
// z podglądem dokumentów, które dopiero po zatwierdzeniu zapisze osobny publikator.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const COURSE_ID = 'z-biblia-za-pan-brat';
export const STATUS_PENDING = 'PENDING_APPROVAL'; // = „DO WERYFIKACJI” ze SPEC_2009_LEKCJI_ARCHITEKTURA.md
export const LOCKED_STATUSES = ['APPROVED', 'SCHEDULED', 'PUBLISHED'];

// Skróty ksiąg używane w zakresach czytań (UBG). Rozszerzać przy kolejnych miesiącach.
export const BOOK_ABBR = {
  rodzaju: 'Rdz', wyjscia: 'Wj', kaplanska: 'Kpł', liczb: 'Lb', 'powtorzonego-prawa': 'Pwt',
  jozuego: 'Joz', sedziow: 'Sdz', rut: 'Rt'
};

const POLISH_ORDINALS = ['', 'Pierwszy', 'Drugi', 'Trzeci', 'Czwarty', 'Piąty', 'Szósty', 'Siódmy', 'Ósmy',
  'Dziewiąty', 'Dziesiąty', 'Jedenasty', 'Dwunasty', 'Trzynasty', 'Czternasty', 'Piętnasty', 'Szesnasty',
  'Siedemnasty', 'Osiemnasty', 'Dziewiętnasty', 'Dwudziesty'];

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function loadCalendar(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.totalLessons !== 2009 || data.calendar?.length !== 66) throw new Error('CALENDAR_INVALID: oczekiwano 66 ksiąg i 2009 lekcji.');
  return data;
}

// Numeracja: dzień 1 = 2026-10-01 (Europe/Warsaw, daty kalendarzowe bez godzin).
export function expectedForDate(calendar, dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error(`DATE_FORMAT: ${dateStr}`);
  const start = Date.UTC(2026, 9, 1);
  const [y, m, d] = dateStr.split('-').map(Number);
  const lessonGlobalNumber = Math.round((Date.UTC(y, m - 1, d) - start) / 86400000) + 1;
  if (lessonGlobalNumber < 1 || lessonGlobalNumber > calendar.totalLessons) throw new Error(`DATE_OUT_OF_COURSE: ${dateStr}`);
  const month = calendar.calendar.find(c => lessonGlobalNumber >= c.lessonStart && lessonGlobalNumber <= c.lessonEnd);
  if (!month || month.yearMonth !== dateStr.slice(0, 7)) throw new Error(`CALENDAR_MISMATCH: ${dateStr} nie pasuje do miesiąca kursu.`);
  return {
    lessonGlobalNumber,
    lessonMonthNumber: lessonGlobalNumber - month.lessonStart + 1,
    monthNumber: month.monthIndex,
    bookName: month.bookName,
    bookSlug: month.bookSlug,
    testament: month.testament,
    calendarMonth: month.yearMonth
  };
}

const SECRET_RE = /AIza[\w-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|"private_key"\s*:/i;
const REQUIRED_META = ['courseId', 'lessonGlobalNumber', 'publicationDate', 'title', 'subtitle', 'scriptureRange', 'memoryVerse', 'lessonUrl', 'author', 'rightsDeclaration'];

// Walidacja źródeł jednej lekcji. Błędy blokują przygotowanie; ostrzeżenia trafiają do rekordu.
export function validateSources(meta, texts, calendar) {
  const errors = [];
  const warnings = [];
  for (const key of REQUIRED_META) if (meta[key] === undefined || meta[key] === null || meta[key] === '') errors.push(`META_MISSING:${key}`);
  if (errors.length) return { errors, warnings, expected: null };

  if (meta.courseId !== COURSE_ID) errors.push(`COURSE_ID:${meta.courseId}`);
  let expected = null;
  try { expected = expectedForDate(calendar, meta.publicationDate); } catch (e) { errors.push(e.message); }
  const n = meta.lessonGlobalNumber;
  if (expected && expected.lessonGlobalNumber !== n) errors.push(`NUMBER_DATE_MISMATCH: data ${meta.publicationDate} = dzień ${expected.lessonGlobalNumber}, a meta podaje ${n}.`);

  for (const k of ['tts', 'web', 'sms']) {
    if (!texts[k] || !texts[k].trim()) errors.push(`TEXT_MISSING:${k}`);
  }
  if (errors.length) return { errors, warnings, expected };

  const all = [JSON.stringify(meta), texts.tts, texts.web, texts.sms].join('\n');
  if (SECRET_RE.test(all)) errors.push('SECRET_LIKE_CONTENT_REFUSED');

  // Każda wersja musi wskazywać ten sam dzień — ochrona przed pomyleniem dni (np. treść dnia 11 pod numerem 12).
  const dayRe = new RegExp(`Dzie[nń]\\s+${n}\\b`);
  const ordinal = POLISH_ORDINALS[n];
  const ordinalRe = ordinal ? new RegExp(`Dzie[nń]\\s+${ordinal}\\b`, 'i') : null;
  const firstLine = s => s.split(/\r?\n/).find(l => l.trim()) || '';
  if (!dayRe.test(firstLine(texts.web))) errors.push(`WEB_HEADER_DAY: nagłówek WWW nie zawiera „Dzień ${n}”.`);
  if (!(dayRe.test(firstLine(texts.tts)) || (ordinalRe && ordinalRe.test(firstLine(texts.tts))))) errors.push(`TTS_HEADER_DAY: nagłówek TTS nie wskazuje dnia ${n}.`);
  if (!dayRe.test(texts.sms)) errors.push(`SMS_DAY: SMS nie zawiera „Dzień ${n}”.`);
  for (const [k, t] of Object.entries(texts)) {
    const other = [...t.matchAll(/Dzie[nń]\s+(\d{1,4})\b/g)].map(m => Number(m[1])).filter(x => x !== n);
    if (other.length) warnings.push(`FOREIGN_DAY_IN_${k.toUpperCase()}: tekst odwołuje się do dnia ${[...new Set(other)].join(', ')}.`);
  }
  const pad = String(n).padStart(2, '0');
  if (!new RegExp(`/kurscodzienny/dzien-${pad}$`).test(meta.lessonUrl)) errors.push(`LESSON_URL: oczekiwano …/kurscodzienny/dzien-${pad}`);
  if (!texts.sms.includes(`kurscodzienny/dzien-${pad}`)) warnings.push(`SMS_LINK: SMS nie zawiera linku do lekcji dzien-${pad}.`);

  if (expected) {
    const abbr = BOOK_ABBR[expected.bookSlug];
    if (!abbr) warnings.push(`BOOK_ABBR_UNKNOWN:${expected.bookSlug}`);
    else {
      if (!meta.scriptureRange.startsWith(abbr + ' ')) errors.push(`SCRIPTURE_BOOK: zakres „${meta.scriptureRange}” nie należy do księgi ${expected.bookName} (${abbr}).`);
      if (!meta.memoryVerse.reference?.startsWith(abbr + ' ')) warnings.push(`MEMORY_VERSE_BOOK: werset pamięciowy spoza księgi miesiąca (${meta.memoryVerse.reference}).`);
    }
  }
  if (!meta.memoryVerse.text || !meta.memoryVerse.translation) errors.push('MEMORY_VERSE_INCOMPLETE');
  if (meta.rightsDeclaration.accepted !== true) warnings.push('RIGHTS_NOT_ACCEPTED: deklaracja praw czeka na potwierdzenie właściciela (wymagane przed APPROVED).');
  if (texts.sms.length > 640) warnings.push(`SMS_LENGTH: ${texts.sms.length} znaków (ponad 4 segmenty SMS).`);
  return { errors, warnings, expected };
}

// Audyt istniejącej podstrony lekcji (HTML z repo polskieradio.cc). Wyniki są informacją dla zatwierdzającego,
// nie zmieniają strony. Wykrywa pomieszanie dni (nagłówek, okruszki, og:description, zapowiedź jutra).
export function auditLessonPage(html, meta) {
  const findings = [];
  const n = meta.lessonGlobalNumber;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').split('\n').map(s => s.trim()).filter(Boolean);
  const title = (/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
  if (!new RegExp(`Dzie[nń]\\s+${n}\\b`).test(title)) findings.push(`PAGE_TITLE: <title> nie wskazuje dnia ${n}.`);
  if (!title.includes(meta.scriptureRange)) findings.push(`PAGE_TITLE_RANGE: <title> nie zawiera zakresu ${meta.scriptureRange}.`);
  const og = /<meta property="og:description" content="([^"]*)"/i.exec(html)?.[1] || '';
  const ogDay = /Dzie[nń]\s+(\d+)/.exec(og)?.[1];
  if (ogDay && Number(ogDay) !== n) findings.push(`PAGE_OG_DESCRIPTION: og:description podaje dzień ${ogDay}.`);
  const crumbIdx = text.findIndex(l => /^DZIEŃ \d+$/.test(l));
  if (crumbIdx >= 0 && Number(text[crumbIdx].split(' ')[1]) !== n) findings.push(`PAGE_BREADCRUMB: okruszki pokazują „${text[crumbIdx]}”.`);
  const hdrIdx = text.findIndex(l => new RegExp(`^DZIEŃ ${n} — `).test(l));
  if (hdrIdx >= 0) {
    const h1 = text[hdrIdx + 1] || '';
    const sub = text[hdrIdx + 2] || '';
    if (h1.toLowerCase() !== meta.title.toLowerCase()) findings.push(`PAGE_HEADING: nagłówek lekcji „${h1}” ≠ tytuł dnia „${meta.title}”.`);
    if (!sub.includes(meta.scriptureRange)) findings.push(`PAGE_SUBTITLE_RANGE: podtytuł „${sub}” nie zawiera ${meta.scriptureRange}.`);
  } else findings.push(`PAGE_HEADER_MISSING: brak linii „DZIEŃ ${n} — …”.`);
  const readIdx = text.indexOf('Czytanie');
  if (readIdx >= 0 && text[readIdx + 1] !== meta.scriptureRange) findings.push(`PAGE_READING: pole „Czytanie” = „${text[readIdx + 1]}”, oczekiwano ${meta.scriptureRange}.`);
  const memIdx = text.indexOf('Tekst pamięciowy');
  if (memIdx >= 0 && text[memIdx + 1] !== meta.memoryVerse.reference) findings.push(`PAGE_MEMORY_VERSE: pole „Tekst pamięciowy” = „${text[memIdx + 1]}”, oczekiwano ${meta.memoryVerse.reference}.`);
  const nextIdx = text.findIndex(l => /^Zapowiedź — Dzień \d+$/.test(l));
  if (nextIdx >= 0 && Number(text[nextIdx].split(' ').pop()) !== n + 1) findings.push(`PAGE_NEXT_TEASER: „${text[nextIdx]}”, oczekiwano zapowiedzi dnia ${n + 1}.`);
  return findings;
}

function teaserFrom(n, webText) {
  const lines = webText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('🔴') && !l.startsWith('('));
  let second = (lines[1] || lines[0] || '').replace(/^\*\*|\*\*$/g, '').replace(/^Dzień\s+\d+\s*[-–—]\s*/i, '').trim();
  return `Dzień ${n} – ${second}`;
}

// Rekord kolejki. Bez znaczników czasu w treści — rekord jest deterministyczny (CI porównuje hash).
export function buildRecord(meta, texts, expected, { warnings = [], pageFindings = [] } = {}) {
  const n = meta.lessonGlobalNumber;
  const pad3 = String(n).padStart(3, '0');
  const docId = `ref_day${n}_${meta.publicationDate}`;
  const titleLine = texts.web.split('\n').map(l => l.trim()).find(l => l.startsWith('☀️')) || `☀️ Z Biblią za Pan Brat — Dzień ${n}`;
  const teaser = teaserFrom(n, texts.web);
  const contentHash = sha256(JSON.stringify({ meta, tts: texts.tts, web: texts.web, sms: texts.sms }));
  const notPublished = { status: 'NOT_PUBLISHED', writtenAt: null, verifiedAt: null };
  return {
    schema: 'cc.kc.lesson-queue/v1',
    id: `CC-${meta.publicationDate.slice(0, 4)}-KC${pad3}`,
    courseId: COURSE_ID,
    status: STATUS_PENDING,
    approval: { required: true, approvedBy: null, approvedAt: null, rightsAccepted: meta.rightsDeclaration.accepted === true },
    lesson: {
      ...expected,
      publicationDate: meta.publicationDate,
      dayOfWeek: meta.dayOfWeek || null,
      title: meta.title,
      subtitle: meta.subtitle,
      scriptureRange: meta.scriptureRange,
      memoryVerse: meta.memoryVerse,
      image: meta.image || null,
      lessonUrl: meta.lessonUrl,
      author: meta.author
    },
    texts: { app_tts: texts.tts, web: texts.web, sms: texts.sms },
    contentHash,
    review: { warnings, lessonPageFindings: pageFindings },
    rightsDeclaration: meta.rightsDeclaration,
    provenance: meta.provenance || null,
    // Podgląd docelowych zapisów — zgodny z dotychczasowym publish_daily_mission.js oraz schematem lumina_posts.
    // NIC z tego nie zostało zapisane. Statusy zmieni wyłącznie publikator po zatwierdzeniu i weryfikacji odczytem.
    targets: {
      'cc-mission-control/morning_inspirations': { docId, ...notPublished, preview: { date: meta.publicationDate, dayNumber: n, title: titleLine, teaser, fullText: texts.tts, contentApp: texts.tts, contentWeb: texts.web, contentSms: texts.sms, imageUrl: '' } },
      'cc-mission-control/web_inspirations': { docId, ...notPublished, preview: { date: meta.publicationDate, dayNumber: n, title: titleLine, teaser, fullText: texts.web, contentWeb: texts.web, content: texts.web, imageUrl: '', published: true } },
      'cuda-398c0/reflections': { docId, ...notPublished, preview: { date: meta.publicationDate, dayOfWeek: (meta.dayOfWeek || '').toUpperCase(), title: titleLine, teaser, fullText: texts.web, imageUrl: '' } },
      'lumina-cc/lumina_posts': { docId: `kc_${meta.publicationDate}_dzien_${pad3}`, ...notPublished, preview: { type: 'post', category: 'z_biblia_za_pan_brat', author: meta.author.name, authorSlug: meta.author.slug, authorRole: 'founder', authorAvatar: '/avatar_cezary_official.jpg', title: titleLine, text: `${texts.web}\n\n🔗 Lekcja: ${meta.lessonUrl}`, image: meta.image || '', createdAtDateStr: meta.publicationDate, likes: 0, amen: 0, isPinned: false } }
    }
  };
}

export function queueFileName(meta) {
  return `kc-${meta.publicationDate}-dzien-${String(meta.lessonGlobalNumber).padStart(3, '0')}.json`;
}

// Zapis do kolejki: bez duplikatów, bez nadpisywania, z historią wersji.
export function writePending(queueRoot, record, fileName, { allowRevision = false } = {}) {
  const pendingDir = join(queueRoot, 'pending');
  const historyDir = join(queueRoot, 'history');
  mkdirSync(pendingDir, { recursive: true });
  mkdirSync(historyDir, { recursive: true });

  for (const other of readdirSync(pendingDir).filter(f => f.endsWith('.json') && f !== fileName)) {
    const o = JSON.parse(readFileSync(join(pendingDir, other), 'utf8'));
    if (o.lesson?.lessonGlobalNumber === record.lesson.lessonGlobalNumber || o.lesson?.publicationDate === record.lesson.publicationDate) {
      throw new Error(`DUPLICATE_LESSON: ${other} dotyczy tego samego dnia/numeru.`);
    }
  }

  const target = join(pendingDir, fileName);
  if (!existsSync(target)) {
    writeFileSync(target, JSON.stringify({ ...record, version: 1 }, null, 2) + '\n', 'utf8');
    return { action: 'CREATED', path: target, version: 1 };
  }
  const current = JSON.parse(readFileSync(target, 'utf8'));
  if (LOCKED_STATUSES.includes(current.status)) throw new Error(`LOCKED: ${fileName} ma status ${current.status}; zmiana wymaga nowej, jawnej decyzji właściciela.`);
  if (current.contentHash === record.contentHash) return { action: 'UNCHANGED', path: target, version: current.version };
  if (!allowRevision) throw new Error(`CONFLICT: ${fileName} istnieje z inną treścią (wersja ${current.version}). Użyj --allow-revision, aby zachować starą wersję w historii i utworzyć nową.`);
  const archived = join(historyDir, fileName.replace(/\.json$/, `.v${current.version}.json`));
  if (existsSync(archived)) throw new Error(`HISTORY_EXISTS: ${archived}`);
  renameSync(target, archived);
  const version = current.version + 1;
  writeFileSync(target, JSON.stringify({ ...record, version }, null, 2) + '\n', 'utf8');
  return { action: 'REVISED', path: target, version, archived };
}
