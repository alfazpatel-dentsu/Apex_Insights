import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

/**
 * Genkit instance initialized with Google AI plugin.
 * The plugin automatically looks for GOOGLE_GENAI_API_KEY or GEMINI_API_KEY in environment variables.
 * Ensure you have set one of these in your .env file with a valid Google AI API key.
 */
export const ai = genkit({
  plugins: [
    googleAI(),
  ],
});

export function assertGoogleAiConfigured() {
  if (!process.env.GOOGLE_GENAI_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) {
    throw new Error(
      'Gemini API key is not configured. In Firebase App Hosting, create the GEMINI_API_KEY Secret Manager secret and deploy the backend. For local development only, set GEMINI_API_KEY in .env.local and restart the development server.'
    );
  }
}

export { z };
