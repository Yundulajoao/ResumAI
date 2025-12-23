
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { GenerationResult } from "../types";

const SYSTEM_INSTRUCTION = `
Você é um Arquiteto de Estudos e Especialista em Pedagogia. 
Sua tarefa é analisar o conteúdo fornecido (texto, uma ou mais imagens, PDFs, documentos, URLs ou UM ASSUNTO/TÓPICO) e gerar TRÊS versões diferentes de resumo didático.

Regras de Saída:
1. Gere 3 opções de resumo com focos diferentes:
   - Opção 1: "Padrão" (Equilibrado, focado em tópicos).
   - Opção 2: "Simplificado" (Linguagem extremamente simples para revisão rápida).
   - Opção 3: "Aprofundado" (Com mais detalhes técnicos e contexto).
2. Flashcards: Gere exatamente 3 perguntas e respostas baseadas no conteúdo geral.

Orientações de Processamento:
- Se múltiplas imagens forem enviadas, analise a conexão entre elas para criar um resumo unificado e coerente.
- Se uma URL for fornecida, utilize a ferramenta de busca para obter o conteúdo.
- Se um ASSUNTO (tópico) for fornecido, utilize a ferramenta de busca para realizar uma pesquisa abrangente e atualizada antes de gerar os resumos.
- Se arquivos forem fornecidos, extraia o conhecimento de todos eles.
`;

export interface FileInput {
  data: string;
  mimeType: string;
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateSpeech(text: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Leia este resumo de forma clara e profissional: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Charon' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Falha ao gerar áudio.");
    return base64Audio;
  }

  async processContent(
    text?: string,
    files?: FileInput[],
    url?: string,
    topic?: string
  ): Promise<GenerationResult> {
    const model = "gemini-3-flash-preview";
    
    const parts: any[] = [];
    
    if (topic) {
      parts.push({ text: `Por favor, aja como um especialista e crie um resumo completo sobre o assunto: ${topic}` });
    } else if (url) {
      parts.push({ text: `Por favor, resuma o conteúdo deste link: ${url}` });
    } else {
      if (text) parts.push({ text: `Texto para processar: ${text}` });
      if (files && files.length > 0) {
        files.forEach(file => {
          const data = file.data.includes(',') ? file.data.split(',')[1] : file.data;
          parts.push({
            inlineData: {
              data: data,
              mimeType: file.mimeType
            }
          });
        });
        parts.push({ text: "Analise o conteúdo destes arquivos (imagens ou documentos) para realizar um resumo unificado." });
      }
    }

    if (parts.length === 0) {
      throw new Error("Nenhum conteúdo fornecido para processamento.");
    }

    const useSearch = !!(url || topic);

    const response = await this.ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING, description: "Título da versão (ex: Padrão, Simplificado, Aprofundado)" },
                  content: { type: Type.STRING, description: "O conteúdo do resumo em Markdown." },
                },
                required: ["label", "content"],
              },
              description: "Três versões diferentes de resumo.",
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                },
                required: ["question", "answer"],
              },
            },
          },
          required: ["options", "flashcards"],
        },
      },
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("A IA não retornou uma resposta válida.");
    
    const result = JSON.parse(textResponse);
    return {
      options: result.options || [],
      flashcards: result.flashcards || [],
    };
  }
}
