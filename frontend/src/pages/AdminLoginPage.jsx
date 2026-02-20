import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const ADMIN_PASSWORD = "Nikeland2016";

const AdminLoginPage = () => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      if (password === ADMIN_PASSWORD) {
        sessionStorage.setItem("adminAuth", "true");
        toast.success("Connexion réussie !");
        navigate("/admin/dashboard");
      } else {
        toast.error("Mot de passe incorrect");
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen pt-20 bg-dark-bg flex items-center justify-center" data-testid="admin-login-page">
      <div className="w-full max-w-md px-4">
        <div className="bg-dark-card border border-white/10 rounded-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-neon-blue/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-neon-blue" />
            </div>
            <h1 className="font-orbitron font-bold text-2xl text-white">
              Espace Admin
            </h1>
            <p className="text-gray-400 font-outfit mt-2">
              Entrez le mot de passe pour accéder au dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="bg-surface-highlight border-white/20 text-white pr-12 h-12 font-outfit"
                data-testid="admin-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading || !password}
              className="w-full bg-neon-blue text-black font-rajdhani font-bold text-lg h-12 hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]"
              data-testid="admin-login-button"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                  Connexion...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  Accéder au Dashboard
                </span>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
