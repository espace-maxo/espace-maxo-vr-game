/**
 * Caisse Pro - Login View Component
 */
import { Receipt, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LoginView = ({ 
  loginMode, 
  setLoginMode, 
  loginForm, 
  setLoginForm, 
  handleLogin 
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <Card className="bg-slate-800/80 border-amber-500/30 w-full max-w-md backdrop-blur-sm shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="w-24 h-24 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Receipt className="w-12 h-12 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-amber-500">CAISSE PRO</CardTitle>
          <p className="text-xl text-white font-semibold mt-1">Espace Maxo</p>
          <p className="text-slate-400 text-sm">Système de facturation</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* Toggle between PIN and Admin login */}
          <div className="flex gap-2 mb-4">
            <Button 
              variant={loginMode === "pin" ? "default" : "outline"}
              onClick={() => setLoginMode("pin")}
              className={loginMode === "pin" ? "flex-1 bg-amber-500 hover:bg-amber-600 text-white" : "flex-1 border-slate-600 text-slate-300"}
              data-testid="login-mode-pin"
            >
              <User className="w-4 h-4 mr-2" />
              Serveur (PIN)
            </Button>
            <Button 
              variant={loginMode === "admin" ? "default" : "outline"}
              onClick={() => setLoginMode("admin")}
              className={loginMode === "admin" ? "flex-1 bg-amber-500 hover:bg-amber-600 text-white" : "flex-1 border-slate-600 text-slate-300"}
              data-testid="login-mode-admin"
            >
              <Settings className="w-4 h-4 mr-2" />
              Admin
            </Button>
          </div>
          
          {loginMode === "pin" ? (
            <div className="space-y-2">
              <label className="text-slate-300 text-sm">Code PIN</label>
              <Input
                type="password"
                value={loginForm.pin}
                onChange={(e) => setLoginForm({ ...loginForm, pin: e.target.value })}
                placeholder="Entrez votre code PIN"
                className="bg-slate-700/50 border-slate-600 text-white text-center text-2xl tracking-widest h-14"
                maxLength={6}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                data-testid="login-pin-input"
              />
              <p className="text-slate-500 text-xs text-center">4 à 6 chiffres</p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-slate-300 text-sm">Mot de passe administrateur</label>
              <Input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                placeholder="Mot de passe"
                className="bg-slate-700/50 border-slate-600 text-white h-14"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                data-testid="login-password-input"
              />
            </div>
          )}
          
          <Button 
            onClick={handleLogin} 
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white h-14 text-lg font-semibold shadow-lg"
            data-testid="login-submit-btn"
          >
            Connexion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginView;
