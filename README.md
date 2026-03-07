# Text-to-Speech Web-App mit Azure Speech

## Projektname
Text-to-Speech Web-App mit React, Express und Microsoft Azure Speech

## Projektziel
Dieses Schulprojekt zeigt, wie ein eingegebener Text in einer Webanwendung in Sprache umgewandelt werden kann. Die Benutzeroberfläche wurde bewusst einfach gehalten: Text eingeben, Stimme auswählen, Audio erzeugen und direkt im Browser abspielen.

## Verwendete Azure-Dienste
- **Azure Speech Service:** Wandelt Text im Backend in Sprachdateien um.
- **Azure App Service:** Hostet die fertige Webanwendung als verwaltete Plattform in Azure.

## Warum Azure App Service als PaaS gilt
Azure App Service ist ein **Platform as a Service (PaaS)**, weil Microsoft die darunterliegende Infrastruktur verwaltet. Man muss sich nicht um Betriebssystem, Webserver, Patches oder Skalierungsgrundlagen kümmern. Entwickler konzentrieren sich hauptsächlich auf den Anwendungscode und die Konfiguration.

## Warum Azure Speech ein Cloud-Service ist
Azure Speech ist ein **Cloud-Service**, weil die Sprachverarbeitung auf den Servern von Microsoft stattfindet. Die Anwendung sendet Text an den Dienst, Azure verarbeitet die Anfrage und liefert das generierte Audio zurück. Dadurch wird keine lokale TTS-Engine im Projekt benötigt.

## Einfache Architekturübersicht
1. Der Benutzer gibt Text im React-Frontend ein und wählt eine Stimme.
2. Das Frontend sendet eine Anfrage an die Express-API unter `/api/tts`.
3. Das Backend ruft Microsoft Azure Speech mit den geheimen Zugangsdaten aus der `.env` auf.
4. Azure Speech erstellt die Audiodatei.
5. Das Backend sendet die Audiodaten an das Frontend zurück.
6. Das Frontend erstellt daraus eine Browser-URL und spielt das Audio über ein `<audio>`-Element ab.

## Projektstruktur
```text
client/
  src/
    App.jsx
    index.css
    main.jsx
  index.html
  package.json
  vite.config.js
server/
  package.json
  server.js
.env.example
package.json
README.md
```

## Technischer Aufbau

### Frontend
- React mit Vite
- funktionale Komponenten
- `useState` für Formulardaten, Fehler, Ladezustand und Audio-URL
- `fetch` für den API-Aufruf
- `localStorage` für den zuletzt eingegebenen Text

### Backend
- Node.js mit Express
- `POST /api/tts` für Text-to-Speech
- `GET /api/health` für einen einfachen Statuscheck
- Azure Speech SDK nur im Backend

## Umgebungsvariablen
Im Projekt wird eine `.env` im Root-Verzeichnis erwartet.

Beispiel:

```env
AZURE_SPEECH_KEY=dein_schlüssel
AZURE_SPEECH_REGION=westeurope
PORT=3000
```

Die Datei `.env.example` zeigt die benötigten Variablen ohne echte Werte.

## Lokale Startanleitung

### 1. Repository vorbereiten
Im Projektordner ausführen:

```bash
npm install
```

Der Root-Installationsschritt installiert automatisch auch die Pakete für `server/` und `client/`.

### 2. `.env` anlegen
Kopiere die Datei `.env.example` zu `.env` und trage deinen Azure Speech Key und die Azure Region ein.

### 3. Backend starten
In einem Terminal:

```bash
npm run dev:server
```

Das Backend läuft standardmässig auf `http://localhost:3000`.

### 4. Frontend starten
In einem zweiten Terminal:

```bash
npm run dev:client
```

Das Frontend läuft standardmässig auf `http://localhost:5173`.

Vite leitet alle Aufrufe zu `/api/*` automatisch an das lokale Express-Backend weiter.

## Build für Produktion
Für einen Produktionsbuild des Frontends:

```bash
npm run build
```

Danach kann der Express-Server die Dateien aus `client/dist` direkt ausliefern.

Produktionsstart:

```bash
npm start
```

## API-Endpunkte

