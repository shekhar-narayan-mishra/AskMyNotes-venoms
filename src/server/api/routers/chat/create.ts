import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { base64ToFile } from "@/lib/utils";
import { uploadToSupabase } from "./helper";
import { getSupabase } from "@/lib/supabase";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { QdrantClient } from "@qdrant/js-client-rest";

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});
const collectionName = "document-embeddings-hf";

export const chatRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const chats = await ctx.db.chat.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    return chats;
  }),

  create: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chat.create({
        data: {
          title: input.title,
          userId: ctx.session.user.id,
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              content: true,
              role: true,
              createdAt: true,
              messageFiles: {
                include: {
                  file: true,
                },
              },
              messageSources: {
                include: {
                  file: true,
                },
              },
            },
          },
        },
      });

      if (!chat) {
        throw new Error("Chat not found");
      }
      return chat;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.chat.delete({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
      });
    }),

  uploadFiles: protectedProcedure
    .input(
      z.object({
        base64Files: z.array(
          z.object({
            name: z.string(),
            type: z.string(),
            base64: z.string(),
          }),
        ),
        subjectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { base64Files, subjectId } = input;
        const files = base64Files.map((file) =>
          base64ToFile(file.base64, file.name),
        );

        const uploadedFiles = await Promise.all(
          files.map(async (file) => {
            try {
              return await uploadToSupabase(file, ctx.session.user.id, subjectId);
            } catch (error) {
              console.error("Error uploading file:", error);
              throw new Error(`Failed to upload file: ${file.name}`);
            }
          }),
        );

        return {
          files: uploadedFiles.map((f) => ({
            id: f.id,
            name: f.name,
            fileType: f.type,
          })),
        };
      } catch (error) {
        console.error("Error in uploadFiles mutation:", error);
        throw new Error("Failed to upload files");
      }
    }),

  listFiles: protectedProcedure.query(async ({ ctx }) => {
    const files = await ctx.db.file.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        size: true,
        fileType: true,
        createdAt: true,
        supabasePath: true,
        subjectId: true,
      },
    });
    return files;
  }),

  deleteFile: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const file = await ctx.db.file.findFirst({
        where: {
          id: input.fileId,
          userId: ctx.session.user.id,
        },
      });

      if (!file) {
        throw new Error(
          "File not found or you don't have permission to delete it",
        );
      }

      try {
        // Delete from Supabase storage
        const supabase = getSupabase();
        const { error: storageError } = await supabase.storage
          .from("files")
          .remove([file.supabasePath]);

        if (storageError) {
          console.error("Error deleting from Supabase storage:", storageError);
        }

        // Delete from database
        await ctx.db.file.delete({
          where: { id: input.fileId },
        });

        // Delete embeddings from Qdrant
        try {
          await qdrantClient.delete(collectionName, {
            filter: {
              must: [{ key: "fileId", match: { value: input.fileId } }]
            }
          });
        } catch (err) {
          console.error("Failed to delete from Qdrant:", err);
        }

        return { success: true };
      } catch (error) {
        console.error("Error deleting file:", error);
        throw new Error("Failed to delete file");
      }
    }),

  generateQuiz: protectedProcedure
    .input(
      z.object({
        fileId: z.string(),
        quizType: z.enum(["MCQ", "SAQ", "LAQ"]),
        numberOfQuestions: z.number().min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { fileId, quizType, numberOfQuestions } = input;

        const file = await ctx.db.file.findFirst({
          where: {
            id: fileId,
            userId: ctx.session.user.id,
          },
        });

        if (!file) {
          throw new Error(
            "File not found or you don't have permission to access it",
          );
        }

        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const response = await fetch(
          `${baseUrl}/api/pdf/full-text?fileId=${fileId}`,
        );

        if (!response.ok) {
          throw new Error("Failed to extract PDF content");
        }

        const pdfData = (await response.json()) as {
          fullText?: string;
          pageCount?: number;
          fileName?: string;
        };
        const documentContent = pdfData.fullText?.slice(0, 6000) ?? ""; // Limit for API token constraints

        if (!documentContent.trim()) {
          throw new Error(
            "No text content found in the PDF. Please try re-uploading the document.",
          );
        }

        const quizTypeMap = {
          MCQ: "Multiple Choice Questions with 4 options each",
          SAQ: "Short Answer Questions requiring 2-3 sentence answers",
          LAQ: "Long Answer Questions requiring detailed explanations",
        };

        const prompt = `Based on the following document content, generate exactly ${numberOfQuestions} ${quizTypeMap[quizType]}. 

Document Content:
${documentContent}

Requirements:
1. Generate exactly ${numberOfQuestions} questions
2. Each question should be ${quizType === "MCQ" ? "multiple choice with exactly 4 options (A, B, C, D)" : quizType === "SAQ" ? "short answer" : "long answer"}
3. Include the correct answer for each question
4. Add a brief explanation for each answer
5. Ensure questions test understanding of the document content

${quizType === "MCQ"
            ? `
Format your response as JSON:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Explanation here",
      "topic": "Topic from document"
    }
  ]
}`
            : `
