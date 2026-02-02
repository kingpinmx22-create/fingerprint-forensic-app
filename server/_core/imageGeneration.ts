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

// Configure OpenAI client to use Manus Forge endpoint
const openai = new OpenAI({
  apiKey: ENV.forgeApiKey,
  baseURL: "https://forge.manus.computer/v1",
});

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_KEY is not configured");
  }

  try {
    // Use the OpenAI-compatible endpoint of Manus Forge
    const response = await openai.images.generate({
      model: "gpt-4.1-nano", // Use the appropriate model for image generation in Forge
      prompt: options.prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    } as any);

    const base64Data = (response.data[0] as any).b64_json;
    if (!base64Data) {
      throw new Error("No image data received from Forge API");
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
    console.error("Forge Image Generation Error:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}
