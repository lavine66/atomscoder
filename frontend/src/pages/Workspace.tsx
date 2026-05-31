import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { client } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import ChatPanel from "@/components/workspace/ChatPanel";
import FileTree from "@/components/workspace/FileTree";
import CodeEditor from "@/components/workspace/CodeEditor";
import PreviewPanel from "@/components/workspace/PreviewPanel";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import VersionHistory from "@/components/workspace/VersionHistory";

export interface ProjectFile {
  id?: number;
  filename: string;
  content: string;
  type: string;
}

export interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
}

export interface Version {
  id?: number;
  version_number: number;
  snapshot: string;
  message: string;
  created_at?: string;
}

const Workspace = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState<any>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeFile, setActiveFile] = useState<string>("index.html");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [rightPanel, setRightPanel] = useState<"preview" | "code" | "versions">("preview");
  const showFileTree = true;

  useEffect(() => {
    initWorkspace();
  }, [projectId]);

  const initWorkspace = async () => {
    try {
      const res = await client.auth.me();
      if (!res?.data) {
        navigate("/");
        return;
      }
      await loadProject();
      await loadFiles();
      await loadMessages();
      await loadVersions();
    } catch (e) {
      navigate("/");
    }
  };

  const loadProject = async () => {
    try {
      const response = await client.entities.projects.get({ id: projectId! });
      setProject(response.data);
    } catch (e) {
      navigate("/");
    }
  };

  const loadFiles = async () => {
    try {
      const response = await client.entities.project_files.query({
        query: { project_id: Number(projectId) },
        limit: 100,
      });
      const items = response.data?.items || [];
      setFiles(items.map((f: any) => ({
        id: f.id,
        filename: f.filename,
        content: f.content,
        type: f.file_type || f.type || "html",
      })));
    } catch (e) {
      console.error("Failed to load files", e);
    }
  };

  const loadMessages = async () => {
    try {
      const response = await client.entities.conversations.query({
        query: { project_id: Number(projectId) },
        sort: "created_at",
        limit: 200,
      });
      const items = response.data?.items || [];
      setMessages(items.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })));
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await client.entities.versions.query({
        query: { project_id: Number(projectId) },
        sort: "-version_number",
        limit: 50,
      });
      setVersions(response.data?.items || []);
    } catch (e) {
      console.error("Failed to load versions", e);
    }
  };

  const saveFiles = async (newFiles: ProjectFile[]) => {
    // Delete existing files for this project and recreate
    for (const existingFile of files) {
      if (existingFile.id) {
        try {
          await client.entities.project_files.delete({ id: String(existingFile.id) });
        } catch (e) {
          // Ignore delete errors for stale files
        }
      }
    }
    // Create new files
    const savedFiles: ProjectFile[] = [];
    for (const file of newFiles) {
      try {
        const response = await client.entities.project_files.create({
          data: {
            project_id: Number(projectId),
            filename: file.filename,
            content: file.content,
            file_type: file.type,
          },
        });
        savedFiles.push({ ...file, id: response.data?.id });
      } catch (e) {
        console.error("Failed to save file", file.filename, e);
      }
    }
    setFiles(savedFiles);
  };

  const saveVersion = async (newFiles: ProjectFile[], message: string) => {
    const versionNumber = versions.length > 0 ? versions[0].version_number + 1 : 1;
    const snapshot = JSON.stringify(newFiles.map(f => ({
      filename: f.filename,
      content: f.content,
      type: f.type,
    })));
    try {
      await client.entities.versions.create({
        data: {
          project_id: Number(projectId),
          version_number: versionNumber,
          snapshot,
          message,
        },
      });
      await loadVersions();
    } catch (e) {
      console.error("Failed to save version", e);
    }
  };

  const handleSendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isGenerating) return;

    const newUserMsg: Message = { role: "user", content: userMessage };
    setMessages((prev) => [...prev, newUserMsg]);

    // Save user message
    try {
      await client.entities.conversations.create({
        data: {
          project_id: Number(projectId),
          role: "user",
          content: userMessage,
        },
      });
    } catch (e) {
      // Non-critical: message save failure
    }

    setIsGenerating(true);
    setStreamContent("");

    // Build context from existing files
    const projectContext = files.length > 0
      ? files.map(f => `--- ${f.filename} ---\n${f.content}`).join("\n\n")
      : "";

    // Build message history for AI
    const aiMessages = [...messages, newUserMsg].slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await client.apiCall.invoke({
        url: "/api/v1/ai/generate",
        method: "POST",
        data: {
          messages: aiMessages,
          project_context: projectContext,
        },
        options: {
          timeout: 600_000,
        },
      });

      // Extract the AI content from the response
      let fullContent = "";

      if (response.data && typeof response.data === "object" && response.data.content) {
        fullContent = response.data.content;
      } else if (typeof response.data === "string") {
        fullContent = response.data;
      } else {
        fullContent = JSON.stringify(response.data);
      }

      console.log("Raw AI fullContent:", fullContent.substring(0, 300));
      setStreamContent(fullContent);
      await processAIResponse(fullContent);
    } catch (e: any) {
      toast({
        title: "Generation failed",
        description: e?.data?.detail || e?.message || "Failed to generate code",
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  const processAIResponse = async (content: string) => {
    try {
      // Try to parse the JSON response
      let parsed: any = null;
      
      // Extract JSON from potential markdown code blocks (handle ```json, ```JSON, ``` etc.)
      let jsonStr = content.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      
      // Find the outermost JSON object
      const startIdx = jsonStr.indexOf("{");
      const endIdx = jsonStr.lastIndexOf("}");
      if (startIdx >= 0 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }

      parsed = JSON.parse(jsonStr) as any;

      if (parsed && parsed.files && Array.isArray(parsed.files)) {
        const newFiles: ProjectFile[] = parsed.files.map((f: any) => ({
          filename: f.filename,
          content: f.content,
          type: f.type || getFileType(f.filename),
        }));

        setFiles(newFiles);
        if (newFiles.length > 0 && !newFiles.find(f => f.filename === activeFile)) {
          setActiveFile(newFiles[0].filename);
        }

        // Save files and version
        await saveFiles(newFiles);
        await saveVersion(newFiles, parsed.description || "Code updated");

        // Show friendly conversational message in chat (never raw code/JSON)
        const assistantMsg = parsed.description || "I've generated the code for you! You can see the result in the Preview panel on the right. Would you like me to make any changes?";
        setMessages((prev) => [...prev, { role: "assistant", content: assistantMsg }]);
        try {
          await client.entities.conversations.create({
            data: {
              project_id: Number(projectId),
              role: "assistant",
              content: assistantMsg,
            },
          });
        } catch (err) {
          // Non-critical: assistant message save failure
        }

        // Auto-switch to preview so user sees the result
        setRightPanel("preview");
      } else {
        // No valid files structure - show a friendly message, not raw content
        console.warn("AI response did not contain valid files structure:", content.substring(0, 200));
        const assistantMsg = "I generated a response but it didn't contain the expected code structure. Could you try rephrasing your request? For example, try describing the specific app or feature you'd like me to build.";
        setMessages((prev) => [...prev, { role: "assistant", content: assistantMsg }]);
        try {
          await client.entities.conversations.create({
            data: {
              project_id: Number(projectId),
              role: "assistant",
              content: assistantMsg,
            },
          });
        } catch (err) {
          // Non-critical
        }
      }
    } catch (e) {
      // JSON parse failed - show friendly error, log raw content for debugging
      console.error("Failed to parse AI response:", e, "\nRaw content:", content.substring(0, 500));
      const assistantMsg = "I had trouble processing the response. Let me try again — could you describe what you'd like to build in a bit more detail?";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantMsg }]);
      try {
        await client.entities.conversations.create({
          data: {
            project_id: Number(projectId),
            role: "assistant",
            content: assistantMsg,
          },
        });
      } catch (err) {
        // Non-critical
      }
    } finally {
      setIsGenerating(false);
      setStreamContent("");
    }
  };

  const getFileType = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "html" || ext === "htm") return "html";
    if (ext === "css") return "css";
    if (ext === "js") return "js";
    if (ext === "json") return "json";
    return "html";
  };

  const handleRestoreVersion = async (version: Version) => {
    try {
      const snapshot = JSON.parse(version.snapshot);
      const restoredFiles: ProjectFile[] = snapshot.map((f: any) => ({
        filename: f.filename,
        content: f.content,
        type: f.type || getFileType(f.filename),
      }));
      setFiles(restoredFiles);
      await saveFiles(restoredFiles);
      if (restoredFiles.length > 0) {
        setActiveFile(restoredFiles[0].filename);
      }
      toast({ title: `Restored to version ${version.version_number}` });
      setRightPanel("preview");
    } catch (e) {
      toast({ title: "Failed to restore version", variant: "destructive" });
    }
  };

  const handleFileUpdate = (filename: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.filename === filename ? { ...f, content } : f))
    );
  };

  const handlePublish = async () => {
    if (files.length === 0) {
      toast({ title: "No files to publish", variant: "destructive" });
      return;
    }
    try {
      const response = await client.apiCall.invoke({
        url: "/api/v1/publish/deploy",
        method: "POST",
        data: {
          project_id: Number(projectId),
          files: files.map(f => ({
            filename: f.filename,
            content: f.content,
            type: f.type,
          })),
        },
      });
      const url = response.data?.url;
      if (url) {
        toast({ title: "Published successfully!", description: url });
        setProject((prev: any) => ({ ...prev, published_url: url }));
      }
    } catch (e: any) {
      toast({
        title: "Publish failed",
        description: e?.data?.detail || e?.message || "Failed to publish",
        variant: "destructive",
      });
    }
  };

  const currentFile = files.find((f) => f.filename === activeFile);

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f] text-white overflow-hidden">
      <WorkspaceHeader
        project={project}
        rightPanel={rightPanel}
        setRightPanel={setRightPanel}
        onPublish={handlePublish}
        onBack={() => navigate("/")}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat Panel */}
        <div className="w-[380px] min-w-[320px] border-r border-white/10 flex flex-col">
          <ChatPanel
            messages={messages}
            isGenerating={isGenerating}
            streamContent={streamContent}
            onSendMessage={handleSendMessage}
          />
        </div>

        {/* Right: File Tree + Code/Preview */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Tree */}
          {showFileTree && (
            <div className="w-[200px] border-r border-white/10 overflow-y-auto">
              <FileTree
                files={files}
                activeFile={activeFile}
                onSelectFile={setActiveFile}
              />
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {rightPanel === "preview" && (
              <PreviewPanel files={files} />
            )}
            {rightPanel === "code" && (
              <CodeEditor
                file={currentFile}
                onUpdate={handleFileUpdate}
              />
            )}
            {rightPanel === "versions" && (
              <VersionHistory
                versions={versions}
                onRestore={handleRestoreVersion}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workspace;