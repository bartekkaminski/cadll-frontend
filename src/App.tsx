import { useState } from "react";

type AppStatus = "idle" | "generating" | "compiling" | "downloading" | "done" | "error";

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "Gotowy",
  generating: "Generowanie kodu...",
  compiling: "Kompilowanie...",
  downloading: "Pobieranie DLL...",
  done: "Gotowy",
  error: "Błąd",
};

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-cad-muted border-t-white rounded-full animate-spin" />
  );
}

export default function App() {
  const [functionName, setFunctionName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");

  const validate = (): string | null => {
    if (!functionName.trim()) return "Podaj nazwę funkcji.";
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(functionName.trim()))
      return "Nazwa funkcji musi zaczynać się literą i zawierać tylko znaki alfanumeryczne (bez spacji).";
    if (!prompt.trim()) return "Podaj opis funkcji.";
    return null;
  };

  const handleGenerate = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setAppStatus("generating");

    try {
      const base = import.meta.env.VITE_API_URL ?? "";
      const res = await fetch(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ functionName: functionName.trim(), prompt: prompt.trim() }),
      });

      setAppStatus("compiling");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.error ??
          (Array.isArray(data.errors) ? data.errors.join("\n") : null) ??
          `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(msg);
      }

      setAppStatus("downloading");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${functionName.trim()}.dll`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setSuccess(`${functionName.trim()}.dll`);
      setAppStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setAppStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cad-base font-sans">
      {/* ── Titlebar ── */}
      <header className="flex items-center gap-3 px-5 py-3 bg-cad-surface border-b border-cad-border select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-cad-accent" />
          <div className="w-3 h-3 bg-cad-accent-d opacity-60" />
          <div className="w-3 h-3 bg-cad-border" />
        </div>
        <span className="font-mono text-sm font-bold text-cad-text tracking-widest uppercase">CADLL</span>
        <span className="text-cad-muted text-xs font-mono">│</span>
        <span className="text-cad-label text-xs font-mono tracking-wider uppercase">CAD Function Generator</span>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          {/* Card */}
          <div className="bg-cad-panel border border-cad-border">
            {/* Card header */}
            <div className="px-5 py-3 border-b border-cad-border bg-cad-surface flex items-center gap-2">
              <span className="w-2 h-2 bg-cad-accent inline-block" />
              <span className="text-cad-label text-xs font-mono uppercase tracking-widest">
                Generator funkcji CAD
              </span>
            </div>

            {/* Card body */}
            <div className="p-6 flex flex-col gap-5">
              {/* Function name */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="functionName"
                  className="text-cad-label text-xs font-mono uppercase tracking-widest"
                >
                  Nazwa funkcji
                </label>
                <input
                  id="functionName"
                  type="text"
                  value={functionName}
                  onChange={(e) => {
                    setFunctionName(e.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="np. LiczKolory"
                  disabled={isLoading}
                  className="
                    w-full px-3 py-2
                    bg-cad-surface border border-cad-border
                    text-cad-text font-mono text-sm
                    placeholder:text-cad-muted
                    focus:outline-none focus:border-cad-accent
                    disabled:opacity-50
                    transition-colors duration-150
                  "
                  spellCheck={false}
                />
              </div>

              {/* Prompt */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="prompt" className="text-cad-label text-xs font-mono uppercase tracking-widest">
                  Opis
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setError(null);
                    setSuccess(null);
                  }}
                  placeholder="Opisz co ma robić funkcja CAD, np:&#10;Policz długości linii i polilinii według koloru i wypisz wyniki w oknie dialogowym..."
                  rows={6}
                  disabled={isLoading}
                  className="
                    w-full px-3 py-2
                    bg-cad-surface border border-cad-border
                    text-cad-text font-mono text-sm
                    placeholder:text-cad-muted
                    focus:outline-none focus:border-cad-accent
                    disabled:opacity-50
                    resize-y min-h-[120px]
                    transition-colors duration-150
                  "
                  spellCheck={false}
                />
              </div>

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="
                  w-full py-3.5 px-6
                  bg-cad-accent hover:bg-cad-accent-h active:bg-cad-accent-d
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-white font-mono font-bold text-sm uppercase tracking-widest
                  border border-cad-accent-h
                  flex items-center justify-center gap-3
                  transition-colors duration-150
                  cursor-pointer
                "
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    <span>{STATUS_LABELS[appStatus]}</span>
                  </>
                ) : (
                  <>
                    <span className="text-base leading-none">⚙</span>
                    <span>Wygeneruj funkcję</span>
                  </>
                )}
              </button>

              {/* Success message */}
              {success && (
                <div className="flex items-start gap-3 px-4 py-3 bg-cad-ok-bg border-l-2 border-cad-ok">
                  <span className="text-cad-ok text-sm mt-px">✔</span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-cad-ok text-sm font-mono font-bold">Kompilacja zakończona</span>
                    <span className="text-cad-ok text-xs font-mono opacity-80">
                      Plik <strong>{success}</strong> został pobrany
                    </span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex flex-col gap-2 px-4 py-3 bg-cad-err-bg border-l-2 border-cad-err">
                  <span className="text-cad-err text-xs font-mono font-bold uppercase tracking-wider">Błąd</span>
                  <pre className="text-cad-err text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
                    {error}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Info note */}
          <p className="mt-4 text-center text-cad-muted text-xs font-mono">
            Generuje wtyczkę CAD (.dll) z pomocą AI
          </p>
        </div>
      </main>

      {/* ── Status bar ── */}
      <footer className="flex items-center justify-between px-5 py-1.5 bg-cad-surface border-t border-cad-border select-none">
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-1.5 ${appStatus === "error" ? "text-cad-err" : appStatus === "done" ? "text-cad-ok" : isLoading ? "text-cad-accent" : "text-cad-muted"}`}
          >
            {isLoading && <Spinner />}
            <span className="text-xs font-mono">{STATUS_LABELS[appStatus]}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-cad-muted text-xs font-mono">
          <span>CAD Plugin Generator</span>
          <span className="text-cad-border">│</span>
          <span>v1.0</span>
        </div>
      </footer>
    </div>
  );
}
