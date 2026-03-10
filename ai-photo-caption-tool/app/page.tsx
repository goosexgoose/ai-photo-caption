"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Tone = "Poetic" | "Documentary" | "Minimal" | "Instagram" | "Xiaohongshu";
type Length = "Short" | "Medium" | "Long";
type Lang = "English" | "Chinese";

type HistoryItem = {
  id: string;
  createdAt: number;
  tone: Tone | string;
  length: Length | string;
  lang: Lang | string;
  activeVariant: 0 | 1 | 2;
  variants: string[];
  altText: string;
  hashtags: string[];
  thumbnailDataUrl?: string;
};

const HISTORY_KEY = "caption_history_v1";

function normalizeHistoryItem(raw: unknown): HistoryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;

  const variantsRaw = Array.isArray(value.variants)
    ? value.variants.map((v: unknown) => String(v ?? ""))
    : [];
  const variants: string[] = [variantsRaw[0] ?? "", variantsRaw[1] ?? "", variantsRaw[2] ?? ""];

  const activeVariantRaw = (value.activeVariant as number | undefined) ?? 0;
  const activeVariant: 0 | 1 | 2 =
    activeVariantRaw === 1 || activeVariantRaw === 2 ? activeVariantRaw : 0;

  const hashtags: string[] = Array.isArray(value.hashtags)
    ? value.hashtags.map((h: unknown) => String(h ?? ""))
    : [];

  const createdAtValue = value.createdAt as number | undefined;
  const createdAt =
    typeof createdAtValue === "number" && Number.isFinite(createdAtValue)
      ? createdAtValue
      : Date.now();

  const idValue = value.id as string | undefined;
  const id =
    typeof idValue === "string" && idValue.length
      ? idValue
      : `${createdAt}-${Math.random().toString(16).slice(2)}`;

  const toneValue = value.tone as string | undefined;
  const lengthValue = value.length as string | undefined;
  const langValue = value.lang as string | undefined;

  const tone: Tone | string = toneValue ?? "Documentary";
  const length: Length | string = lengthValue ?? "Medium";
  const lang: Lang | string = langValue ?? "English";

  const thumbnailDataUrlValue = value.thumbnailDataUrl as string | undefined;
  const thumbnailDataUrl =
    typeof thumbnailDataUrlValue === "string" && thumbnailDataUrlValue.length
      ? thumbnailDataUrlValue
      : undefined;

  const altTextValue = value.altText as string | undefined;

  return {
    id,
    createdAt,
    tone,
    length,
    lang,
    activeVariant,
    variants,
    altText: typeof altTextValue === "string" ? altTextValue : "",
    hashtags,
    thumbnailDataUrl,
  };
}

function readHistoryFromStorage(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .map((item: unknown) => normalizeHistoryItem(item))
      .filter((item): item is HistoryItem => Boolean(item));
    return items.slice(0, 10);
  } catch {
    return [];
  }
}

