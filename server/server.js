const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const speechsdk = require('microsoft-cognitiveservices-speech-sdk');

const rootEnvPath = path.resolve(__dirname, '..', '.env');
const exampleEnvPath = path.resolve(__dirname, '..', '.env.example');

const loadedEnvFile =
  loadEnvironment(rootEnvPath) || loadEnvironment(exampleEnvPath);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const allowedVoices = {
  'de-CH-LeniNeural': 'Deutsch (Schweiz) - Leni',
  'de-DE-KatjaNeural': 'Deutsch (Deutschland) - Katja',
  'en-US-JennyNeural': 'Englisch (USA) - Jenny'
};

app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tts-api',
    speechConfigured: Boolean(
      process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION
    )
  });
});

app.post('/api/tts', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const voice = typeof req.body?.voice === 'string' ? req.body.voice : '';

  if (!text) {
    return res.status(400).json({
      error: 'Bitte sende einen Text für die Sprachausgabe.'
    });
  }

  if (!allowedVoices[voice]) {
    return res.status(400).json({
      error: 'Die ausgewählte Stimme ist nicht erlaubt.'
    });
  }

  if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
    return res.status(500).json({
      error: 'Azure Speech ist nicht konfiguriert. Bitte prüfe die Umgebungsvariablen.'
    });
  }

  try {
    const audioBuffer = await synthesizeText(text, voice);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.send(audioBuffer);
  } catch (error) {
    console.error('Azure Speech Fehler:', error);
    return res.status(502).json({
      error: 'Die Audioausgabe konnte mit Azure Speech nicht erstellt werden.'
    });
  }
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message:
        'Die API läuft. Für das Frontend starte Vite lokal oder führe vorher den Client-Build aus.'
    });
  });
}

app.use((req, res) => {
  res.status(404).json({
    error: 'Route nicht gefunden.'
  });
});

app.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(
    `Umgebung geladen aus: ${
      loadedEnvFile ? path.basename(loadedEnvFile) : 'Systemvariablen'
    }`
  );
  console.log(
    `Azure Speech konfiguriert: ${
      process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION ? 'ja' : 'nein'
    }`
  );
});

function synthesizeText(text, voice) {
  return new Promise((resolve, reject) => {
    const speechConfig = speechsdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY,
      process.env.AZURE_SPEECH_REGION
    );

    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat =
      speechsdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const synthesizer = new speechsdk.SpeechSynthesizer(speechConfig);

    synthesizer.speakTextAsync(
      text,
      (result) => {
        synthesizer.close();

        if (
          result.reason ===
          speechsdk.ResultReason.SynthesizingAudioCompleted
        ) {
          resolve(Buffer.from(result.audioData));
          return;
        }

        reject(
          new Error(result.errorDetails || 'Unbekannter Fehler bei Azure Speech.')
        );
      },
      (error) => {
        synthesizer.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function loadEnvironment(envPath) {
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.warn(`Konnte ${path.basename(envPath)} nicht laden:`, result.error);
    return null;
  }

  return envPath;
}
