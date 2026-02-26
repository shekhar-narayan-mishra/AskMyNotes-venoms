"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/trpc/react";
import { NoteList } from "@/components/NoteList";
import { ChatInterface } from "@/components/ChatInterface";
import { StudyMode } from "@/components/StudyMode";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GraduationCap, ArrowLeft, Loader2, MessageSquare, BookOpen } from "lucide-react";
import Link from "next/link";

export default function SubjectDetailPage() {
    const { id: subjectId } = useParams<{ id: string }>();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"chat" | "study">("chat");
    const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

    const utils = api.useUtils();

    const { data: subjects, isLoading: isSubjectLoading } = api.subject.list.useQuery();
    const subject = subjects?.find(s => s.id === subjectId);

    const { data: allFiles, isLoading: isFilesLoading } = api.chat.listFiles.useQuery();
    const files = allFiles?.filter(f => f.subjectId === subjectId) || [];

    if (isSubjectLoading || isFilesLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            </div>
        );
    }

    // Edge case: Redirect if subject not found (unauthorized or deleted)
    if (!subject) {
        router.push("/subjects");
        return null;
    }

    const toggleFileSelection = (fileId: string) => {
        setSelectedFileIds(prev =>
            prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
        );
    };

    return (
        <div className="flex min-h-screen flex-col bg-white">
            <header className="sticky top-0 z-50 border-b-2 border-black bg-white">
                <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <Button variant="ghost" size="sm" asChild className="hover:bg-black hover:text-white border-2 border-transparent hover:border-black rounded-none">
                                <Link href="/subjects">
                                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                                </Link>
                            </Button>
                            <div className="h-6 w-0.5 bg-black mx-2" />
                            <div className="flex items-center space-x-2">
                                <div className="star-motif text-blacktext-sm select-none mr-2">*</div>
                                <h1 className="text-2xl font-heading font-black truncate max-w-[200px] sm:max-w-md uppercase">
                                    {subject.name}
                                </h1>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* LEFT COLUMN: Notes & Selection */}
                <div className="lg:col-span-4 flex flex-col space-y-6">
                    <div className="border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                        <NoteList
                            subjectId={subjectId}
                            notes={files}
                            onUploadStart={() => { }}
                            onUploadComplete={() => void utils.chat.listFiles.invalidate()}
                        />
                    </div>

                    <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 space-y-4">
                        <h3 className="font-heading font-bold uppercase text-xl border-b-2 border-black pb-2">Select Documents</h3>
                        {files.length === 0 ? (
                            <p className="text-sm text-black font-bold uppercase tracking-tight">Upload notes above to use the Copilot.</p>
                        ) : (
                            <div className="space-y-3">
                                {files.map(f => (
                                    <div key={f.id} className="flex items-start space-x-3 p-2 hover:bg-black hover:text-white transition-colors border-2 border-transparent hover:border-black">
                                        <input
                                            type="checkbox"
                                            id={`file-${f.id}`}
                                            checked={selectedFileIds.includes(f.id)}
                                            onChange={() => toggleFileSelection(f.id)}
                                            className="mt-0.5 h-4 w-4 rounded-none border-2 border-black accent-black focus:ring-black"
                                        />
                                        <label htmlFor={`file-${f.id}`} className="text-sm font-bold uppercase tracking-tight leading-none cursor-pointer">
                                            {f.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Chat / Study Mode */}
                <div className="lg:col-span-8 flex flex-col space-y-4 h-[calc(100vh-8rem)]">

                    {/* Mode Toggle Bar */}
                    <div className="flex items-center justify-between bg-white border-2 border-black p-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <div className="flex items-center space-x-2 px-3">
                            <span className="text-sm font-heading font-black uppercase tracking-tight">
                                Context: {subject.name}
                            </span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant={activeTab === "chat" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setActiveTab("chat")}
                                className="!rounded-none"
                            >
                                <MessageSquare className="h-4 w-4 mr-2" /> Chat
                            </Button>
                            <Button
                                variant={activeTab === "study" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setActiveTab("study")}
                                className="!rounded-none"
                            >
                                <BookOpen className="h-4 w-4 mr-2" /> Study Mode
                            </Button>
                        </div>
                    </div>

                    {/* Active Panel */}
                    <div className="flex-1 overflow-hidden relative border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-white">
                        <div className={`h-full ${activeTab === "chat" ? "block" : "hidden"}`}>
                            <ChatInterface subjectId={subjectId} selectedFileIds={selectedFileIds} />
                        </div>
                        <div className={`h-full overflow-y-auto pr-2 pb-8 ${activeTab === "study" ? "block" : "hidden"}`}>
                            <StudyMode subjectId={subjectId} selectedFileIds={selectedFileIds} />
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
