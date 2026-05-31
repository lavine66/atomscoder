import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { client } from "@/lib/client";
import { useToast } from "@/hooks/use-toast";
import { buildConversationWindow, buildFileContext, buildCodeSummary } from "@/lib/aiContext";
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

    // Build smart context from existing files (respects token budget)
    const allMessages = [...messages, newUserMsg];
    const recentForContext = allMessages.slice(-5).map(m => ({
      role: m.role,
      content: m.content,
    }));
    const projectContext = buildFileContext(
      files.map(f => ({ filename: f.filename, content: f.content, type: f.type })),
      recentForContext
    );

    // Build optimized conversation window (keeps first msg + recent + summary)
    const aiMessages = buildConversationWindow(
      allMessages.map(m => ({ role: m.role, content: m.content })),
      14000, // token budget for conversation
      20     // max messages
    );

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

      // Extract the AI content from the response - handle various nesting levels
      let fullContent = "";
      const resData = response.data;

      // Handle potential double-nesting: response.data.data.content
      if (resData && typeof resData === "object") {
        if (resData.content && typeof resData.content === "string") {
          fullContent = resData.content;
        } else if (resData.data && typeof resData.data === "object" && resData.data.content) {
          fullContent = resData.data.content;
        } else if (resData.data && typeof resData.data === "string") {
          fullContent = resData.data;
        } else {
          fullContent = JSON.stringify(resData);
        }
      } else if (typeof resData === "string") {
        fullContent = resData;
      } else {
        fullContent = JSON.stringify(resData);
      }

      console.log("Raw AI response structure:", typeof resData, Object.keys(resData || {}));
      console.log("Extracted fullContent (first 300):", fullContent.substring(0, 300));
      setStreamContent(fullContent);
      await processAIResponse(fullContent);
    } catch (e: any) {
      const errorDetail = e?.data?.detail || e?.response?.data?.detail || e?.message || "Failed to generate code";
      toast({
        title: "Generation failed",
        description: errorDetail,
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  const extractJsonFromContent = (content: string): string | null => {
    const trimmed = content.trim();
    
    // Strategy 1: Remove markdown code blocks (```json, ```JSON, ```javascript, ```)
    const codeBlockPatterns = [
      /```(?:json|JSON)\s*\n?([\s\S]*?)```/,
      /```(?:javascript|js)\s*\n?([\s\S]*?)```/,
      /```\s*\n?([\s\S]*?)```/,
    ];
    
    let extracted = trimmed;
    for (const pattern of codeBlockPatterns) {
      const match = extracted.match(pattern);
      if (match) {
        extracted = match[1].trim();
        break;
      }
    }
    
    // Strategy 2: Find outermost JSON object by brace matching
    const startIdx = extracted.indexOf("{");
    if (startIdx === -1) return null;
    
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < extracted.length; i++) {
      const char = extracted[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === "\\" && inString) {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
    }
    
    if (endIdx > startIdx) {
      return extracted.substring(startIdx, endIdx + 1);
    }
    
    // Strategy 3: Fallback to lastIndexOf
    const lastBrace = extracted.lastIndexOf("}");
    if (lastBrace > startIdx) {
      return extracted.substring(startIdx, lastBrace + 1);
    }
    
    return null;
  };

  const tryRepairJson = (jsonStr: string): string | null => {
    // Try direct parse first
    try {
      JSON.parse(jsonStr);
      return jsonStr;
    } catch {
      // Continue with repair
    }
    
    // Count unclosed braces/brackets
    let inString = false;
    let escapeNext = false;
    let braces = 0;
    let brackets = 0;
    
    for (const char of jsonStr) {
      if (escapeNext) { escapeNext = false; continue; }
      if (char === "\\" && inString) { escapeNext = true; continue; }
      if (char === '"' && !escapeNext) { inString = !inString; continue; }
      if (inString) continue;
      if (char === "{") braces++;
      else if (char === "}") braces--;
      else if (char === "[") brackets++;
      else if (char === "]") brackets--;
    }
    
    let repaired = jsonStr.trimEnd();
    
    // Close unclosed string
    if (inString) repaired += '"';
    
    // Close brackets and braces
    for (let i = 0; i < brackets; i++) repaired += "]";
    for (let i = 0; i < braces; i++) repaired += "}";
    
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      // Continue
    }
    
    // More aggressive: find last complete file object in the files array
    const filesMatch = jsonStr.match(/"files"\s*:\s*\[/);
    if (filesMatch && filesMatch.index !== undefined) {
      const arrayStart = filesMatch.index + filesMatch[0].length;
      let lastCompleteEnd = -1;
      let depth = 0;
      let inStr = false;
      let esc = false;
      
      for (let i = arrayStart; i < jsonStr.length; i++) {
        const c = jsonStr[i];
        if (esc) { esc = false; continue; }
        if (c === "\\" && inStr) { esc = true; continue; }
        if (c === '"' && !esc) { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) lastCompleteEnd = i;
        }
      }
      
      if (lastCompleteEnd > 0) {
        const truncated = jsonStr.substring(0, lastCompleteEnd + 1);
        const repairedJson = truncated + '], "description": "Code generated successfully. Would you like me to make any changes?"}';
        try {
          JSON.parse(repairedJson);
          return repairedJson;
        } catch {
          // Give up
        }
      }
    }
    
    return null;
  };

  const processAIResponse = async (content: string) => {
    try {
      // Try to extract and parse the JSON response
      let parsed: any = null;
      
      // Step 1: Extract JSON string
      const jsonStr = extractJsonFromContent(content);
      
      if (!jsonStr) {
        // Couldn't find JSON at all
        console.error("No JSON object found in AI response. Raw:", content.substring(0, 500));
        throw new Error("No JSON found");
      }
      
      // Step 2: Try to parse directly
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        console.warn("Direct JSON parse failed, attempting repair...", parseError);
        
        // Step 3: Try to repair
        const repaired = tryRepairJson(jsonStr);
        if (repaired) {
          parsed = JSON.parse(repaired);
          console.info("JSON repair successful");
        } else {
          throw parseError;
        }
      }

      if (parsed && parsed.files && Array.isArray(parsed.files)) {
        // Filter out any malformed file entries
        const validFiles = parsed.files.filter((f: any) => 
          f && typeof f.filename === "string" && typeof f.content === "string"
        );
        
        if (validFiles.length === 0) {
          throw new Error("No valid file entries found");
        }

        const newFiles: ProjectFile[] = validFiles.map((f: any) => ({
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

        // Build a richer assistant message with code summary for context
        const description = parsed.description || "I've generated the code for you! You can see the result in the Preview panel on the right. Would you like me to make any changes?";
        const codeSummary = buildCodeSummary(newFiles, description);
        
        // Show friendly message in chat UI
        setMessages((prev) => [...prev, { role: "assistant", content: description }]);
        
        // Save with code summary so AI has richer context in future turns
        try {
          await client.entities.conversations.create({
            data: {
              project_id: Number(projectId),
              role: "assistant",
              content: codeSummary,
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
      // JSON parse failed - show friendly error with auto-retry option
      console.error("Failed to parse AI response:", e, "\nRaw content:", content.substring(0, 500));
      const assistantMsg = "I had trouble processing the AI response. This can happen with complex requests. Let me try again — could you describe what you'd like to build in a bit more detail, or try a simpler request first?";
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