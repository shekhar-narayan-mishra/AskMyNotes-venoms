"use client";

import React from "react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogOut, GraduationCap, Loader2 } from "lucide-react";
import { SubjectCard } from "@/components/SubjectCard";
import { useRouter } from "next/navigation";

export default function SubjectsPage() {
    const { data: session } = useSession();
    const router = useRouter();

    const { data: subjects, isLoading: isLoadingSubjects } = api.subject.list.useQuery();

    const handleSignOut = () => {
        void signOut({ callbackUrl: "/auth/signin" });
    };

    const userFirstName = session?.user?.name?.split(" ")[0] ?? "";

    if (isLoadingSubjects) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                    <p className="text-gray-500 dark:text-gray-400">Loading your subjects...</p>
                </div>
            </div>
        );
    }

    // Enforce exactly 3 subjects per hackathon constraints
    if (subjects && subjects.length !== 3) {
        router.push("/setup");
        return null;
    }

    return (
        <div className="flex min-h-screen flex-col bg-white">
            {/* TOP BAR */}
            <header className="sticky top-0 z-50 border-b-2 border-black bg-white">
                <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <h1 className="text-2xl font-heading font-black tracking-tighter uppercase text-black">
                                AskMyNotes
                            </h1>
                        </div>

                        <div className="flex items-center space-x-4">
                            <Button
                                variant="outline"
                                size="sm"
                                className="cursor-pointer"
                                onClick={handleSignOut}
                            >
                                <LogOut className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">Sign Out</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* MAIN SCREEN */}
            <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col p-4 sm:p-8 lg:p-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mb-12 border-b-2 border-black pb-8 flex flex-col md:flex-row justify-between items-end gap-4">
                    <div className="text-left">
                        <div className="star-motif text-black mb-4">*</div>
                        <h2 className="text-5xl md:text-7xl font-heading font-black tracking-tighter uppercase text-black leading-none">
                            Welcome<br />Back,<br />{userFirstName}
                        </h2>
                    </div>
                    <p className="text-xl md:text-2xl font-bold max-w-sm text-right leading-tight">
                        Select a subject to upload notes and start studying.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {subjects?.map((subject) => (
                        <SubjectCard
                            key={subject.id}
                            id={subject.id}
                            name={subject.name}
                            notesCount={subject._count.files}
                        />
                    ))}
                </div>
            </main>
        </div>
    );
}
