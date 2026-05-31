import { FileCode, FileText, FileJson } from "lucide-react";
import { ProjectFile } from "@/pages/Workspace";

interface FileTreeProps {
  files: ProjectFile[];
  activeFile: string;
  onSelectFile: (filename: string) => void;
}

const FileTree = ({ files, activeFile, onSelectFile }: FileTreeProps) => {
  const getFileIcon = (type: string) => {
    switch (type) {
      case "html":
        return <FileCode className="w-4 h-4 text-orange-400" />;
      case "css":
        return <FileCode className="w-4 h-4 text-blue-400" />;
      case "js":
        return <FileCode className="w-4 h-4 text-yellow-400" />;
      case "json":
        return <FileJson className="w-4 h-4 text-green-400" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="p-2">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-2">
        Files
      </div>
      <div className="space-y-0.5">
        {files.map((file) => (
          <button
            key={file.filename}
            onClick={() => onSelectFile(file.filename)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              activeFile === file.filename
                ? "bg-purple-600/20 text-purple-300"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {getFileIcon(file.type)}
            <span className="truncate">{file.filename}</span>
          </button>
        ))}
        {files.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-4 text-center">
            No files yet. Start a conversation to generate code.
          </p>
        )}
      </div>
    </div>
  );
};

export default FileTree;