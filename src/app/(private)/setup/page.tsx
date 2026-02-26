"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/trpc/react";

export default function SetupPage() {
    const router = useRouter();
    const [subjects, setSubjects] = useState(["", "", ""]);

    const { data: existingSubjects, isLoading: isLoadingSubjects } =
        api.subject.list.useQuery();

    const createSubjectsMutation = api.subject.createThree.useMutation({
        onSuccess: () => {
            router.push("/subjects");
        },
        onError: (err) => {
            console.error(err);
            alert(err.message);
        }
    });

    if (isLoadingSubjects) return null;

    useEffect(() => {
        if (existingSubjects && existingSubjects.length === 3) {
            router.push("/subjects");
        }
    }, [existingSubjects, router]);

    if (existingSubjects && existingSubjects.length === 3) {
        return null;
    }

    const handleSubjectChange = (index: number, value: string) => {
        const newSubjects = [...subjects];
        newSubjects[index] = value;
        setSubjects(newSubjects);
    };

    const allFilled = subjects.every((s) => s.trim().length > 0);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!allFilled) return;

        createSubjectsMutation.mutate({
            subjects: subjects.map((name, i) => ({
                name: name.trim(),
                color: ["blue", "purple", "orange"][i] ?? "blue",
            })),
        });
    };

    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
            <Card className="w-full max-w-lg shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold">
                        Create Your 3 Subjects
                    </CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Hackathon Requirement: You must strictly create exactly 3 subjects to proceed.
                    </p>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            {subjects.map((subject, index) => (
                                <div key={index} className="space-y-2">
                                    <label htmlFor={`subject-${index}`} className="text-sm font-medium">
                                        Subject {index + 1}
                                    </label>
                                    <Input
                                        id={`subject-${index}`}
                                        placeholder={`e.g. Mathematics, History, Advanced React...`}
                                        value={subject}
                                        onChange={(e) => handleSubjectChange(index, e.target.value)}
                                        required
                                    />
                                </div>
                            ))}
                        </div>
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={!allFilled || createSubjectsMutation.isPending}
                        >
                            {createSubjectsMutation.isPending ? "Setting up..." : "Save Subjects & Continue"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
