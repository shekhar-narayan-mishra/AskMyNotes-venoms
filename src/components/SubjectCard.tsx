import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import Link from "next/link";

interface SubjectCardProps {
    id: string;
    name: string;
    notesCount: number;
    color?: string;
}

const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
};

export function SubjectCard({ id, name, notesCount, color = "blue" }: SubjectCardProps) {
    return (
        <Card className="flex flex-col h-full bg-white hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform object-cover">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-2xl font-bold truncate">{name}</CardTitle>
                    <BookOpen className="w-6 h-6 opacity-75" />
                </div>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="flex items-center space-x-2">
                    <p className="font-semibold text-3xl">
                        {notesCount}
                    </p>
                    <p className="text-sm font-medium opacity-80">
                        Uploaded Notes
                    </p>
                </div>
            </CardContent>
            <CardFooter>
                <Button className="w-full font-semibold" variant="default" asChild>
                    <Link href={`/subject/${id}`}>Open Subject</Link>
                </Button>
            </CardFooter>
        </Card>
    );
}
