"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/trpc/react";
import { useEffect } from "react";

export default function PrivateLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { status } = useSession({
        required: true,
        onUnauthenticated() {
            // It handles redirect to login if session is not valid.
        },
    });

    const router = useRouter();
    const pathname = usePathname() ?? "";

    const { data: subjects, isLoading } = api.subject.list.useQuery(undefined, {
        enabled: status === "authenticated",
    });

    useEffect(() => {
        if (status !== "authenticated" || isLoading) return;

        const hasThreeSubjects = subjects && subjects.length === 3;
        const isSetupPage = pathname.startsWith("/setup");

        if (!hasThreeSubjects && !isSetupPage) {
            router.push("/setup");
        } else if (hasThreeSubjects && isSetupPage) {
            router.push("/subjects");
        }
    }, [status, isLoading, subjects, pathname, router]);

    if (status === "loading" || isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <div className="h-16 w-16 bg-black animate-pulse"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans brutalist-grid lg:p-4">
            {children}
        </div>
    );
}