### `GET /api/health`
Beispielantwort:

```json
{
  "status": "ok",
  "service": "tts-api",
  "speechConfigured": true
}
```

### `POST /api/tts`
Beispiel-Request:

```json
{
  "text": "Hallo Welt",
  "voice": "de-CH-LeniNeural"
}
```

Antwort:
- Bei Erfolg: MP3-Audio als Binardaten
- Bei Fehlern: JSON mit einer `error`-Meldung

## Deployment-Hinweise für Azure App Service

### Warum ein einzelner App Service ausreicht
In diesem Projekt ist das Frontend nach dem Build nur noch eine statische Webanwendung. Deshalb kann der Express-Server im Deployment sowohl die API als auch das gebaute React-Frontend ausliefern. Das vereinfacht das Setup für ein Schulprojekt deutlich.

### GitHub Actions Workflow
Im Repository liegt ein Deployment-Workflow unter `.github/workflows/deploy-azure-webapp.yml`.

Er macht bei jedem Push auf den Branch `master` Folgendes:
1. Root-Abhängigkeiten installieren
2. React-Frontend mit Vite bauen
3. Ein Deploy-Paket mit `client/dist`, `server/` und den benötigten Root-Dateien vorbereiten
4. Sich per OIDC bei Azure anmelden
5. Die Anwendung in eine bestehende Azure Web App deployen
6. Zum Schluss `/api/health` aufrufen

### Einmalige Azure-Vorbereitung
Für den Workflow muss die Zielumgebung vorher in Azure angelegt werden:
1. Eine **Azure App Service Web App für Linux mit Node.js 20** erstellen
2. Als Start Command `npm start` setzen
3. Unter **Environment variables / Application settings** mindestens diese Werte anlegen:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION`

### GitHub-Konfiguration für OIDC
Der Workflow erwartet folgende GitHub-Secrets:
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Zusätzlich wird mindestens diese GitHub Repository Variable benötigt:
- `AZURE_WEBAPP_NAME`

Optional:
- `AZURE_WEBAPP_URL`

Wenn `AZURE_WEBAPP_URL` nicht gesetzt ist, verwendet der Workflow automatisch:

```text
https://<AZURE_WEBAPP_NAME>.azurewebsites.net
```

### OIDC in Azure einrichten
1. In Azure eine App Registration oder einen Service Principal für GitHub Actions verwenden
2. Eine **Federated Credential** für dieses GitHub-Repository anlegen
3. Als Branch `master` freigeben
4. Dem Service Principal mindestens Berechtigungen auf die Ziel-Web-App oder die Resource Group geben

### Möglicher Ablauf
1. Neues Azure App Service Web App Projekt für Node.js erstellen.
2. Den Quellcode in ein Git-Repository oder in ein ZIP-Deployment bringen.
3. In Azure App Service die Application Settings setzen:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION`
   - optional `PORT` wird von Azure oft automatisch gesetzt
4. Sicherstellen, dass beim Build `npm install` und `npm run build` ausgeführt werden.
5. Als Startbefehl reicht in der Regel:

```bash
npm start
```

### Wichtiger Hinweis
Die Azure-Zugangsdaten gehören **nur** in die Umgebungsvariablen des Backends oder in die App-Service-Konfiguration. Sie dürfen nicht im Frontend hinterlegt werden.

## Mögliche Erweiterungen
- weitere Stimmen und Sprachen
- Download-Button für die erzeugte Audiodatei
- Lautstärke- oder Sprechgeschwindigkeitsoptionen
- Anzeige der gewählten Stimme im Audiobereich
- kleine Historie der letzten Anfragen im Browser

## Kurze Präsentationsidee für die Schulvorstellung
Eine sinnvolle Präsentation könnte so aufgebaut sein:
1. Kurz das Problem erklären: Text soll im Browser in Sprache umgewandelt werden.
2. Die einfache Architektur mit Frontend, Backend und Azure Speech zeigen.
3. Live demonstrieren, wie ein Text eingegeben und abgespielt wird.
4. Begründen, warum die Azure Keys nur im Backend liegen.
5. Kurz erklären, warum Azure App Service als PaaS und Azure Speech als Cloud-Service gilt.