function writeHistoryToStorage(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null);

  const [tone, setTone] = useState<Tone>("Documentary");
  const [length, setLength] = useState<Length>("Medium");
  const [lang, setLang] = useState<Lang>("English");

  const [loading, setLoading] = useState(false);

  const [variants, setVariants] = useState<string[]>(["", "", ""]);
  const [activeVariant, setActiveVariant] = useState<0 | 1 | 2>(0);

  const [altText, setAltText] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [aboutOpen, setAboutOpen] = useState(false);

  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);

  const [loadingStep, setLoadingStep] = useState(0);

  const canGenerate = useMemo(() => !!file && !loading, [file, loading]);

  useEffect(() => {
    setHistory(readHistoryFromStorage());
  }, []);

  useEffect(() => {
    // Detect install status and platform for PWA guidance
    if (typeof window === "undefined") return;

    const nav = window.navigator as unknown as { standalone?: boolean };
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      Boolean(nav?.standalone);

    const ua = window.navigator.userAgent || "";
    const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua);
    setIsIos(ios);

    if (!mobile || isStandalone) {
      setShowInstallBanner(false);
      return;
    }

    try {
      const dismissed = window.localStorage.getItem("pwa_install_dismissed") === "1";
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    } catch {
      setShowInstallBanner(true);
    }
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }

    const id = window.setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % 3);
    }, 1200);

    return () => {
      window.clearInterval(id);
    };
  }, [loading]);

  function showToast(message: string, duration = 900) {
    setToast(message);
    window.setTimeout(() => setToast(null), duration);
  }

  function pickFile() {
    inputRef.current?.click();
  }

  function resetOutputs() {
    setVariants(["", "", ""]);
    setActiveVariant(0);
    setAltText("");
    setHashtags([]);
  }

  function onFileChange(f: File | null) {
    setError(null);
    resetOutputs();

    setFile(f);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setPreviewUrl(null);
      setThumbnailDataUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(f);
    setPreviewUrl(objectUrl);

    createThumbnail(f)
      .then((thumb) => {
        setThumbnailDataUrl(thumb);
      })
      .catch(() => {
        setThumbnailDataUrl(null);
      });
  }

  async function onGenerate() {
    if (!file) return;
    setLoading(true);
    setError(null);
    resetOutputs();

    try {
      const form = new FormData();
      form.append("image", file);
      form.append("tone", tone);
      form.append("length", length);
      form.append("lang", lang);

      const res = await fetch("/api/caption", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate.");
      }

      const data: {
        variants?: string[];
        altText?: string;
        hashtags?: string[];
      } = await res.json();

      const incomingVariants: string[] = Array.isArray(data.variants)
        ? data.variants
        : ["", "", ""];
      const normalizedVariants: string[] = [
        incomingVariants[0] ?? "",
        incomingVariants[1] ?? "",
        incomingVariants[2] ?? "",
      ];
      const incomingAlt: string = data.altText ?? "";
      const incomingHashtags: string[] = Array.isArray(data.hashtags)
        ? data.hashtags
        : [];

      setVariants(normalizedVariants);
      setAltText(incomingAlt);
      setHashtags(incomingHashtags);

      // Save to history (keep latest 10)
      setHistory((prev: HistoryItem[]) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const item: HistoryItem = {
          id,
          createdAt: Date.now(),
          tone,
          length,
          lang,
          activeVariant,
          variants: normalizedVariants,
          altText: incomingAlt,
          hashtags: incomingHashtags,
          ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}),
        };

        const next = [item, ...prev].slice(0, 10);
        writeHistoryToStorage(next);
        return next;
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied");
    } catch {
      showToast("Copy failed");
    }
  }

  async function shareText(text: string) {
    if (!text) return;

    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "AI Photo Caption",
          text,
        });
        return;
      } catch (err: unknown) {
        const anyErr = err as { name?: string };
        if (anyErr?.name === "AbortError") return;
        // otherwise fall through to clipboard fallback
      }
    }

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        showToast("Copied for sharing");
      }
    } catch {
      showToast("Share not supported");
    }
  }

  const caption = variants[activeVariant] || "";
  const hashtagsText =
    hashtags.length > 0 ? hashtags.map((t) => `#${t}`).join(" ") : "";
  const combinedText =
    caption && hashtagsText
      ? `${caption}\n\n${hashtagsText}`
      : caption || hashtagsText;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto w-full max-w-md px-4 pb-44 pt-6">
        <header className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                AI Photo Caption
              </h1>
              <p className="mt-1 text-sm text-neutral-400">
                Caption (A/B/C) + alt-text + hashtags. Mobile-first.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs font-medium text-neutral-100"
              >
                History
              </button>
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[11px] font-medium text-neutral-200"
              >
                About
              </button>
            </div>
          </div>
        </header>

        {/* Install PWA banner */}
        {showInstallBanner && (
          <section className="mb-3 rounded-2xl border border-neutral-800 bg-neutral-900/70 px-3 py-2.5 text-xs text-neutral-200">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-50">
                  Install this app
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {isIos
                    ? "In Safari, tap Share → Add to Home Screen."
                    : "Use your browser menu → Install app."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss install hint"
                onClick={() => {
                  setShowInstallBanner(false);
                  if (typeof window !== "undefined") {
                    try {
                      window.localStorage.setItem("pwa_install_dismissed", "1");
                    } catch {
                      // ignore
                    }
                  }
                }}
                className="ml-2 rounded-full border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300"
              >
                Close
              </button>
            </div>
          </section>
        )}

        {/* Preview */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-neutral-900">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
                No photo selected
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={pickFile}
              className="flex-1 rounded-xl bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-950 active:scale-[0.99]"
            >
              Choose Photo
            </button>
            <button
              type="button"
              onClick={pickFile}
              className="flex-1 rounded-xl border border-neutral-700 px-3 py-2 text-sm font-medium text-neutral-100 active:scale-[0.99]"
            >
              Take Photo
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />

          <p className="mt-2 text-xs text-neutral-500">
            Tip: for best results, pick a clear subject. The server compresses
            images automatically.
          </p>
        </section>

        {/* Results */}
        <section className="mt-4 space-y-3">
          {error && (
            <div className="rounded-2xl border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {/* AI thinking panel */}
          {loading && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="relative h-5 w-5">
                  <span className="absolute inset-0 rounded-full border border-neutral-700" />
                  <span className="absolute inset-0 animate-ping rounded-full border border-sky-500/60" />
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
                  AI is thinking
                </p>
              </div>
              <p className="text-sm text-neutral-200">
                {loadingStep === 0 && "Analyzing photo…"}
                {loadingStep === 1 && "Writing caption variants…"}
                {loadingStep === 2 && "Generating alt text and hashtags…"}
              </p>
            </div>
          )}

          {/* Variant tabs */}
          <div className="flex gap-2">
            {(["A", "B", "C"] as const).map((label, idx) => {
              const i = idx as 0 | 1 | 2;
              const isActive = activeVariant === i;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveVariant(i)}
                  className={[
                    "flex-1 rounded-xl border px-3 py-2 text-sm font-medium",
                    isActive
                      ? "border-neutral-50 bg-neutral-50 text-neutral-950"
                      : "border-neutral-800 bg-neutral-900/30 text-neutral-200",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <ResultCard
            title="Caption"
            value={caption}
            loading={loading}
            onCopy={() => copyText(caption)}
          />

          {/* Share actions for caption */}
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!caption || loading}
              onClick={() => shareText(caption)}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-100 disabled:opacity-40"
            >
              Share caption
            </button>
            <button
              type="button"
              disabled={!combinedText || loading}
              onClick={() => shareText(combinedText)}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-100 disabled:opacity-40"
            >
              Share caption + hashtags
            </button>
          </div>

          <ResultCard
            title="Alt text"
            value={altText}
            loading={loading}
            onCopy={() => copyText(altText)}
          />

          <ResultCard
            title="Hashtags"
            value={hashtagsText}
            loading={loading}
            onCopy={() => copyText(hashtagsText)}
          />

          <ResultCard
            title="Caption + Hashtags"
            value={combinedText}
            loading={loading}
            onCopy={() => copyText(combinedText)}
          />
        </section>

        {/* Footer (scrollable, above bottom bar) */}
        <footer className="mt-8 border-t border-neutral-900 bg-neutral-950/95 px-0 pb-4 pt-4 text-[11px] text-neutral-400">
          <div className="space-y-1">
            <p className="text-neutral-200">AI Photo Caption</p>
            <p>Built by Kaiya Li</p>
            <div className="flex flex-wrap gap-3 text-neutral-400">
              <a
                href="mailto:lilysome2u@gmail.com"
                className="underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                Contact
              </a>
              <a
                href="https://github.com/goosexgoose/ai-photo-caption"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                GitHub
              </a>
              <a
                href="https://github.com/goosexgoose/ai-photo-caption/issues"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-neutral-200 hover:underline"
              >
                Report issue
              </a>
            </div>
            <p className="text-neutral-500">
              © {new Date().getFullYear()} Kaiya Li. All rights reserved.
            </p>
            <p className="text-neutral-500">Version v1.0.0</p>
          </div>
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-3 left-0 right-0 z-50 mx-auto w-full max-w-md px-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 text-sm text-neutral-100 backdrop-blur">
            {toast}
          </div>
        </div>
      )}

      {/* History bottom sheet */}
      {historyOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60">
          <div className="w-full max-w-md rounded-t-3xl border-t border-neutral-800 bg-neutral-950 px-4 pb-4 pt-3 shadow-lg shadow-black/60">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-50">History</h2>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistory([]);
                      writeHistoryToStorage([]);
                    }}
                    className="rounded-lg border border-red-900/60 px-2 py-1 text-[11px] text-red-200"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="rounded-lg border border-neutral-800 px-2 py-1 text-[11px] text-neutral-200"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pb-1">
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-neutral-500">
                  No history yet. Generate a caption to start.
                </p>
              ) : (
                history.map((item: HistoryItem) => {
                  const snippet =
                    item.variants?.[item.activeVariant] ?? item.variants?.[0] ?? "";
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const normalizedVariants: string[] = [
                          item.variants?.[0] ?? "",
                          item.variants?.[1] ?? "",
                          item.variants?.[2] ?? "",
                        ];

                        setVariants(normalizedVariants);

                        const nextActive: 0 | 1 | 2 =
                          item.activeVariant === 1 || item.activeVariant === 2
                            ? item.activeVariant
                            : 0;
                        setActiveVariant(nextActive);

                        setAltText(item.altText ?? "");
                        setHashtags(
                          Array.isArray(item.hashtags)
                            ? item.hashtags
                            : [],
                        );

                        const allowedTones: Tone[] = [
                          "Poetic",
                          "Documentary",
                          "Minimal",
                          "Instagram",
                          "Xiaohongshu",
                        ];
                        if (allowedTones.includes(item.tone as Tone)) {
                          setTone(item.tone as Tone);
                        }

                        const allowedLengths: Length[] = [
                          "Short",
                          "Medium",
                          "Long",
                        ];
                        if (allowedLengths.includes(item.length as Length)) {
                          setLength(item.length as Length);
                        }

                        const allowedLangs: Lang[] = ["English", "Chinese"];
                        if (allowedLangs.includes(item.lang as Lang)) {
                          setLang(item.lang as Lang);
                        }

                        setHistoryOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 px-3 py-2.5 text-left"
                    >
                      {item.thumbnailDataUrl && (
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.thumbnailDataUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-neutral-400">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-neutral-500">
                            {item.tone} · {item.length} · {item.lang}
                          </span>
                        </div>
                        <p className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-neutral-100">
                          {snippet || "—"}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* About modal */}
      {aboutOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-950 px-4 pb-4 pt-3 shadow-xl shadow-black/60">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-50">About AI Photo Caption</h2>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                className="rounded-lg border border-neutral-800 px-2 py-1 text-[11px] text-neutral-200"
              >
                Close
              </button>
            </div>
            <div className="space-y-2 text-xs text-neutral-200">
              <p>
                This tool turns your photos into ready-to-post captions, accessible alt text, and
                hashtags that match your chosen style.
              </p>
              <p className="text-neutral-300">
                <span className="font-semibold text-neutral-50">Main features:</span>{" "}
                A/B/C caption variants, alt text, hashtag generation, mobile-first PWA, history, and
                one-tap sharing.
              </p>
              <p className="text-neutral-300">
                <span className="font-semibold text-neutral-50">Technologies:</span>{" "}
                Next.js App Router, OpenAI vision models, Tailwind CSS, and PWA manifest support.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-800 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 py-3">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            className="w-[42%] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option>Poetic</option>
            <option>Documentary</option>
            <option>Minimal</option>
            <option>Instagram</option>
            <option>Xiaohongshu</option>
          </select>

          <select
            value={length}
            onChange={(e) => setLength(e.target.value as Length)}
            className="w-[28%] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option>Short</option>
            <option>Medium</option>
            <option>Long</option>
          </select>

          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="w-[30%] rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option>English</option>
            <option>Chinese</option>
          </select>
        </div>

        <div className="mx-auto w-full max-w-md px-4 pb-4">
          <button
            type="button"
            disabled={!canGenerate}
            onClick={onGenerate}
            className="w-full rounded-2xl bg-neutral-50 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-40 active:scale-[0.99]"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          <p className="mt-2 text-[11px] text-neutral-500">
            AI captions may occasionally be inaccurate. Please review before publishing.
          </p>
        </div>
    </main>
  );
}

function ResultCard({
  title,
  value,
  loading,
  onCopy,
}: {
  title: string;
  value: string;
  loading: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
        <button
          type="button"
          onClick={onCopy}
          disabled={!value || loading}
          className="rounded-lg border border-neutral-800 px-2 py-1 text-xs text-neutral-200 disabled:opacity-40"
        >
          Copy
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-neutral-800" />
          <div className="h-3 w-2/3 rounded bg-neutral-800" />
          <div className="h-3 w-1/2 rounded bg-neutral-800" />
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">
          {value || "—"}
        </p>
      )}
    </div>
  );
}

async function createThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 256;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = (e.target?.result as string) || "";
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

