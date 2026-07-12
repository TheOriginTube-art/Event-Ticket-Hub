import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LogIn, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useSeo } from "@/lib/seo";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, loginError, isAuthenticating } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useSeo({ title: "Вход", description: "Войдите в свой аккаунт TicketFlow.", noindex: true });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      setLocation("/account");
    } catch {
      // error surfaced via loginError
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center min-h-[70vh]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="bg-primary p-2 rounded-lg shadow-[0_0_15px_rgba(255,69,0,0.4)]">
            <LogIn className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Вход в аккаунт</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-white/5 rounded-xl p-6">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground ml-1">Email</label>
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-background/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground ml-1">Пароль</label>
            <Input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-background/50"
            />
          </div>

          {loginError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {loginError}
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={isAuthenticating}>
            {isAuthenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            Войти
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