Format your response as JSON:
{
  "questions": [
    {
      "question": "Question text here?",
      "correctAnswer": "Expected answer here",
      "explanation": "Explanation here", 
      "topic": "Topic from document"
    }
  ]
}`
          }

Make sure to return valid JSON only.`;

        const result = await generateText({
          model: google("gemini-3-flash-preview"),
          prompt,
          temperature: 0.7,
        });

        let quizData: { questions?: unknown[] } | undefined;
        try {
          const jsonRegex = /\{[\s\S]*\}/;
          const jsonMatch = jsonRegex.exec(result.text);
          if (jsonMatch?.[0]) {
            quizData = JSON.parse(jsonMatch[0]) as { questions?: unknown[] };
          } else {
            throw new Error("No JSON found in response");
          }
        } catch {
          console.error("Failed to parse AI response:", result.text);
          throw new Error(
            "Failed to generate quiz questions. Please try again.",
          );
        }

        if (!quizData?.questions || !Array.isArray(quizData.questions)) {
          throw new Error("Invalid quiz format generated");
        }

        return {
          questions: quizData.questions,
          metadata: {
            fileId: file.id,
            fileName: file.name,
            quizType,
            numberOfQuestions,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        console.error("Error generating quiz:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to generate quiz",
        );
      }
    }),

  generateStudyMaterial: protectedProcedure
    .input(z.object({ subjectId: z.string(), fileIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { subjectId, fileIds } = input;

        if (!fileIds || fileIds.length === 0) {
          throw new Error("Please select at least one note to generate study materials.");
        }

        // Find selected files for this subject
        const files = await ctx.db.file.findMany({
          where: { subjectId, userId: ctx.session.user.id, id: { in: fileIds } },
        });

        if (files.length === 0) {
          throw new Error("No documents found for this subject. Please upload notes first.");
        }

        const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        let combinedText = "";

        // Collect text from all subject files
        for (const file of files) {
          try {
            const resp = await fetch(`${baseUrl}/api/pdf/full-text?fileId=${file.id}`);
            if (resp.ok) {
              const data = await resp.json() as { fullText?: string };
              if (data.fullText) {
                combinedText += `\n--- Document: ${file.name} ---\n${data.fullText.slice(0, 15000)}\n`;
              }
            }
          } catch (e) {
            console.error("Failed to parse file text for study mode:", e);
          }
        }

        if (!combinedText.trim()) {
          throw new Error("Could not extract text from uploaded documents.");
        }

        // Limit total text to prevent massive token usage, but allow enough context
        combinedText = combinedText.slice(0, 50000);

        const prompt = `Based ONLY on the following texts from the user's uploaded documents, generate a Study Guide containing precisely:
1. 5 Multiple Choice Questions (MCQs)
2. 3 Short Answer Questions (SAQs)

Do not use outside knowledge.

## Document Texts:
${combinedText}

## REQUIREMENTS:
- 5 MCQs: Each must have exactly 4 options, state the correct option clearly, provide a brief explanation, and list citations (e.g. "Filename (Page X)").
- 3 SAQs: Each must have a model answer and list citations.

Respond ONLY with valid JSON matching this schema:
{
  "mcqs": [
    {
      "question": "The question text",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "The exact string of the correct option",
      "explanation": "Brief explanation",
      "citations": ["docname.pdf (Page 2)"]
    }
  ],
  "saqs": [
    {
      "question": "The question text",
      "modelAnswer": "The model answer",
      "citations": ["docname.pdf (Page 5)"]
    }
  ]
}
`;

        const result = await generateText({
          model: google("gemini-2.5-flash"),
          prompt,
          temperature: 0.4,
        });

        let studyData: any;
        const jsonMatch = /\{[\s\S]*\}/.exec(result.text);
        if (jsonMatch) {
          studyData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("LLM did not return JSON");
        }

        return studyData as {
          mcqs: Array<{ question: string, options: string[], correctAnswer: string, explanation: string, citations: string[] }>,
          saqs: Array<{ question: string, modelAnswer: string, citations: string[] }>
        };

      } catch (error) {
        console.error("Error generating study material:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to generate study material");
      }
    }),

  getDashboardStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const totalDocuments = await ctx.db.file.count({
      where: { userId },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const quizAttempts = await ctx.db.quizAttempt.findMany({
      where: {
        quiz: { userId },
      },
      select: {
        score: true,
        totalQuestions: true,
        completedAt: true,
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const quizzesCompleted = quizAttempts.length;

    let averageScore = 0;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (quizAttempts.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const totalPercentage = quizAttempts.reduce((sum, attempt) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
        return sum + Math.round((attempt.score / attempt.totalQuestions) * 100);
      }, 0);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      averageScore = Math.round(totalPercentage / quizAttempts.length);
    }

    const userMessages = await ctx.db.message.findMany({
      where: {
        chat: { userId },
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
      },
    });

    const streak = calculateStreak(userMessages.map((m) => m.createdAt));

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const weeklyQuizzes = quizAttempts.filter(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (attempt) => attempt.completedAt >= oneWeekAgo,
    );
    const weeklyMessages = userMessages.filter(
      (m) => m.createdAt >= oneWeekAgo,
    );

    const studyTimeHours =
      Math.round(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (weeklyQuizzes.length * 0.25 + weeklyMessages.length * 0.08) * 10,
      ) / 10;

    return {
      totalDocuments,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      quizzesCompleted,
      averageScore: averageScore || undefined,
      studyTimeHours,
      streak,
    };
  }),

  saveQuizAttempt: protectedProcedure
    .input(
      z.object({
        fileId: z.string(),
        quizType: z.enum(["MCQ", "SAQ", "LAQ"]),
        numberOfQuestions: z.number(),
        score: z.number(),
        answers: z.any(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const quiz = await ctx.db.quiz.create({
        data: {
          userId,
          fileId: input.fileId,
          title: input.title ?? "Untitled Quiz",
          quizType: input.quizType,
          numberOfQuestions: input.numberOfQuestions,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const quizAttempt = await ctx.db.quizAttempt.create({
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          quizId: quiz.id,
          score: input.score,
          totalQuestions: input.numberOfQuestions,
          answers: input.answers as Prisma.InputJsonValue,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      return { quiz, quizAttempt };
    }),

  // Get recent quiz attempts
  getRecentQuizzes: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const limit = input?.limit ?? 5;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const recentAttempts = await ctx.db.quizAttempt.findMany({
        where: {
          quiz: {
            userId,
          },
        },
        take: limit,
        orderBy: {
          completedAt: "desc",
        },
        include: {
          quiz: {
            include: {
              file: true,
            },
          },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return recentAttempts.map((attempt) => ({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        id: attempt.id,
        quiz: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          title: attempt.quiz.title,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          quizType: attempt.quiz.quizType,
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        score: attempt.score,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        totalQuestions: attempt.totalQuestions,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        completedAt: attempt.completedAt.toISOString(),
        file: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          name: attempt.quiz.file.name,
        },
      }));
    }),
});

function calculateStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const uniqueDays = [
    ...new Set(
      dates.map((date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      }),
    ),
  ].sort((a, b) => b - a);

  let streak = 0;
  let currentDate = today.getTime();

  for (const dayTime of uniqueDays) {
    if (dayTime === currentDate) {
      streak++;
      currentDate -= 24 * 60 * 60 * 1000; // Go back one day
    } else if (dayTime === currentDate + 24 * 60 * 60 * 1000) {
      if (streak === 0) {
        streak++;
        currentDate = dayTime - 24 * 60 * 60 * 1000;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}
