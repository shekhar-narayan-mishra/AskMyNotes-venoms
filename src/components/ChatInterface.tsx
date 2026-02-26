"use client";

import React, { useRef, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Send, AlertCircle, Volume2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { DefaultChatTransport, type UIMessage } from "ai";

interface ChatInterfaceProps {
    subjectId: string;
    selectedFileIds: string[];
}

export function ChatInterface({ subjectId, selectedFileIds }: ChatInterfaceProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [inputText, setInputText] = useState("");
    const [chatId, setChatId] = useState<string | undefined>(undefined);

    const { messages, status, sendMessage } = useChat({
        transport: new DefaultChatTransport({
            api: "/api/chat",
            prepareSendMessagesRequest: ({ messages, body }) => ({
                body: {
                    message: (messages.at(-1)?.parts.find((part) => part.type === "text") as { type: "text", text: string } | undefined)?.text,
                    subjectId,
                    chatId,
                    ...body,
                },
            }),
        }),
    });

    // Extract chatId from the data stream
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.parts) {
            lastMessage.parts.forEach((p: any) => {
                if (p.type === 'data-chatId' && p.data?.chatId) {
                    setChatId(p.data.chatId);
                }
            });
        }
    }, [messages]);

    const isLoading = status === "submitted" || status === "streaming";

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedFileIds.length === 0 || !inputText.trim() || isLoading) return;
        const text = inputText;
        setInputText("");
        await sendMessage({ text }, { body: { fileIds: selectedFileIds } });
    };

    const handleSpeech = (text: string) => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const answerMatch = text.match(/🧠 Answer\n([\s\S]*?)(?=\n\n📚 Citations|$)/);
            const textToSpeak = answerMatch && answerMatch[1] ? answerMatch[1].trim() : text;
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            window.speechSynthesis.speak(utterance);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white border-none overflow-hidden">
            <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
                <div className="space-y-4 pb-4">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-black py-12">
                            <div className="star-motif mb-4">*</div>
                            <p className="text-xl font-heading font-black uppercase tracking-tight">Ask any question about your selected notes.</p>
                        </div>
                    )}
                    {messages.map((m) => {
                        const content = m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || '';
                        const role = m.role as string;

                        return (
                            <div
                                key={m.id}
                                className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] px-5 py-4 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${role === "user"
                                        ? "bg-black text-white"
                                        : "bg-white text-black"
                                        }`}
                                >
                                    {role === "assistant" && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 float-right ml-2 opacity-100 hover:bg-black hover:text-white border-2 border-transparent hover:border-black rounded-none transition-colors"
                                            onClick={() => handleSpeech(content)}
                                        >
                                            <Volume2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <div className={`prose max-w-none whitespace-pre-wrap font-medium ${role === "user" ? "prose-invert" : ""}`}>
                                        <ReactMarkdown>{content}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] px-4 py-3 flex space-x-2 items-center">
                                <span className="font-heading font-black uppercase text-xs tracking-widest">Generating...</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white flex-shrink-0 border-t-2 border-black">
                {selectedFileIds.length === 0 ? (
                    <div className="flex items-center space-x-2 p-3 text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-red-600 font-bold uppercase tracking-tight">
                        <AlertCircle className="h-4 w-4" />
                        <p className="text-sm">Please select at least one document to ask a question.</p>
                    </div>
                ) : (
                    <form onSubmit={onSubmit} className="flex gap-2">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Type your question..."
                            className="flex-1 w-full bg-white border-2 border-black px-4 py-3 focus:ring-0 focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 font-bold"
                            disabled={isLoading}
                        />
                        <Button
                            type="submit"
                            disabled={isLoading || !inputText.trim()}
                        >
                            <Send className="h-5 w-5" />
                        </Button>
                    </form>
                )}
            </div>
        </div>
    );
}
