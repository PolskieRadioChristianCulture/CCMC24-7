# KC — „Z Biblią za Pan Brat”: przygotowanie lekcji do zatwierdzenia

Etap 1 priorytetu P0 Dowódcy (12.10.2026): codzienne lekcje @Akademia / @KC podłączone do GitHub Actions,
bez nowych kosztów. Ten etap **przygotowuje i sprawdza** lekcję. **Niczego nie publikuje.**

## Co robi

1. Czyta źródła lekcji z `sources/<data>-dzien-<NNN>/`: `meta.json`, `tts.txt`, `web.txt`, `sms.txt`
   (opcjonalnie `lesson-page.snapshot.html` — kopia podstrony z repo polskieradio.cc do audytu).
2. Sprawdza numerację z kanonicznym kalendarzem `data/kalendarz_66_ksiag.json` (66 ksiąg, 2009 lekcji,
   dzień 1 = 2026-10-01), zgodność dnia we wszystkich wersjach tekstu, księgę zakresu czytań, link do lekcji,
   kompletność metadanych, deklarację praw i brak sekretów. Błąd = `REJECTED`, nic nie jest zapisywane.
3. Audytuje podstronę lekcji (tytuł, okruszki, nagłówek, „Czytanie”, „Tekst pamięciowy”, zapowiedź jutra).
   Uwagi trafiają do rekordu dla zatwierdzającego; strona nie jest zmieniana.
4. Zapisuje rekord `queue/pending/kc-<data>-dzien-<NNN>.json` ze statusem **`PENDING_APPROVAL`**
   (= „DO WERYFIKACJI” w SPEC_2009_LEKCJI_ARCHITEKTURA.md) i podglądem dokumentów dla:
   `cc-mission-control/morning_inspirations`, `cc-mission-control/web_inspirations`,
   `cuda-398c0/reflections`, `lumina-cc/lumina_posts`. Każdy cel ma status `NOT_PUBLISHED`.

Ochrona: ten sam materiał = `UNCHANGED`; inna treść = `CONFLICT` (nowa wersja tylko z `--allow-revision`,
poprzednia trafia do `queue/history/…vN.json`); drugi plik dla tego samego dnia = `DUPLICATE_LESSON`;
rekord `APPROVED`/`SCHEDULED`/`PUBLISHED` = `LOCKED`.

## Uruchomienie lokalne

```bash
node --test automation/kc/test/*.test.mjs
node automation/kc/prepare-lesson.mjs --source automation/kc/sources/2026-10-12-dzien-012 \
     --page automation/kc/sources/2026-10-12-dzien-012/lesson-page.snapshot.html
node automation/kc/prepare-lesson.mjs --source automation/kc/sources/2026-10-12-dzien-012 --check
```

## GitHub Actions

`.github/workflows/kc-lesson-prepare.yml` — uruchamiany przy zmianach w `automation/kc/**` oraz ręcznie
(`workflow_dispatch`). Testy + kontrola zgodności rekordu z kolejki ze źródłami + raport `kc-report.json`
(artefakt). Bez `schedule`, bez sekretów, `permissions: contents: read`.

## Czego ten etap NIE robi (świadomie)

- Nie zapisuje do Firestore ani LUMINA. Rekord w kolejce **nie oznacza publikacji**.
- Nie ustala godziny publikacji (brak decyzji właściciela) i nie włącza żadnego harmonogramu.
- Nie używa modelu AI, płatnego API ani sekretów.

## Następne etapy (do decyzji właściciela)

1. Zatwierdzenie: właściciel potwierdza treść i deklarację praw → `status: APPROVED`, `approval.approvedBy`,
   `rightsDeclaration.accepted: true` (PR/commit widoczny w historii).
2. Publikator (osobny workflow): tylko rekordy `APPROVED`, zapis do 4 celów z sekretem konta usługi
   w GitHub Secrets, potem **odczyt kontrolny** każdego dokumentu i dopiero wtedy `PUBLISHED` + `verifiedAt`.
   Wymaga zgody na dodanie sekretu i ustalenia godziny.
