import { useEffect, useRef } from "react";
import { ProjectFile } from "@/pages/Workspace";

interface CodeEditorProps {
  file: ProjectFile | undefined;
  onUpdate: (filename: string, content: string) => void;
}

const CodeEditor = ({ file, onUpdate }: CodeEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current && file) {
      textareaRef.current.value = file.content;
    }
  }, [file?.filename, file?.content]);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Select a file to edit</p>
      </div>
    );
  }

  const getLanguageLabel = (type: string) => {
    switch (type) {
      case "html": return "HTML";
      case "css": return "CSS";
      case "js": return "JavaScript";
      case "json": return "JSON";
      default: return type.toUpperCase();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-10 border-b border-white/10 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white font-medium">{file.filename}</span>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            {getLanguageLabel(file.type)}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <textarea
          ref={textareaRef}
          defaultValue={file.content}
          onChange={(e) => onUpdate(file.filename, e.target.value)}
          className="absolute inset-0 w-full h-full bg-[#0d0d14] text-gray-200 font-mono text-sm p-4 resize-none focus:outline-none leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default CodeEditor;