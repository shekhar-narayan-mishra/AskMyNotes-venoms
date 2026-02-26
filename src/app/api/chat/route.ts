import { google } from "@ai-sdk/google";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
} from "ai";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

import { InferenceClient } from "@huggingface/inference";
import { QdrantClient } from "@qdrant/js-client-rest";

const hf = new InferenceClient(process.env.HUGGINGFACE_API_KEY);
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const collectionName = "document-embeddings-hf";

const ensureCollectionExists = async () => {
  try {
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(
      (collection) => collection.name === collectionName,
    );

    if (!collectionExists) {
      console.log(`Collection "${collectionName}" not found. Creating it...`);
      await qdrantClient.createCollection(collectionName, {
        vectors: {
          size: 384,
          distance: "Cosine",
        },
      });
      console.log(`Collection "${collectionName}" created successfully.`);
    }
  } catch (error) {
    console.error("Error ensuring collection exists:", error);
    throw error;
  }
};

const STRICT_PROMPT = `
You are AskMyNotes, a highly strict academic copilot.
You MUST format your answer EXACTLY according to the structure below. Do not add conversational filler.

## CONTEXT:
{context}

## CHAT HISTORY:
{chatHistory}

## QUESTION:
{question}

## REQUIRED OUTPUT FORMAT:

🧠 Answer
[Write a comprehensive answer based ONLY on the context provided. Do not invent information.]

📚 Citations
[List citations in this format: filename (Page X) or filename (Chunk X)]

🔍 Supporting Evidence
"[Exact quote 1 from context]"
"[Exact quote 2 from context]"

📊 Confidence: {confidence}

If you cannot answer the question based on the context, you MUST ignore the above format and instead output EXACTLY:
Not found in your notes for {subjectName}
`;

