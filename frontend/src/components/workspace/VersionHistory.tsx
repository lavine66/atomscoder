import { Button } from "@/components/ui/button";
import { RotateCcw, Clock } from "lucide-react";
import { Version } from "@/pages/Workspace";

interface VersionHistoryProps {
  versions: Version[];
  onRestore: (version: Version) => void;
}

const VersionHistory = ({ versions, onRestore }: VersionHistoryProps) => {
  if (versions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-3">
        <Clock className="w-12 h-12 text-gray-600" />
        <p className="text-sm">No versions yet</p>
        <p className="text-xs text-gray-600">Versions are created automatically when AI generates code</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Version History</h3>
      <div className="space-y-2">
        {versions.map((version, idx) => (
          <div
            key={version.id || idx}
            className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between group hover:border-purple-500/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-purple-400">
                  v{version.version_number}
                </span>
                <span className="text-sm text-white truncate">
                  {version.message || "Code update"}
                </span>
              </div>
              {version.created_at && (
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(version.created_at).toLocaleString()}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRestore(version)}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-purple-400 transition-opacity"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Restore
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VersionHistory;