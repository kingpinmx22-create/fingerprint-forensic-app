import { storagePut } from "server/storage";
import { ENV } from "./env";
import OpenAI from "openai";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

const openai = new OpenAI({
  apiKey: ENV.forgeApiKey,
});

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  try {
    // Using DALL-E 3 for high quality forensic texture generation
    // Note: DALL-E 3 doesn't support image-to-image in the same way as Forge,
    // so we use the prompt to describe the transformation.
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: options.prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    });

    const base64Data = response.data[0].b64_json;
    if (!base64Data) {
      throw new Error("No image data received from OpenAI");
    }
    
    const buffer = Buffer.from(base64Data, "base64");

    // Save to local storage
    const { url } = await storagePut(
      `generated/${Date.now()}.png`,
      buffer,
      "image/png"
    );
    
    return {
      url,
    };
  } catch (error: any) {
    console.error("OpenAI Image Generation Error:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}
