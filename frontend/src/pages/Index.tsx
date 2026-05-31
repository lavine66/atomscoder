import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen, Trash2, Sparkles, Code2, Eye, Rocket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: number;
  name: string;
  description: string;
  status: string;
  published_url: string;
  created_at: string;
  updated_at: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await client.auth.me();
      if (res?.data) {
        setUser(res.data);
        loadProjects();
      }
    } catch {
      // Not logged in
    } finally {
      setAuthLoading(false);
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await client.entities.projects.query({
        sort: "-updated_at",
        limit: 50,
      });
      setProjects(response.data?.items || []);
    } catch (e) {
      console.error("Failed to load projects", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    client.auth.toLogin();
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const response = await client.entities.projects.create({
        data: {
          name: newProjectName.trim(),
          description: "",
          status: "active",
          published_url: "",
        },
      });
      if (response.data) {
        navigate(`/workspace/${response.data.id}`);
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await client.entities.projects.delete({ id: String(id) });
      setProjects(projects.filter((p) => p.id !== id));
      toast({ title: "Project deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  // Landing page for non-authenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              AtomsCoder
            </span>
          </div>
          <Button
            onClick={handleLogin}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Sign In
          </Button>
        </header>

        <main className="flex flex-col items-center justify-center px-6 pt-32 pb-20">
          <div className="max-w-3xl text-center space-y-6">
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              Build apps with{" "}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                AI-powered
              </span>{" "}
              code generation
            </h1>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Describe what you want to build in natural language. Watch as AI generates
              complete, working web applications in real-time. Edit, iterate, and publish
              with one click.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Button
                onClick={handleLogin}
                size="lg"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Get Started Free
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 max-w-4xl w-full">
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold">AI Code Generation</h3>
              <p className="text-sm text-gray-400">
                Describe your app in plain English. AI generates complete HTML, CSS, and JavaScript.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Eye className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold">Live Preview</h3>
              <p className="text-sm text-gray-400">
                See your app come to life instantly with real-time preview in a sandboxed environment.
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
                <Rocket className="w-5 h-5 text-pink-400" />
              </div>
              <h3 className="text-lg font-semibold">One-Click Publish</h3>
              <p className="text-sm text-gray-400">
                Deploy your generated app to a public URL with a single click. Share with anyone.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Dashboard for authenticated users
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            AtomsCoder
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowNewProject(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
          <Button
            variant="ghost"
            onClick={() => client.auth.logout()}
            className="text-gray-400 hover:text-white"
          >
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h2 className="text-2xl font-bold mb-6">Your Projects</h2>

        {showNewProject && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-4 flex gap-3">
            <input
              type="text"
              placeholder="Project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              autoFocus
            />
            <Button onClick={handleCreateProject} className="bg-purple-600 hover:bg-purple-700 text-white">
              Create
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewProject(false);
                setNewProjectName("");
              }}
              className="text-gray-400"
            >
              Cancel
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <FolderOpen className="w-16 h-16 text-gray-600 mx-auto" />
            <p className="text-gray-400 text-lg">No projects yet</p>
            <Button
              onClick={() => setShowNewProject(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/workspace/${project.id}`)}
                className="bg-white/5 border border-white/10 rounded-xl p-5 cursor-pointer hover:border-purple-500/50 hover:bg-white/[0.07] transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{project.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {project.updated_at
                        ? new Date(project.updated_at).toLocaleDateString()
                        : "Just created"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                {project.published_url && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-green-400">
                    <Rocket className="w-3 h-3" />
                    Published
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;