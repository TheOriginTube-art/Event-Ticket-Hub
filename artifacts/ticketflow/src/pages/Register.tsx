import { useState } from "react";
import { Link, useLocation } from "wouter";
import { UserPlus, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";

export default function Register() {
  const [, setLocation] = useLocation();
  const { register, registerError, isAuthenticating } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ name, email, password });
      setLocation("/account");
    } catch {
      // error surfaced via registerError
    }
  };

  return (
    <div className="container mx-auto px-4 py-16 flex flex-col items-center min-h-[70vh]">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="bg-primary p-2 rounded-lg shadow-[0_0_15px_rgba(255,69,0,0.4)]">
            <UserPlus className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Регистрация</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-white/5 rounded-xl p-6">
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground ml-1">Имя</label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя Фамилия"
              className="bg-background/50"
            />
          </div>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="bg-background/50"
            />
          </div>

          {registerError && (
            <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {registerError}
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={isAuthenticating}>
            {isAuthenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Создать аккаунт
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
