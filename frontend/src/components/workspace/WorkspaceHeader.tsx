import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Code2, History, Rocket, ExternalLink } from "lucide-react";

interface WorkspaceHeaderProps {
  project: any;
  rightPanel: "preview" | "code" | "versions";
  setRightPanel: (panel: "preview" | "code" | "versions") => void;
  onPublish: () => void;
  onBack: () => void;
}

const WorkspaceHeader = ({
  project,
  rightPanel,
  setRightPanel,
  onPublish,
  onBack,
}: WorkspaceHeaderProps) => {
  return (
    <header className="h-14 border-b border-white/10 px-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Code2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm truncate max-w-[200px]">
            {project?.name || "Loading..."}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex bg-white/5 rounded-lg p-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightPanel("preview")}
            className={`text-xs px-3 rounded-md ${
              rightPanel === "preview"
                ? "bg-purple-600 text-white hover:bg-purple-600 hover:text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightPanel("code")}
            className={`text-xs px-3 rounded-md ${
              rightPanel === "code"
                ? "bg-purple-600 text-white hover:bg-purple-600 hover:text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 mr-1.5" />
            Code
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRightPanel("versions")}
            className={`text-xs px-3 rounded-md ${
              rightPanel === "versions"
                ? "bg-purple-600 text-white hover:bg-purple-600 hover:text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5 mr-1.5" />
            Versions
          </Button>
        </div>

        <div className="ml-3 flex items-center gap-2">
          {project?.published_url && (
            <a
              href={project.published_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Live
            </a>
          )}
          <Button
            onClick={onPublish}
            size="sm"
            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-xs"
          >
            <Rocket className="w-3.5 h-3.5 mr-1.5" />
            Publish
          </Button>
        </div>
      </div>
    </header>
  );
};

export default WorkspaceHeader;