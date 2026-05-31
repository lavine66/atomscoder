import { useMemo } from "react";
import { ProjectFile } from "@/pages/Workspace";
import { Monitor } from "lucide-react";

interface PreviewPanelProps {
  files: ProjectFile[];
}

const PreviewPanel = ({ files }: PreviewPanelProps) => {
  const previewHtml = useMemo(() => {
    if (files.length === 0) return "";

    const htmlFile = files.find((f) => f.filename === "index.html");
    const cssFiles = files.filter((f) => f.type === "css");
    const jsFiles = files.filter((f) => f.type === "js");

    if (!htmlFile) {
      // If no HTML file, create a basic wrapper
      const css = cssFiles.map((f) => f.content).join("\n");
      const js = jsFiles.map((f) => f.content).join("\n");
      return `<!DOCTYPE html><html><head><style>${css}</style></head><body><script>${js}</script></body></html>`;
    }

    let html = htmlFile.content;

    // Inject CSS files that aren't already linked
    for (const cssFile of cssFiles) {
      if (!html.includes(cssFile.filename)) {
        const styleTag = `<style>/* ${cssFile.filename} */\n${cssFile.content}</style>`;
        html = html.replace("</head>", `${styleTag}\n</head>`);
      }
    }

    // Inject JS files that aren't already linked
    for (const jsFile of jsFiles) {
      if (!html.includes(jsFile.filename)) {
        const scriptTag = `<script>/* ${jsFile.filename} */\n${jsFile.content}</script>`;
        html = html.replace("</body>", `${scriptTag}\n</body>`);
      }
    }

    return html;
  }, [files]);

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-3">
        <Monitor className="w-12 h-12 text-gray-600" />
        <p className="text-sm">Preview will appear here</p>
        <p className="text-xs text-gray-600">Start a conversation to generate code</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-10 border-b border-white/10 px-4 flex items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/60"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500/60"></div>
          <div className="w-3 h-3 rounded-full bg-green-500/60"></div>
        </div>
        <span className="ml-4 text-xs text-gray-500">Live Preview</span>
      </div>
      <div className="flex-1 bg-white">
        <iframe
          srcDoc={previewHtml}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
          title="Preview"
        />
      </div>
    </div>
  );
};

export default PreviewPanel;