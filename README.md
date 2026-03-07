# Text-to-Speech Web-App mit Azure Speech

## Projektname
Text-to-Speech Web-App mit React, Express und Microsoft Azure Speech

## Projektziel
Dieses Schulprojekt zeigt, wie ein eingegebener Text in einer Webanwendung in Sprache umgewandelt werden kann. Die Benutzeroberflaeche wurde bewusst einfach gehalten: Text eingeben, Stimme auswaehlen, Audio erzeugen und direkt im Browser abspielen.

## Verwendete Azure-Dienste
- **Azure Speech Service:** Wandelt Text im Backend in Sprachdateien um.
- **Azure App Service:** Hostet die fertige Webanwendung als verwaltete Plattform in Azure.

## Warum Azure App Service als PaaS gilt
Azure App Service ist ein **Platform as a Service (PaaS)**, weil Microsoft die darunterliegende Infrastruktur verwaltet. Man muss sich nicht um Betriebssystem, Webserver, Patches oder Skalierungsgrundlagen kuemmern. Entwickler konzentrieren sich hauptsaechlich auf den Anwendungscode und die Konfiguration.

## Warum Azure Speech ein Cloud-Service ist
Azure Speech ist ein **Cloud-Service**, weil die Sprachverarbeitung auf den Servern von Microsoft stattfindet. Die Anwendung sendet Text an den Dienst, Azure verarbeitet die Anfrage und liefert das generierte Audio zurueck. Dadurch wird keine lokale TTS-Engine im Projekt benoetigt.

## Einfache Architekturuebersicht
1. Der Benutzer gibt Text im React-Frontend ein und waehlt eine Stimme.
2. Das Frontend sendet eine Anfrage an die Express-API unter `/api/tts`.
3. Das Backend ruft Microsoft Azure Speech mit den geheimen Zugangsdaten aus der `.env` auf.
4. Azure Speech erstellt die Audiodatei.
5. Das Backend sendet die Audiodaten an das Frontend zurueck.
6. Das Frontend erstellt daraus eine Browser-URL und spielt das Audio ueber ein `<audio>`-Element ab.

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
- `useState` fuer Formulardaten, Fehler, Ladezustand und Audio-URL
- `fetch` fuer den API-Aufruf
- `localStorage` fuer den zuletzt eingegebenen Text

### Backend
- Node.js mit Express
- `POST /api/tts` fuer Text-to-Speech
- `GET /api/health` fuer einen einfachen Statuscheck
- Azure Speech SDK nur im Backend

## Umgebungsvariablen
Im Projekt wird eine `.env` im Root-Verzeichnis erwartet.

Beispiel:

```env
AZURE_SPEECH_KEY=dein_schluessel
AZURE_SPEECH_REGION=westeurope
PORT=3000
```

Die Datei `.env.example` zeigt die benoetigten Variablen ohne echte Werte.

## Lokale Startanleitung

### 1. Repository vorbereiten
Im Projektordner ausfuehren:

```bash
npm install
```

Der Root-Installationsschritt installiert automatisch auch die Pakete fuer `server/` und `client/`.

### 2. `.env` anlegen
Kopiere die Datei `.env.example` zu `.env` und trage deinen Azure Speech Key und die Azure Region ein.

### 3. Backend starten
In einem Terminal:

```bash
npm run dev:server
```

Das Backend laeuft standardmaessig auf `http://localhost:3000`.

### 4. Frontend starten
In einem zweiten Terminal:

```bash
npm run dev:client
```

Das Frontend laeuft standardmaessig auf `http://localhost:5173`.

Vite leitet alle Aufrufe zu `/api/*` automatisch an das lokale Express-Backend weiter.

## Build fuer Produktion
Fuer einen Produktionsbuild des Frontends:

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

## Deployment-Hinweise fuer Azure App Service

### Warum ein einzelner App Service ausreicht
In diesem Projekt ist das Frontend nach dem Build nur noch eine statische Webanwendung. Deshalb kann der Express-Server im Deployment sowohl die API als auch das gebaute React-Frontend ausliefern. Das vereinfacht das Setup fuer ein Schulprojekt deutlich.

### Moeglicher Ablauf
1. Neues Azure App Service Web App Projekt fuer Node.js erstellen.
2. Den Quellcode in ein Git-Repository oder in ein ZIP-Deployment bringen.
3. In Azure App Service die Application Settings setzen:
   - `AZURE_SPEECH_KEY`
   - `AZURE_SPEECH_REGION`
   - optional `PORT` wird von Azure oft automatisch gesetzt
4. Sicherstellen, dass beim Build `npm install` und `npm run build` ausgefuehrt werden.
5. Als Startbefehl reicht in der Regel:

```bash
npm start
```

### Wichtiger Hinweis
Die Azure-Zugangsdaten gehoeren **nur** in die Umgebungsvariablen des Backends oder in die App-Service-Konfiguration. Sie duerfen nicht im Frontend hinterlegt werden.

## Moegliche Erweiterungen
- weitere Stimmen und Sprachen
- Download-Button fuer die erzeugte Audiodatei
- Lautstaerke- oder Sprechgeschwindigkeitsoptionen
- Anzeige der gewaelten Stimme im Audiobereich
- kleine Historie der letzten Anfragen im Browser

## Kurze Praesentationsidee fuer die Schulvorstellung
Eine sinnvolle Praesentation koennte so aufgebaut sein:
1. Kurz das Problem erklaeren: Text soll im Browser in Sprache umgewandelt werden.
2. Die einfache Architektur mit Frontend, Backend und Azure Speech zeigen.
3. Live demonstrieren, wie ein Text eingegeben und abgespielt wird.
4. Begruenden, warum die Azure Keys nur im Backend liegen.
5. Kurz erklaeren, warum Azure App Service als PaaS und Azure Speech als Cloud-Service gilt.
