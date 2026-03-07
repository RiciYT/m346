const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const {
  BlobServiceClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters
} = require('@azure/storage-blob');
const speechsdk = require('microsoft-cognitiveservices-speech-sdk');

const rootEnvPath = path.resolve(__dirname, '..', '.env');
const exampleEnvPath = path.resolve(__dirname, '..', '.env.example');

const loadedEnvFile =
  loadEnvironment(rootEnvPath) || loadEnvironment(exampleEnvPath);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const AUDIO_CONTAINER_NAME = 'audio-files';
const HISTORY_INDEX_BLOB_NAME = 'history/index.json';
const storageConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
let storageInitializationError = null;
const blobServiceClient = createBlobServiceClient(storageConnectionString);
const storageSharedKeyCredential =
  createStorageSharedKeyCredential(storageConnectionString);
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
    ),
    storageConfigured: Boolean(blobServiceClient),
    storageConfigError: storageInitializationError?.message || null
  });
});

app.get('/api/history', async (req, res) => {
  try {
    const items = await listHistoryEntries();

    return res.json({ items });
  } catch (error) {
    console.error('History-Laden fehlgeschlagen:', error);
    return res.status(502).json({
      error: error.message || 'Die History konnte nicht geladen werden.'
    });
  }
});

app.get('/api/audio/:blobName/download', async (req, res) => {
  try {
    const blobName = req.params?.blobName;

    if (!blobName) {
      return res.status(400).json({
        error: 'Blob-Name fehlt.'
      });
    }

    const containerClient = await getStorageContainerClient();
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    if (!(await blockBlobClient.exists())) {
      return res.status(404).json({
        error: 'Audiodatei nicht gefunden.'
      });
    }

    const downloadResponse = await blockBlobClient.download();

    res.setHeader(
      'Content-Type',
      downloadResponse.contentType || getAudioContentType(blobName)
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(blobName)}"`
    );

    if (downloadResponse.readableStreamBody) {
      downloadResponse.readableStreamBody.on('error', (error) => {
        console.error('Blob-Download Streamfehler:', error);

        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy(error);
        }
      });

      downloadResponse.readableStreamBody.pipe(res);
      return;
    }

    const fileBuffer = await blockBlobClient.downloadToBuffer();
    return res.send(fileBuffer);
  } catch (error) {
    console.error('Audio-Download fehlgeschlagen:', error);
    return res.status(502).json({
      error: error.message || 'Die Audiodatei konnte nicht heruntergeladen werden.'
    });
  }
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
    const tempAudioFile = await writeAudioFile(audioBuffer, 'mp3');
    let uploadedAudio;

    try {
      uploadedAudio = await uploadAudio(tempAudioFile.filePath, tempAudioFile.fileName);
    } finally {
      await removeTemporaryFile(tempAudioFile.filePath);
    }

    const historyEntry = await appendHistoryEntry({
      blobName: uploadedAudio.blobName,
      contentType: 'audio/mpeg',
      text,
      timestamp: new Date().toISOString(),
      voice
    });

    return res.json({
      voice,
      contentType: 'audio/mpeg',
      blobUrl: historyEntry.audioUrl,
      entry: historyEntry
    });
  } catch (error) {
    console.error('TTS oder Blob-Upload Fehler:', error);
    return res.status(502).json({
      error: error.message || 'Die Audioausgabe konnte nicht erstellt oder gespeichert werden.'
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

async function uploadAudio(filePath, fileName) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('uploadAudio erwartet einen gültigen Dateipfad.');
  }

  const containerClient = await getStorageContainerClient();
  const blobName =
    typeof fileName === 'string' && fileName.length > 0
      ? fileName
      : path.basename(filePath);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadFile(filePath, {
    blobHTTPHeaders: {
      blobContentType: getAudioContentType(filePath)
    }
  });

  return {
    audioUrl: getBlobReadUrl(blockBlobClient),
    blobName
  };
}

async function writeAudioFile(audioBuffer, extension) {
  const resolvedExtension = extension === 'wav' ? 'wav' : 'mp3';
  const fileName = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${resolvedExtension}`;
  const filePath = path.join(os.tmpdir(), fileName);

  await fs.promises.writeFile(filePath, audioBuffer);

  return { fileName, filePath };
}

function getAudioContentType(filePath) {
  return path.extname(filePath).toLowerCase() === '.wav'
    ? 'audio/wav'
    : 'audio/mpeg';
}

async function removeTemporaryFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn('Temporäre Audio-Datei konnte nicht gelöscht werden:', error);
    }
  }
}

async function listHistoryEntries() {
  const containerClient = await getStorageContainerClient();
  const entries = await readHistoryIndex(containerClient);

  return entries
    .slice()
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
    .map((entry) => hydrateHistoryEntry(entry, containerClient));
}

async function appendHistoryEntry(entry) {
  const containerClient = await getStorageContainerClient();
  const entries = await readHistoryIndex(containerClient);
  const nextEntry = {
    blobName: entry.blobName,
    contentType: entry.contentType || 'audio/mpeg',
    text: entry.text,
    timestamp: entry.timestamp,
    voice: entry.voice
  };

  entries.unshift(nextEntry);
  await writeHistoryIndex(containerClient, entries);

  return hydrateHistoryEntry(nextEntry, containerClient);
}

async function readHistoryIndex(containerClient) {
  const indexBlobClient = containerClient.getBlockBlobClient(HISTORY_INDEX_BLOB_NAME);

  if (!(await indexBlobClient.exists())) {
    return [];
  }

  const content = await indexBlobClient.downloadToBuffer();

  try {
    const parsedContent = JSON.parse(content.toString('utf8'));

    return Array.isArray(parsedContent) ? parsedContent : [];
  } catch (error) {
    console.warn('History-Index ist ungültig und wird ignoriert:', error);
    return [];
  }
}

async function writeHistoryIndex(containerClient, entries) {
  const indexBlobClient = containerClient.getBlockBlobClient(HISTORY_INDEX_BLOB_NAME);
  const payload = JSON.stringify(entries, null, 2);

  await indexBlobClient.upload(payload, Buffer.byteLength(payload), {
    blobHTTPHeaders: {
      blobContentType: 'application/json'
    }
  });
}

function hydrateHistoryEntry(entry, containerClient) {
  const blockBlobClient = containerClient.getBlockBlobClient(entry.blobName);

  return {
    id: entry.blobName,
    text: entry.text,
    timestamp: entry.timestamp,
    blobName: entry.blobName,
    voice: entry.voice || '',
    contentType: entry.contentType || 'audio/mpeg',
    audioUrl: getBlobReadUrl(blockBlobClient),
    downloadUrl: getDownloadUrl(entry.blobName)
  };
}

async function getStorageContainerClient() {
  if (!blobServiceClient) {
    throw new Error(
      storageConnectionString
        ? `Azure Blob Storage ist ungültig konfiguriert. ${storageInitializationError?.message || ''}`.trim()
        : 'Azure Blob Storage ist nicht konfiguriert. Bitte AZURE_STORAGE_CONNECTION_STRING setzen.'
    );
  }

  const containerClient = blobServiceClient.getContainerClient(AUDIO_CONTAINER_NAME);

  await containerClient.createIfNotExists();

  return containerClient;
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

function createBlobServiceClient(connectionString) {
  if (!connectionString) {
    return null;
  }

  try {
    return BlobServiceClient.fromConnectionString(connectionString);
  } catch (error) {
    storageInitializationError =
      error instanceof Error ? error : new Error(String(error));
    console.warn(
      'Azure Blob Storage Konfiguration ist ungültig:',
      storageInitializationError.message
    );
    return null;
  }
}

function createStorageSharedKeyCredential(connectionString) {
  if (!connectionString) {
    return null;
  }

  const parts = parseConnectionString(connectionString);

  if (!parts.AccountName || !parts.AccountKey) {
    return null;
  }

  try {
    return new StorageSharedKeyCredential(parts.AccountName, parts.AccountKey);
  } catch (error) {
    console.warn(
      'Storage Shared Key Credential konnte nicht erstellt werden:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

function getBlobReadUrl(blockBlobClient) {
  if (!storageSharedKeyCredential) {
    return blockBlobClient.url;
  }

  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000);
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: blockBlobClient.containerName,
      blobName: blockBlobClient.name,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn
    },
    storageSharedKeyCredential
  ).toString();

  return `${blockBlobClient.url}?${sasToken}`;
}

function getDownloadUrl(blobName) {
  return `/api/audio/${encodeURIComponent(blobName)}/download`;
}

function parseConnectionString(connectionString) {
  return connectionString.split(';').reduce((accumulator, part) => {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);

    if (key) {
      accumulator[key] = value;
    }

    return accumulator;
  }, {});
}
