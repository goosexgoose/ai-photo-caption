import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ---------------------------
 *  Simple in-memory rate limit
 * --------------------------*/
const RATE_WINDOW_MS = 60_000; // 1 min
const RATE_MAX = 10; // per IP per window
const ipHits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string) {
  const now = Date.now();
  const rec = ipHits.get(ip);
  if (!rec || now > rec.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true, remaining: RATE_MAX - 1 };
  }
  if (rec.count >= RATE_MAX) {
    return { ok: false, remaining: 0, resetAt: rec.resetAt };
  }
  rec.count += 1;
  return { ok: true, remaining: RATE_MAX - rec.count };
}

/** ---------------------------
 * Types / validation
 * --------------------------*/
type Tone = "Poetic" | "Documentary" | "Minimal" | "Instagram" | "Xiaohongshu";
type Length = "Short" | "Medium" | "Long";
type Lang = "English" | "Chinese";

const OutputSchema = z.object({
  variants: z
    .array(
      z.object({
        caption: z.string(),
      })
    )
    .min(3)
    .max(3),
  altText: z.string(),
  hashtags: z.array(z.string()),
});

function safePick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function safeJsonParse(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function normalizeHashtag(tag: string) {
  let t = tag.replace(/^#+/, "").trim().toLowerCase();
  t = t.replace(/[\s-]+/g, "_");
  t = t.replace(/[^a-z0-9_]/g, "");
  if (t.length > 28) t = t.slice(0, 28);
  return t;
}

function buildStyleGuide(tone: Tone) {
  switch (tone) {
    case "Documentary":
      return "Documentary tone: grounded, concrete details, calm observation. Avoid clichés and dramatic exaggeration.";
    case "Poetic":
      return "Poetic tone: subtle imagery and rhythm, but stay faithful to what's visible. Avoid purple prose and clichés.";
    case "Minimal":
      return "Minimal tone: very concise, understated, no emojis, no fluff.";
    case "Instagram":
      return "Instagram tone: short hook + tasteful line. Avoid cringe. Emojis optional (0–1).";
    case "Xiaohongshu":
      return "Xiaohongshu tone: friendly everyday vibe, 1–2 short sentences, natural spoken Chinese. Emojis optional (0–2). No hard-sell.";
    default:
      return "Neutral tone.";
  }
}

function buildLengthGuide(length: Length, lang: Lang) {
  if (length === "Short") {
    return lang === "English"
      ? "Caption length: 1 sentence, ideally <= 12 words."
      : "Caption length: 1 short sentence, concise.";
  }
  if (length === "Long") {
    return "Caption length: 2–3 sentences max. Do NOT write more.";
  }
  return "Caption length: 1–2 sentences.";
}

/** ---------------------------
 * Handler
 * --------------------------*/
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return new NextResponse("Missing OPENAI_API_KEY.", { status: 500 });
  }

  // rate limit
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return new NextResponse("Rate limit exceeded. Please try again in a minute.", { status: 429 });
  }

  try {
    const formData = await req.formData();
    const image = formData.get("image");

    const toneRaw = String(formData.get("tone") ?? "Documentary");
    const lengthRaw = String(formData.get("length") ?? "Medium");
    const langRaw = String(formData.get("lang") ?? "English");

    const tone = safePick<Tone>(
      toneRaw,
      ["Poetic", "Documentary", "Minimal", "Instagram", "Xiaohongshu"] as const,
      "Documentary"
    );
    const length = safePick<Length>(lengthRaw, ["Short", "Medium", "Long"] as const, "Medium");
    const lang = safePick<Lang>(langRaw, ["English", "Chinese"] as const, "English");

    if (!image || !(image instanceof File)) {
      return new NextResponse("Image file is required.", { status: 400 });
    }

    const arrayBuffer = await image.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Raw size guard: 12MB
    if (inputBuffer.byteLength > 12 * 1024 * 1024) {
      return new NextResponse("Image too large. Please keep under 12MB.", { status: 413 });
    }

    // ✅ Speed/Cost: resize to 1024px max + jpeg
    const optimized = await sharp(inputBuffer)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();

    const dataUrl = `data:image/jpeg;base64,${optimized.toString("base64")}`;

    const languageDescription = lang === "Chinese" ? "Simplified Chinese" : "natural English";
    const styleGuide = buildStyleGuide(tone);
    const lengthGuide = buildLengthGuide(length, lang);

    const system = `
You are a professional photographer's assistant specialized in captions and accessibility text.
Be faithful to what is visible in the image.
Do NOT guess specific locations, names, or events.
Return STRICT JSON only. No markdown. No extra text.
    `.trim();

    const prompt = [
      `Return JSON with EXACT shape:`,
      `{`,
      `  "variants": [{ "caption": string }, { "caption": string }, { "caption": string }],`,
      `  "altText": string,`,
      `  "hashtags": string[]`,
      `}`,
      ``,
      `Rules:`,
      `- Produce EXACTLY 3 caption variants in "variants". Each must be distinct in wording and angle, but all faithful to the image.`,
      `- Captions: write in ${languageDescription}. ${styleGuide}`,
      `- ${lengthGuide}`,
      `- altText: objective accessibility description in ${languageDescription}. No emojis. No hashtags. No assumptions.`,
      `- hashtags: 6–8 tags related to the visible scene/style/mood.`,
      `  * array values must NOT include "#".`,
      `  * in English mode: use lowercase english tags, no spaces, only letters/numbers/underscores.`,
      `  * keep each tag short (<= 28 chars).`,
      ``,
      `Return ONLY valid JSON. No extra keys.`,
    ].join("\n");

    // ✅ Try faster vision model
    // If your account doesn't have gpt-4o-mini, switch to "gpt-4.1-mini"
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: dataUrl, detail: "auto" },
          ],
        },
      ],
      temperature: 0.7,
      max_output_tokens: 260,
    });

    const raw = response.output_text ?? "";
    let parsed: unknown;

    try {
      parsed = safeJsonParse(raw);
    } catch {
      return new NextResponse(`AI returned invalid JSON.\n\nRaw:\n${raw}`, { status: 502 });
    }

    const validated = OutputSchema.safeParse(parsed);
    if (!validated.success) {
      return new NextResponse(`AI returned wrong shape.\n\nRaw:\n${raw}`, { status: 502 });
    }

    const variants = validated.data.variants
      .map((v) => v.caption?.trim?.() ?? "")
      .filter(Boolean)
      .slice(0, 3);

    // fallback: ensure always 3 items for UI
    while (variants.length < 3) variants.push("");

    const altText = validated.data.altText.trim();

    // Clean hashtags
    const rawTags = validated.data.hashtags
      .map((t) => String(t ?? ""))
      .map((t) => t.replace(/^#+/, "").trim())
      .filter(Boolean);

    const hashtags =
      lang === "English"
        ? Array.from(new Set(rawTags.map(normalizeHashtag))).filter(Boolean).slice(0, 8)
        : Array.from(new Set(rawTags)).filter(Boolean).slice(0, 8);

    return NextResponse.json({
      variants,
      altText,
      hashtags,
    });
  } catch (err: any) {
    console.error("Caption API error:", err);

    if (err?.status) {
      return new NextResponse(err?.message || "Upstream OpenAI error occurred.", {
        status: err.status,
      });
    }

    return new NextResponse(err?.message || "Failed to generate caption.", { status: 500 });
  }
}