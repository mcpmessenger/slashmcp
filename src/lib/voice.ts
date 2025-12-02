const SUPABASE_EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type TranscriptionResponse = {
  text: string;
  language?: string;
  duration?: number;
};

type SynthesisOptions = {
  voice?: string;
  languageCode?: string;
  speakingRate?: number;
  pitch?: number;
};

type SynthesisResponse = {
  audioContent: string;
  audioEncoding: string;
  voice?: string;
};

function assertEnv() {
  if (!SUPABASE_EDGE_URL || SUPABASE_EDGE_URL === "undefined") {
    throw new Error("VITE_SUPABASE_URL is not configured.");
  }
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === "undefined") {
    throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is not configured.");
  }
}

export async function transcribeAudio(blob: Blob, language?: string): Promise<TranscriptionResponse> {
  assertEnv();
  const formData = new FormData();
  formData.append("audio", blob, "speech.webm");
  if (language) {
    formData.append("language", language);
  }

  // Add timeout to prevent hanging
  const TRANSCRIBE_TIMEOUT_MS = 150_000; // 2.5 minutes for client-side timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, TRANSCRIBE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_EDGE_URL}/whisper`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: formData,
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      throw new Error("Transcription timeout: The request took too long. Please try again with a shorter audio clip.");
    }
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to transcribe audio");
  }

  const payload = (await response.json()) as TranscriptionResponse;
  return payload;
}

export async function synthesizeSpeech(text: string, options: SynthesisOptions = {}): Promise<SynthesisResponse> {
  assertEnv();
  if (!text.trim()) {
    throw new Error("Cannot synthesize empty text.");
  }

  // Add timeout to prevent hanging
  const SYNTHESIS_TIMEOUT_MS = 60_000; // 1 minute for TTS
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, SYNTHESIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_EDGE_URL}/google-tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        ...options,
      }),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);
  } catch (fetchError) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      throw new Error("Speech synthesis timeout: The request took too long. Please try again.");
    }
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Failed to synthesize speech");
  }

  const payload = (await response.json()) as SynthesisResponse;
  return payload;
}

