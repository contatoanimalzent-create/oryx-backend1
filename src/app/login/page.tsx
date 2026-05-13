"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Crosshair, Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { apiFetch, isMockMode } from "@/lib/api";
import type { AuthTokens, AdminUser } from "@/types";

const MOCK_CREDS = { email: "admin@oryx.op", password: "admin123" };

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isMockMode()) {
        if (email === MOCK_CREDS.email && password === MOCK_CREDS.password) {
          setTokens("mock_access", "mock_refresh");
          setUser({ id: "u-1", email, name: "Admin ORYX", role: "admin" });
          router.push("/events");
        } else {
          setError("Credenciais inválidas.");
        }
        return;
      }
      const data = await apiFetch<{ tokens: AuthTokens; user: AdminUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      setUser(data.user);
      router.push("/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center justify-center w-14 h-14 bg-blue-600/20 border border-blue-600/40 rounded-2xl mb-4">
            <Crosshair size={28} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-widest text-white uppercase">ORYX</h1>
          <p className="text-neutral-500 text-sm mt-1">Painel de Comando e Controle</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="admin@oryx.op"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-3 text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">Senha</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-3 pr-11 text-white text-sm placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
          >
            {loading ? "Autenticando..." : "Entrar"}
          </button>
        </form>

        {isMockMode() && (
          <p className="text-center text-xs text-neutral-600 mt-6">
            Modo demo · {MOCK_CREDS.email} / {MOCK_CREDS.password}
          </p>
        )}
      </div>
    </div>
  );
}
