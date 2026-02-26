import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const subjectRouter = createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx }) => {
        return ctx.db.subject.findMany({
            where: {
                userId: ctx.session.user.id,
            },
            orderBy: {
                createdAt: "asc",
            },
            include: {
                _count: {
                    select: { files: true },
                },
            }
        });
    }),

    createThree: protectedProcedure
        .input(
            z.object({
                subjects: z.array(
                    z.object({
                        name: z.string().min(1, "Name is required"),
                        color: z.string().default("blue"),
                    })
                ).length(3, "Exactly 3 subjects must be provided"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const existingSubjects = await ctx.db.subject.count({
                where: { userId: ctx.session.user.id },
            });

            if (existingSubjects >= 3) {
                throw new Error("You already have 3 subjects.");
            }

            await ctx.db.subject.deleteMany({
                where: { userId: ctx.session.user.id },
            });

            return ctx.db.$transaction(
                input.subjects.map((s) =>
                    ctx.db.subject.create({
                        data: {
                            name: s.name,
                            color: s.color,
                            userId: ctx.session.user.id,
                        },
                    })
                )
            );
        }),
});
