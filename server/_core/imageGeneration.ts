import { storagePut } from "server/storage";
import { Jimp } from "jimp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  try {
    console.log("Starting local forensic image processing...");
    
    if (!options.originalImages || options.originalImages.length === 0) {
      throw new Error("No original image provided for processing");
    }

    const original = options.originalImages[0];
    let image: any;

    if (original.b64Json) {
      const buffer = Buffer.from(original.b64Json, "base64");
      image = await Jimp.read(buffer);
    } else if (original.url) {
      // If it's a local path, read it from disk
      if (original.url.startsWith("/uploads/")) {
        const fileName = original.url.replace("/uploads/", "");
        const filePath = path.resolve(__dirname, "../../public/uploads", fileName);
        image = await Jimp.read(filePath);
      } else {
        image = await Jimp.read(original.url);
      }
    } else {
      throw new Error("Invalid image data provided");
    }

    // --- FORENSIC TEXTURE ALGORITHM (Local Implementation) ---
    // 1. Convert to Grayscale for ridge analysis
    image.greyscale();
    
    // 2. Enhance contrast to define ridges
    image.contrast(0.8);
    
    // 3. Apply a subtle "Cellular Membrane" texture effect
    // We simulate this by adding controlled noise and edge enhancement
    // specifically on the ridge areas (dark pixels)
    const width = image.bitmap.width;
    const height = image.bitmap.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        const r = image.bitmap.data[idx];
        
        // If it's a ridge (dark pixel)
        if (r < 128) {
          // Add granular texture (simulating cellular membrane)
          const noise = (Math.random() - 0.5) * 40;
          const newVal = Math.max(0, Math.min(255, r + noise));
          image.bitmap.data[idx] = newVal;     // R
          image.bitmap.data[idx + 1] = newVal; // G
          image.bitmap.data[idx + 2] = newVal; // B
        } else {
          // Clean valleys (make them pure white for forensic clarity)
          image.bitmap.data[idx] = 255;
          image.bitmap.data[idx + 1] = 255;
          image.bitmap.data[idx + 2] = 255;
        }
      }
    }

    // 4. Final sharpen to define the new texture
    image.convolute([
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0]
    ]);

    const processedBuffer = await image.getBuffer("image/png");

    // Save to local storage
    const { url } = await storagePut(
      `generated/${Date.now()}.png`,
      processedBuffer,
      "image/png"
    );
    
    console.log("Local processing complete. Result saved to:", url);
    
    return {
      url,
    };
  } catch (error: any) {
    console.error("Local Image Processing Error:", error);
    throw new Error(`Local processing failed: ${error.message}`);
  }
}
