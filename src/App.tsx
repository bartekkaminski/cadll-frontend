import { useState, useRef } from "react";

type AppStatus = "idle" | "generating" | "compiling" | "fixing" | "downloading" | "done" | "error";

const STATUS_LABELS: Record<AppStatus, string> = {
  idle: "Gotowy",
  generating: "Generowanie kodu...",
  compiling: "Kompilowanie...",
  fixing: "Poprawianie błędów...",
  downloading: "Pobieranie ZIP...",
  done: "Gotowy",
  error: "Błąd",
};

const PHASE_STATUS: Record<string, AppStatus> = {
  generating: "generating",
  compiling: "compiling",
  fixing: "fixing",
  done: "done",
  error: "error",
};

type CadPlatform = "zwcad" | "autocad" | "bricscad" | "gstarcad";
type OutputFormat = "dll" | "auto" | "lisp";

const PLATFORMS: { id: CadPlatform; label: string; soon?: boolean }[] = [
  { id: "zwcad", label: "ZWCAD" },
  { id: "autocad", label: "AutoCAD", soon: true },
  { id: "bricscad", label: "BricsCAD", soon: true },
  { id: "gstarcad", label: "GStarCAD", soon: true },
];

const OUTPUT_FORMATS: { id: OutputFormat; label: string; soon?: boolean }[] = [
  { id: "auto", label: "Automatycznie", soon: true },
  { id: "dll", label: "DLL" },
  { id: "lisp", label: "LISP", soon: true },
];

const EXAMPLES: { label: string; name: string; prompt: string }[] = [
  {
    label: "Eksport do Excela",
    name: "CADLL_EXCELKOLORY",
    prompt:
      "Policz sumaryczne długości wszystkich linii i polilinii na rysunku, pogrupuj wyniki według koloru obiektu. Zapisz tabelę wyników do pliku Excel na pulpicie użytkownika (jedna kolumna: kolor, druga: suma długości w metrach, dwie cyfry po przecinku). Na końcu wyświetl komunikat ile obiektów zostało przetworzonych.",
  },
  {
    label: "Zlicz wstawienia bloków",
    name: "CADLL_LICZNABLOKI",
    prompt:
      "Przejdź przez wszystkie obiekty na rysunku i znajdź wstawienia bloków (Insert). Pogrupuj je według nazwy bloku i policz ile razy każdy blok został wstawiony. Wyświetl wyniki w oknie komunikatu - każda linia: nazwa bloku i liczba wstawień, posortowane malejąco po liczbie.",
  },
  {
    label: "Zaznacz obiekty warstwy",
    name: "CADLL_ZAZNACZWARSTWE",
    prompt:
      "Zapytaj użytkownika o nazwę warstwy (PromptStringOptions). Następnie przejdź przez wszystkie obiekty w przestrzeni modelu i dodaj do zestawu selekcji te, które należą do podanej warstwy. Na końcu ustaw ten zestaw jako aktywną selekcję w edytorze i wyświetl komunikat ile obiektów zostało zaznaczonych.",
  },
];

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-cad-muted border-t-cad-accent rounded-full animate-spin" />
  );
}

