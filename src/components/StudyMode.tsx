"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, BookOpen, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface StudyModeProps {
    subjectId: string;
    selectedFileIds: string[];
}

interface MCQ {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    citations: string[];
}

interface SAQ {
    question: string;
    modelAnswer: string;
    citations: string[];
}

export function StudyMode({ subjectId, selectedFileIds }: StudyModeProps) {
    const [studyMaterial, setStudyMaterial] = useState<{ mcqs: MCQ[], saqs: SAQ[] } | null>(null);

    const generateMaterialMutation = api.chat.generateStudyMaterial.useMutation({
        onSuccess: (data) => {
            setStudyMaterial(data);
        }
    });

    const handleGenerate = () => {
        generateMaterialMutation.mutate({ subjectId, fileIds: selectedFileIds });
    };

    if (!studyMaterial) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="h-16 w-16 text-blue-500/20 mb-4" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Study Mode is Ready</h3>
                <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                    Generate 5 Multiple Choice Questions and 3 Short Answer Questions based ONLY on your selected notes.
                </p>

                {selectedFileIds.length === 0 ? (
                    <div className="mt-6 flex max-w-sm items-center space-x-2 p-3 text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium text-left">Please select at least one note from the sidebar to use Study Mode.</span>
                    </div>
                ) : (
                    <Button
                        className="mt-6 bg-blue-600 hover:bg-blue-700"
                        onClick={handleGenerate}
                        disabled={generateMaterialMutation.isPending}
                    >
                        {generateMaterialMutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating Study Guide...
                            </>
                        ) : (
                            "Generate Study Material"
                        )}
                    </Button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-2 border-black pb-4">
                <h2 className="text-4xl font-heading font-black tracking-tighter uppercase text-black">Study Guide</h2>
                <Button variant="outline" onClick={() => setStudyMaterial(null)} className="mt-4 sm:mt-0">Start Over</Button>
            </div>

            <div className="space-y-6">
                <div className="flex items-center space-x-4 mb-4">
                    <div className="star-motif text-black">*</div>
                    <h3 className="text-2xl font-heading font-bold uppercase tracking-tight">Multiple Choice</h3>
                </div>
                {studyMaterial?.mcqs.map((mcq, idx) => (
                    <MCQCard key={`mcq-${idx}`} mcq={mcq} index={idx + 1} />
                ))}
            </div>

            <div className="space-y-6 mt-12">
                <div className="flex items-center space-x-4 mb-4">
                    <div className="star-motif text-black">*</div>
                    <h3 className="text-2xl font-heading font-bold uppercase tracking-tight">Short Answer</h3>
                </div>
                {studyMaterial?.saqs.map((saq, idx) => (
                    <SAQCard key={`saq-${idx}`} saq={saq} index={idx + 1} />
                ))}
            </div>
        </div>
    );
}

function MCQCard({ mcq, index }: { mcq: MCQ, index: number }) {
    const [showAnswer, setShowAnswer] = useState(false);

    return (
        <Card className="border-none bg-white shadow-none mb-8">
            <CardHeader className="bg-black text-white p-4 border-b-2 border-black">
                <CardTitle className="text-xl font-heading font-black uppercase tracking-tight">Question {index}</CardTitle>
                <CardDescription className="text-lg font-bold text-white mt-2">
                    {mcq.question}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 border-x-2 border-b-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="space-y-2">
                    {mcq.options.map((option, i) => (
                        <div key={i} className="flex items-start p-3 border-2 border-black hover:bg-black hover:text-white transition-colors cursor-pointer group">
                            <span className="font-heading font-black mr-3">{["A", "B", "C", "D"][i]}.</span>
                            <span className="font-bold">{option}</span>
                        </div>
                    ))}
                </div>

                <Button variant="outline" onClick={() => setShowAnswer(!showAnswer)} className="w-full mt-4">
                    {showAnswer ? "Hide Correct Answer" : "Show Correct Answer"}
                </Button>

                {showAnswer && (
                    <div className="mt-4 p-4 bg-black text-white border-2 border-black space-y-2 animate-in fade-in slide-in-from-top-2">
                        <p className="font-heading font-black uppercase text-lg">
                            Correct Answer: {mcq.correctAnswer}
                        </p>
                        <p className="text-sm font-medium">
                            {mcq.explanation}
                        </p>
                        {mcq.citations && mcq.citations.length > 0 && (
                            <div className="mt-2 text-xs font-bold uppercase opacity-75">
                                Citations: {mcq.citations.join(", ")}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function SAQCard({ saq, index }: { saq: SAQ, index: number }) {
    const [showAnswer, setShowAnswer] = useState(false);

    return (
        <Card className="border-none bg-white shadow-none mb-8">
            <CardHeader className="bg-black text-white p-4 border-b-2 border-black">
                <CardTitle className="text-xl font-heading font-black uppercase tracking-tight">SAQ {index}</CardTitle>
                <CardDescription className="text-lg font-bold text-white mt-2">
                    {saq.question}
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 border-x-2 border-b-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <Button variant="outline" onClick={() => setShowAnswer(!showAnswer)} className="w-full">
                    {showAnswer ? "Hide Model Answer" : "Show Model Answer"}
                </Button>

                {showAnswer && (
                    <div className="mt-4 p-4 bg-black text-white border-2 border-black space-y-2 animate-in fade-in slide-in-from-top-2">
                        <h4 className="font-heading font-black uppercase text-lg">Model Answer</h4>
                        <p className="text-sm font-medium">
                            {saq.modelAnswer}
                        </p>
                        {saq.citations && saq.citations.length > 0 && (
                            <div className="mt-2 text-xs font-bold uppercase opacity-75">
                                Citations: {saq.citations.join(", ")}
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
