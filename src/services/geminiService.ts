import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface PostIdea {
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
  platform: "Instagram" | "TikTok" | "Ambos";
}

export async function generatePostIdeas(niche: string, targetAudience: string, count: number = 5): Promise<PostIdea[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Gere ${count} ideias de posts criativos e virais para o nicho "${niche}" focado no público "${targetAudience}". 
  Para cada ideia, forneça:
  1. Um título curto e chamativo.
  2. Uma descrição do que deve ser o vídeo ou imagem.
  3. Uma legenda pronta para copiar.
  4. Uma lista de 5-10 hashtags relevantes.
  5. A plataforma ideal (Instagram, TikTok ou Ambos).`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            caption: { type: Type.STRING },
            hashtags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            platform: { 
              type: Type.STRING,
              enum: ["Instagram", "TikTok", "Ambos"]
            }
          },
          required: ["title", "description", "caption", "hashtags", "platform"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Error parsing AI response:", e);
    return [];
  }
}

export async function generateTrends(niche: string): Promise<string[]> {
  const model = "gemini-3-flash-preview";
  const prompt = `Liste 5 tendências atuais e virais para o nicho "${niche}" no Instagram e TikTok. 
  Seja específico e forneça ideias de ganchos (hooks) para cada tendência.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Error parsing AI response:", e);
    return [];
  }
}