export default function App() {
  const [functionName, setFunctionName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [platform, setPlatform] = useState<CadPlatform>("zwcad");
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("dll");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const validate = (): string | null => {
    if (!functionName.trim()) return "Podaj nazwę funkcji.";
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(functionName.trim()))
      return "Nazwa funkcji musi zaczynać się literą i zawierać tylko znaki alfanumeryczne (bez spacji).";
    if (!prompt.trim()) return "Podaj opis funkcji.";
    return null;
  };

  const downloadFile = async (base: string, jobId: string, name: string) => {
    setAppStatus("downloading");
    const dlRes = await fetch(`${base}/api/download/${jobId}`);
    if (!dlRes.ok) throw new Error(`Błąd pobierania pliku (HTTP ${dlRes.status}).`);
    const blob = await dlRes.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setSuccess(`${name}.zip`);
    setAppStatus("done");
    setIsLoading(false);
  };

  const handleGenerate = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    stopPolling();
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ??
            (Array.isArray(data.errors) ? data.errors.join("\n") : null) ??
            `HTTP ${res.status}: ${res.statusText}`,
        );
      }

      const { jobId } = await res.json();
      const name = functionName.trim();

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${base}/api/status/${jobId}`);
          if (!statusRes.ok) {
            stopPolling();
            throw new Error(`Błąd statusu (HTTP ${statusRes.status}).`);
          }

          const data = await statusRes.json();
          const mapped = PHASE_STATUS[data.phase as string] ?? "generating";
          if (mapped !== "done" && mapped !== "error") setAppStatus(mapped);

          if (data.status === "done") {
            stopPolling();
            await downloadFile(base, jobId, name);
          } else if (data.status === "error") {
            stopPolling();
            const msg =
              data.error ?? (Array.isArray(data.errors) ? data.errors.join("\n") : null) ?? "Nieznany błąd.";
            throw new Error(msg);
          }
        } catch (e: unknown) {
          stopPolling();
          setError(e instanceof Error ? e.message : String(e));
          setAppStatus("error");
          setIsLoading(false);
        }
      }, 5000);
    } catch (e: unknown) {
      stopPolling();
      setError(e instanceof Error ? e.message : String(e));
      setAppStatus("error");
      setIsLoading(false);
    }
  };

  const busy = isLoading;

  return (
    <div className="min-h-screen flex flex-col font-sans relative overflow-x-hidden">
      {/* Siatka CAD — fixed, nie rusza się przy scrollowaniu */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
            linear-gradient(rgba(45,143,196,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(45,143,196,0.07) 1px, transparent 1px),
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
            backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
            backgroundPosition: "center center",
          }}
        />
      </div>
      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 1 }}>
        {/* ── Hero ── */}
        <section className="pt-4 md:pt-12 pb-5 md:pb-8 px-3 flex flex-col items-center text-center select-none">
          <div
            className="flex items-center gap-3 mb-5 md:mb-10"
            style={{ fontSize: "clamp(1.5rem, 5vw, 2.5rem)" }}
          >
            <div className="bg-cad-accent" style={{ width: "0.35em", height: "1cap" }} />
            <span
              className="font-mono font-bold tracking-widest uppercase"
              style={{ fontSize: "1em", lineHeight: 1 }}
            >
              <span className="text-cad-accent">CAD</span>
              <span className="text-cad-text">LL</span>
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-mono font-bold tracking-wider uppercase mb-3">
            <span className="text-cad-text">Generator wtyczek </span>
            <span className="text-cad-accent">CAD</span>
          </h1>
          <h2 className="text-cad-label font-mono text-base md:text-lg max-w-lg leading-relaxed font-normal">
            Opisz funkcję, wybierz platformę i{" "}
            <span className="font-bold">
              <span className="text-cad-accent">CAD</span>
              <span className="text-cad-text">LL</span>
            </span>{" "}
            z pomocą <span className="text-cad-text font-bold">AI</span> wygeneruje gotową wtyczkę{" "}
            <span className="bg-cad-text text-cad-base font-bold px-1">.dll</span> lub{" "}
            <span className="bg-cad-text text-cad-base font-bold px-1">.lsp</span>.
          </h2>
        </section>

        {/* ── Selectors ── */}
        <section className="flex flex-col items-center gap-4 px-3 mb-10 select-none">
          {/* Platform */}
          <div className="flex flex-wrap gap-1 p-1 border border-cad-border bg-cad-surface w-full max-w-2xl">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                disabled={p.soon || busy}
                onClick={() => !p.soon && setPlatform(p.id)}
                className={[
                  "flex-1 basis-28 py-2 px-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150 text-center",
                  p.soon
                    ? "text-cad-label cursor-not-allowed opacity-60"
                    : platform === p.id
                      ? "bg-cad-accent text-white"
                      : "text-cad-label hover:text-cad-text hover:bg-cad-panel cursor-pointer",
                ].join(" ")}
              >
                <span>{p.label}</span>
                {p.soon && (
                  <span className="block text-[9px] font-mono text-cad-muted normal-case tracking-normal leading-tight">
                    wkrótce
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Output format */}
          <div className="flex flex-wrap gap-1 p-1 border border-cad-border bg-cad-surface w-full max-w-2xl">
            {OUTPUT_FORMATS.map((f) => (
              <button
                key={f.id}
                disabled={f.soon || busy}
                onClick={() => !f.soon && setOutputFormat(f.id)}
                className={[
                  "flex-1 basis-28 py-2 px-2 font-mono text-xs uppercase tracking-widest transition-colors duration-150 text-center",
                  f.soon
                    ? "text-cad-label cursor-not-allowed opacity-60"
                    : outputFormat === f.id
                      ? "bg-cad-accent text-white"
                      : "text-cad-label hover:text-cad-text hover:bg-cad-panel cursor-pointer",
                ].join(" ")}
              >
                <span>{f.label}</span>
                {f.soon && (
                  <span className="block text-[9px] font-mono text-cad-muted normal-case tracking-normal leading-tight">
                    wkrótce
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* ── Form ── */}
        <main className="flex-1 flex justify-center px-3 pb-4">
          <div className="w-full max-w-2xl flex flex-col gap-8">
            {/* Function name */}
            <div className="flex flex-col border border-cad-border bg-cad-surface focus-within:border-cad-accent transition-colors duration-200">
              <label
                htmlFor="functionName"
                className="px-4 pt-3 text-cad-muted font-mono text-xs uppercase tracking-widest"
              >
                Nazwa komendy
              </label>
              <input
                id="functionName"
                type="text"
                value={functionName}
                onChange={(e) => {
                  const val = e.target.value
                    .replace(/[^A-Za-z0-9_]/g, "")
                    .toUpperCase()
                    .slice(0, 30);
                  setFunctionName(val);
                  setError(null);
                  setSuccess(null);
                }}
                placeholder="np. LiczKolory"
                disabled={busy}
                spellCheck={false}
                className="
                w-full px-4 py-3
                bg-transparent
                text-cad-text font-mono text-base
                placeholder:text-cad-muted
                focus:outline-none
                disabled:opacity-40
              "
              />
              {functionName.length >= 30 && (
                <div className="flex justify-end px-4 pb-2">
                  <span className="font-mono text-xs text-cad-err">Maksymalna długość: 30 znaków</span>
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="flex flex-col border border-cad-border bg-cad-surface focus-within:border-cad-accent transition-colors duration-200">
              <label
                htmlFor="prompt"
                className="px-4 pt-3 text-cad-muted font-mono text-xs uppercase tracking-widest"
              >
                Opis
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value.slice(0, 2000));
                  setError(null);
                  setSuccess(null);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                placeholder={
                  "Opisz co ma robić funkcja CAD, np:\nPolicz długości linii i polilinii według koloru i wypisz wyniki..."
                }
                rows={5}
                maxLength={2000}
                disabled={busy}
                spellCheck={false}
                style={{ overflow: "hidden" }}
                className="
                w-full px-4 py-3
                bg-transparent
                text-cad-text font-mono text-sm leading-relaxed
                placeholder:text-cad-muted
                focus:outline-none
                disabled:opacity-40
                resize-none min-h-[120px]
              "
              />
              <div className="flex justify-end px-4 pb-2">
                <span className={`font-mono text-xs ${prompt.length >= 1900 ? "text-cad-err" : "text-cad-muted"}`}>
                  {prompt.length} / 2000
                </span>
              </div>
            </div>

            {/* Generate button */}
            <div className="flex items-center gap-6 pt-2">
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="
                w-full py-3.5
                bg-cad-accent hover:bg-cad-accent-h active:bg-cad-accent-d
                disabled:opacity-40 disabled:cursor-not-allowed
                text-white font-mono font-bold text-sm uppercase tracking-widest
                flex items-center justify-center gap-3
                transition-colors duration-150
                cursor-pointer
              "
              >
                {busy ? (
                  <>
                    <Spinner />
                    <span>{STATUS_LABELS[appStatus]}</span>
                  </>
                ) : (
                  <>
                    <span className="text-base leading-none">⚙</span>
                    <span>Wygeneruj wtyczkę</span>
                  </>
                )}
              </button>
            </div>

            {success && !busy && (
              <div className="flex items-center gap-2 text-cad-ok font-mono text-sm">
                <span>✔</span>
                <span>
                  <strong>{success}</strong> pobrany
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="border-l-2 border-cad-err pl-4 py-1">
                <p className="text-cad-err font-mono text-xs uppercase tracking-wider mb-1">Błąd</p>
                <pre className="text-cad-err font-mono text-xs whitespace-pre-wrap break-all leading-relaxed opacity-90">
                  {error}
                </pre>
              </div>
            )}

            {/* Examples */}
            <div className="flex flex-col gap-3 pt-4 border-t border-cad-border">
              <p className="text-cad-muted font-mono text-xs uppercase tracking-widest">Przykłady</p>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.name}
                    disabled={busy}
                    onClick={() => {
                      setFunctionName(ex.name);
                      setPrompt(ex.prompt);
                      setError(null);
                      setSuccess(null);
                    }}
                    className="
                    w-full text-left px-4 py-3
                    border border-cad-border bg-cad-surface
                    hover:border-cad-accent hover:bg-cad-panel
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors duration-150 cursor-pointer
                    flex flex-col gap-2
                  "
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-cad-text font-mono text-sm font-bold">{ex.label}</span>
                      <span className="text-cad-accent font-mono text-xs shrink-0">{ex.name}</span>
                    </div>
                    <p className="text-cad-label font-mono text-xs leading-relaxed line-clamp-2">{ex.prompt}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Contact / support */}
            <div className="flex flex-col items-center text-center gap-5 pt-8 pb-4 border-t border-cad-border">
              <p className="text-cad-text font-mono text-base md:text-lg font-bold tracking-wide">
                Masz pytania lub potrzebujesz czegoś bardziej zaawansowanego?
              </p>
              <p className="text-cad-label font-mono text-sm max-w-lg leading-relaxed">
                Zapraszamy do kontaktu - pomożemy wdrożyć dedykowane rozwiązania CAD dopasowane do Twoich potrzeb.
              </p>
              <a
                href="mailto:kontakt@cadll.pl"
                className="
                px-8 py-3 border border-cad-accent text-cad-accent font-mono font-bold text-sm uppercase tracking-widest
                hover:bg-cad-accent hover:text-white transition-colors duration-150
              "
              >
                kontakt@cadll.pl
              </a>
              <a
                href="https://imposoft.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cad-muted font-mono text-xs hover:text-cad-label transition-colors duration-150"
              >
                Wspierane przez <span className="font-bold text-cad-label">IMPOSOFT</span>
              </a>

              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  "Biuro projektowe",
                  "Biuro konstrukcyjne",
                  "Pracownia architektoniczna",
                  "Geodezja i kartografia",
                  "Przemysł i produkcja",
                "Instalacje i MEP",
                "Infrastruktura drogowa",
                "Inżynier budowy",
                "Kierownik budowy",
                ].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 border border-cad-border text-cad-muted font-mono text-xs tracking-wide hover:bg-cad-text hover:text-cad-base hover:border-cad-text transition-colors duration-150 cursor-default"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* ── Version watermark ── */}
        <div className="py-4 text-center pointer-events-none select-none">
          <span className="text-cad-muted font-mono text-xs opacity-20">v1.12</span>
        </div>
      </div>
      {/* end inner wrapper */}
    </div>
  );
}
