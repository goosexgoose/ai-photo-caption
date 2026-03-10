# AI Photo Caption

AI Photo Caption is a lightweight mobile-first tool that generates **photo captions, alt text, and hashtags** from a single image.

It helps photographers, creators, and social media users quickly produce ready-to-publish captions for platforms like Instagram, X, or Xiaohongshu.

The app is built as a **Progressive Web App (PWA)** so it can be installed directly on mobile devices and used like a native app.

---

## ✨ Features

- 📸 Upload or take a photo directly from your phone
- 🤖 AI-generated captions based on the image
- 🅰️🅱️🅲 Multiple caption variants (A/B/C)
- ♿ Automatic **alt text** generation for accessibility
- #️⃣ Platform-ready **hashtags**
- 📱 Mobile-first UI with installable **PWA**
- 📤 One-tap **copy and share**
- 🕘 Local **generation history**
- 🌙 Clean dark UI optimized for mobile use

---

## 🚀 Live Demo

[https://ai-photo-captions.vercel.app/](https://ai-photo-caption-q1tz.vercel.app/)

You can also install it on mobile:

**iOS**
Safari → Share → Add to Home Screen

**Android**
Browser menu → Install App

---

## 🛠 Tech Stack

Frontend
- Next.js (App Router)
- React
- Tailwind CSS
- TypeScript

AI
- OpenAI Vision API

Mobile Experience
- Progressive Web App (PWA)
- Web Share API
- LocalStorage history

Deployment
- Vercel

---

## ⚙️ How It Works

1. User uploads or captures a photo
2. Image is compressed and sent to `/api/caption`
3. The server sends the image to the OpenAI Vision model
4. The model generates structured output:

```json
{
  "variants": ["caption A", "caption B", "caption C"],
  "altText": "...",
  "hashtags": ["tag1", "tag2"]
}
