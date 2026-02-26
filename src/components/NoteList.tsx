"use client";

import React, { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Trash2, Eye, Plus, Loader2 } from "lucide-react";
import { api } from "@/trpc/react";
import { fileToBase64 } from "@/lib/utils";

interface Note {
    id: string;
    name: string;
    createdAt: Date;
}

interface NoteListProps {
    subjectId: string;
    notes: Note[];
    onUploadStart: () => void;
    onUploadComplete: () => void;
}

export function NoteList({ subjectId, notes, onUploadStart, onUploadComplete }: NoteListProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const uploadfileMutation = api.chat.uploadFiles.useMutation();
    const deleteFileMutation = api.chat.deleteFile.useMutation({ // We'll need to create this in trpc if it doesn't exist.
        onSuccess: () => {
            onUploadComplete();
        }
    });

    const handleFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        onUploadStart();
        setIsUploading(true);

        try {
            const uploadPromises = Array.from(selectedFiles).map(async (file) => {
                const base64 = await fileToBase64(file);
                return uploadfileMutation.mutateAsync({
                    base64Files: [
                        {
                            name: file.name,
                            type: file.type,
                            base64,
                        },
                    ],
                    subjectId: subjectId,
                });
            });

            await Promise.allSettled(uploadPromises);
        } catch (err) {
            console.error("Error uploading files", err);
        } finally {
            setIsUploading(false);
            onUploadComplete();
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleDelete = async (fileId: string) => {
        if (confirm("Are you sure you want to delete this note?")) {
            await deleteFileMutation.mutateAsync({ fileId });
        }
    };

    return (
        <Card className="border-none bg-transparent shadow-none">
            <CardHeader className="flex flex-row items-center justify-between p-4 border-b-2 border-black bg-black text-white">
                <CardTitle className="text-xl font-heading font-black uppercase tracking-tight">Documents</CardTitle>
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf, text/plain"
                        multiple
                        onChange={handleFileInputChange}
                        className="hidden"
                    />
                    <Button onClick={handleFileSelect} disabled={isUploading} className="bg-white text-black hover:bg-gray-200 hover:text-black border-2 border-transparent">
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Upload
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 bg-white">
                {notes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center border-b-2 border-black">
                        <FileText className="h-10 w-10 text-black mb-2" />
                        <p className="text-sm font-bold uppercase tracking-tight text-black">
                            No documents uploaded.
                        </p>
                    </div>
                ) : (
                    <ul className="text-sm font-medium text-black">
                        {notes.map((note) => (
                            <li
                                key={note.id}
                                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3 border-b-2 border-black bg-white hover:bg-black hover:text-white transition-colors group"
                            >
                                <div className="flex items-center space-x-3 w-full sm:w-auto overflow-hidden">
                                    <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center border-2 border-black bg-white group-hover:border-white">
                                        <FileText className="h-4 w-4 text-black group-hover:text-black" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate sm:max-w-[200px] md:max-w-xs font-bold uppercase tracking-tight">{note.name}</p>
                                        <p className="text-xs font-bold uppercase opacity-70">
                                            {new Date(note.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-shrink-0">
                                    <Button variant="outline" size="sm" onClick={() => window.open(`/api/pdf/get?fileId=${note.id}`, '_blank')} className="group-hover:bg-white group-hover:text-black">
                                        <Eye className="h-4 w-4 mr-1 sm:mr-2" />
                                        <span>View</span>
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDelete(note.id)}>
                                        <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                                        <span>Delete</span>
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