const requestSchema = z.object({
  message: z.string(),
  chatId: z.string().optional(),
  subjectId: z.string(),
  fileIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Debug Redis and Qdrant env
    console.log("REDIS_URL:", process.env.REDIS_URL);
    console.log("QDRANT_URL:", process.env.QDRANT_URL);
    console.log(
      "QDRANT_API_KEY:",
      process.env.QDRANT_API_KEY ? "set" : "not set",
    );
    const session = await auth();

    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = (await req.json()) as unknown;
    const { message, chatId, subjectId, fileIds } = requestSchema.parse(body);

    if (!subjectId) {
      return new Response("Please select the subject from which you need the answers from.", { status: 400 });
    }

    const subject = await db.subject.findFirst({
      where: { id: subjectId, userId: session.user.id }
    });
    if (!subject) {
      return new Response("Please select the subject from which you need the answers from.", { status: 400 });
    }

    if (!fileIds || fileIds.length === 0) {
      return new Response("Please select at least one note to answer from.", { status: 400 });
    }

    let currentChatId = chatId;
    let messageHistory: Array<{ role: "user" | "assistant"; content: string }> =
      [];

    if (currentChatId) {
      const existingMessages = await db.message.findMany({
        where: { chatId: currentChatId },
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      });

      messageHistory = existingMessages.map((msg) => ({
        role: msg.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }));
    } else {
      const chat = await db.chat.create({
        data: {
          userId: session.user.id,
          subjectId: subjectId,
          title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
        },
      });
      currentChatId = chat.id;
    }

    let validFileIds: string[] = [];
    const existingFiles = await db.file.findMany({
      where: {
        id: { in: fileIds },
        userId: session.user.id,
      },
      select: { id: true },
    });
    validFileIds = existingFiles.map((f) => f.id);

    if (validFileIds.length === 0) {
      return new Response("Please select at least one note to answer from.", { status: 400 });
    }

    if (validFileIds.length !== fileIds.length) {
      console.warn(
        `Some file IDs are invalid or don't belong to user. Requested: ${fileIds.length}, Valid: ${validFileIds.length}`,
      );
    }

    await db.message.create({
      data: {
        chatId: currentChatId,
        role: "USER",
        content: message,
        messageFiles: {
          createMany: {
            data: validFileIds.map((fileId) => ({
              fileId,
            })),
          },
        },
      },
    });

    const queryEmbedding = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: message,
    });

    if (!Array.isArray(queryEmbedding)) {
      throw new Error("Failed to generate query embedding.");
    }
    const allRelevantFileIds = validFileIds;

    await ensureCollectionExists();

    // Hackathon Check: Ensure subject has uploaded documents
    const subjectFileCount = await db.file.count({ where: { subjectId, userId: session.user.id } });

    let searchResult: any[] = [];
    if (subjectFileCount > 0) {
      try {
        searchResult = await qdrantClient.search(collectionName, {
          vector: queryEmbedding as number[],
          limit: 5,
          with_payload: true,
          score_threshold: 0.5,
          filter: {
            must: [
              { key: "subjectId", match: { value: subjectId } },
              ...(allRelevantFileIds && allRelevantFileIds.length > 0
                ? [{ key: "fileId", match: { any: allRelevantFileIds } }]
                : [])
            ]
          }
        });
      } catch (err) {
        console.error("Qdrant search error:", err);
        throw err;
      }
    }

    // Safety layer: Double check all results belong to subject
    searchResult = searchResult.filter(r => (r.payload as any)?.subjectId === subjectId);

    // Calculate Confidence
    let confidence: "High" | "Medium" | "Low" = "Low";
    let avgScore = 0;
    if (searchResult.length > 0) {
      avgScore = searchResult.reduce((acc, curr) => acc + (curr.score || 0), 0) / searchResult.length;
      if (avgScore > 0.85) confidence = "High";
      else if (avgScore >= 0.70) confidence = "Medium";
      else confidence = "Low";
    }

    // Strict "Not Found" Handler
    if (searchResult.length === 0 || avgScore < 0.4) {
      const notFoundMessage = `Not found in your notes for ${subject.name}`;

      const stream = createUIMessageStream({
        execute: async ({ writer }) => {
          // Immediately write the strict response
          await new Promise(resolve => setTimeout(resolve, 500)); // simulate slight delay

          writer.write({
            type: "data-chatId",
            data: { chatId: currentChatId },
            transient: true,
          });

          const msgId = crypto.randomUUID();
          writer.write({
            type: "text-delta",
            delta: notFoundMessage,
            id: msgId
          });

          writer.write({
            type: "finish"
          });

          await db.message.create({
            data: {
              chatId: currentChatId,
              role: "ASSISTANT",
              content: notFoundMessage
            }
          });
        }
      });
      return createUIMessageStreamResponse({ stream });
    }

    const context = searchResult
      .map((result, index) => {
        type PayloadType = {
          content?: string;
          fileId?: string;
          loc?: { pageNumber?: number };
        };

        const payload = result.payload as PayloadType;
        const content = payload?.content ?? "";
        const fileId = payload?.fileId ?? "";
        const pageNumber = payload?.loc?.pageNumber ?? 1;

        return `---
Source ID: ${index + 1}
File ID: ${fileId}
Page Number: ${pageNumber}
Content: ${content}
---`;
      })
      .join("\n\n");

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const model = google("gemini-2.5-flash");

        const chatHistoryString = messageHistory
          .map((msg) => `${msg.role}: ${msg.content}`)
          .join("\n");

        const finalPrompt = STRICT_PROMPT.replace("{context}", context)
          .replace("{chatHistory}", chatHistoryString)
          .replace("{question}", message)
          .replace("{confidence}", confidence)
          .replace("{subjectName}", subject.name);

        const result = streamText({
          model,
          prompt: finalPrompt,
          temperature: 0.3,
          experimental_transform: smoothStream(),
          onFinish: () => {
            console.log("finished streaming");
          },
        });

        writer.merge(result.toUIMessageStream());
        const fullText = await result.text;

        writer.write({
          type: "data-chatId",
          data: {
            chatId: currentChatId,
          },
          transient: true,
        });

        if (fullText) {
          await db.message.create({
            data: {
              chatId: currentChatId,
              role: "ASSISTANT",
              content: fullText,
              messageSources: {
                createMany: {
                  data: allRelevantFileIds.map((id) => ({ fileId: id })),
                },
              },
            },
          });
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
