# Zeiten – Arbeitszeiterfassung Corelegal

Web-App fürs iPhone (zum Home-Bildschirm hinzufügen). Timer mit Pause, manuelle Einträge mit mehreren Pausen, Akte, Kategorie und Tätigkeitsbeschreibung, Statistik als Kartenstapel und Excel-Export für Tag, Woche, Monat, Jahr oder freien Zeitraum. Sperre per 6-stelligem Code und optional Face ID (Passkey).

## Daten

Alle Einträge liegen nur im Speicher der App auf dem Gerät (localStorage). Es gibt keinen Server. Backup als JSON in den Einstellungen.

## Entwickeln

```bash
npm install
npm run dev      # lokal
npm run check    # TypeScript + Tests
npm run build    # Icons erzeugen + Produktions-Build nach dist/
```

## Deployment

Vercel, Framework Vite, Output `dist`. Bei Deployment aus einem Git-Repo genügt als Build Command `npm run build`.

Jeder Push auf `main` wird automatisch auf Vercel (Projekt selim-zeiten) deployt.
