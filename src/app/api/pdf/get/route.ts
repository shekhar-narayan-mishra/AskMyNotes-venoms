import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getSupabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return new NextResponse("Missing fileId", { status: 400 });
        }

        const file = await db.file.findFirst({
            where: {
                id: fileId,
                userId: session.user.id,
            },
        });

        if (!file || !file.supabasePath) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const supabase = getSupabase();

        // Generate a temporary signed URL valid for 60 seconds
        const { data, error } = await supabase.storage
            .from("files")
            .createSignedUrl(file.supabasePath, 60);

        if (error || !data?.signedUrl) {
            console.error("Supabase URL generation error:", error);
            return new NextResponse("Internal Server Error generating file URL", { status: 500 });
        }

        // Redirect the user to the signed URL allowing the browser to render the PDF natively
        return NextResponse.redirect(data.signedUrl);

    } catch (error) {
        console.error("PDF Get Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
