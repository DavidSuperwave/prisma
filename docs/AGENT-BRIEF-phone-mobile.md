# Agent Brief: WhatsApp Phone Component — Mobile Full-Screen + API Fix

**Repo:** `DavidSuperwave/prisma`  
**Stack:** Next.js 14 App Router, TypeScript, plain CSS (no Tailwind)  
**Priority:** High — this is the primary interactive demo on the homepage hero

---

## Context

The `PhoneFrame` component (`components/WhatsAppPhone/PhoneFrame.tsx`) renders a visual WhatsApp phone mockup with a live AI chat powered by OpenRouter. It sits in the right column of the homepage hero.

There are **three problems** to fix:

1. **API is broken** — the chat returns an error bubble instead of a real AI response
2. **Desktop input focus** — clicking the input shows a black/dark highlight box
3. **Mobile UX** — on mobile the phone needs to go full-screen when tapped, with the real native keyboard pushing content up correctly

---

## Problem 1: API Key Error

### Symptom
The agent bubble shows: *"No pude responder en este momento. Intenta de nuevo o revisa la configuracion del API key."*

### Root Cause
`app/api/chat/route.ts` reads `process.env.OPENROUTER_API_KEY`. On Vercel, env vars added after the last deploy are NOT active — you must redeploy.

### Fix — Two parts

**Part A: Verify `.env.local` locally**

File: `.env.local` (at project root, never committed)
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxx
OPENROUTER_MODEL=openai/gpt-4o-mini
```
Rules:
- No spaces around `=`
- No quotes around the value
- Restart the dev server after editing (`npm run dev`)

**Part B: Add a debug log to `route.ts` temporarily**

In `app/api/chat/route.ts`, right after the `apiKey` line, add:
```ts
console.log('[chat] apiKey present:', !!apiKey, '| model:', model);
```
If the log prints `false` for `apiKey present`, the env var is not being injected. On Vercel: go to **Project Settings → Environment Variables**, confirm both vars exist, then go to **Deployments → Redeploy** (top-right "..." menu → Redeploy).

**Remove the debug log once confirmed working.**

### No code changes needed to `route.ts` otherwise — the logic is correct.

---

## Problem 2: Desktop Input Focus — Black Box

### Symptom
Clicking the message input on desktop shows a dark/black highlight or focus ring that looks broken against the light chat background.

### Fix

File: `app/globals.css`

Find the `.chat-form` block and add these rules:

```css
/* Fix input focus appearance inside the phone */
.chat-form input:focus {
  outline: none;
  box-shadow: none;
  background: #fff;
}

.chat-form:focus-within {
  border-color: rgba(37, 165, 95, 0.5);
}
```

Also ensure the `<input>` in `components/WhatsAppPhone/ChatInput.tsx` has `autoComplete="off"` and `autoCorrect="off"` to prevent browser UI from injecting extra chrome:

```tsx
<input
  type="text"
  inputMode="text"
  autoComplete="off"
  autoCorrect="off"
  autoCapitalize="sentences"
  value={value}
  onChange={(event) => onChange(event.target.value)}
  placeholder={placeholder}
  disabled={disabled}
  aria-label="Mensaje para el agente"
/>
```

---

## Problem 3: Mobile Full-Screen Chat

### Desired Behavior
When a user on mobile taps the phone component:
1. The chat expands to fill the **entire screen** (like opening WhatsApp)
2. The native keyboard appears at the bottom
3. The input bar sits directly **above** the keyboard
4. Messages scroll in the space between the WhatsApp header and the input
5. A back `<` button in the header closes the fullscreen view and returns to the page

### Key Technical Decisions
- Use `position: fixed; inset: 0` for the fullscreen overlay
- Use `100dvh` (dynamic viewport height) — NOT `100vh` — so the container respects the iOS address bar
- Use the `window.visualViewport` API to detect keyboard height and offset the input bar
- Lock `document.body` scroll when fullscreen is open
- Auto-scroll the chat thread to the bottom on every new message
- Only trigger fullscreen on mobile (detect via a `useIsMobile` hook checking `window.innerWidth < 768` or a CSS media approach)

### Do NOT
- Render a fake/visual keyboard — it will never look native
- Use `window.scrollY` or `window.scrollTo` for keyboard handling
- Use `100vh` — it breaks on iOS Safari
- Use any animation library — plain CSS transitions only

---

## File-by-File Changes

### `components/WhatsAppPhone/PhoneFrame.tsx` — Full Rewrite

Replace the entire file with the following:

```tsx
"use client";

import {
  Camera,
  ChevronLeft,
  Mic,
  Phone,
  Plus,
  Video,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatBubble, TypingBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { useLiveChat } from "./useLiveChat";

function formatChatDate(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export function PhoneFrame() {
  const live = useLiveChat(true);
  const [chatDate] = useState(() => formatChatDate(new Date()));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  // Auto-scroll thread to bottom on new messages
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [live.messages]);

  // Lock body scroll when fullscreen is open
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    };
  }, [isFullscreen]);

  // visualViewport: move input above keyboard
  useEffect(() => {
    if (!isFullscreen || !window.visualViewport) return;

    const handleResize = () => {
      const offset = window.innerHeight - (window.visualViewport?.height ?? window.innerHeight);
      setKeyboardOffset(Math.max(0, offset));
    };

    window.visualViewport.addEventListener("resize", handleResize);
    window.visualViewport.addEventListener("scroll", handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
      setKeyboardOffset(0);
    };
  }, [isFullscreen]);

  const openFullscreen = useCallback(() => {
    if (isMobile) {
      setIsFullscreen(true);
      // Focus input after transition so keyboard opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isMobile]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setKeyboardOffset(0);
    inputRef.current?.blur();
  }, []);

  // Shared phone chrome — used in both embedded and fullscreen modes
  const statusBar = (
    <div className="phone-statusbar">
      <span className="phone-status-time">9:41</span>
      <div className="phone-status-icons" aria-hidden="true">
        <div className="phone-signal">
          <span />
          <span />
          <span />
          <span />
        </div>
        <Wifi size={13} strokeWidth={2.1} />
        <span className="phone-battery" />
      </div>
    </div>
  );

  const header = (
    <div className="whatsapp-header">
      <button
        type="button"
        className="whatsapp-icon-button"
        aria-label="Volver"
        onClick={isFullscreen ? closeFullscreen : undefined}
      >
        <ChevronLeft size={20} strokeWidth={2.25} />
      </button>
      <div className="whatsapp-avatar">P</div>
      <div className="whatsapp-meta">
        <strong>Agente Prisma</strong>
        <span>en línea</span>
      </div>
      <div className="whatsapp-header-actions">
        <button type="button" className="whatsapp-icon-button" aria-label="Videollamada">
          <Video size={18} strokeWidth={2} />
        </button>
        <button type="button" className="whatsapp-icon-button" aria-label="Llamada">
          <Phone size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );

  const thread = (
    <div className="chat-thread" ref={threadRef}>
      <div className="chat-day-label">{chatDate}</div>
      {live.messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {live.isLoading && <TypingBubble />}
    </div>
  );

  const inputBar = (
    <div className="chat-input-wrap">
      <div className="chat-composer-bar">
        <button type="button" className="composer-side-action" aria-label="Agregar">
          <Plus size={20} strokeWidth={2.2} />
        </button>
        <div className="chat-form-wrap">
          <ChatInput
            ref={inputRef}
            value={live.input}
            onChange={live.setInput}
            onSubmit={live.sendMessage}
            disabled={live.isLoading}
            placeholder="Escribe un mensaje"
          />
        </div>
        <button type="button" className="composer-side-action" aria-label="Camara">
          <Camera size={19} strokeWidth={2} />
        </button>
        <button type="button" className="composer-side-action" aria-label="Microfono">
          <Mic size={19} strokeWidth={2} />
        </button>
      </div>
      <div className="phone-home-indicator" />
    </div>
  );

  // FULLSCREEN MODE (mobile only)
  if (isFullscreen) {
    return (
      <div
        className="phone-fullscreen"
        style={{ paddingBottom: keyboardOffset }}
        aria-modal="true"
        role="dialog"
        aria-label="Chat con Agente Prisma"
      >
        {statusBar}
        {header}
        {thread}
        {inputBar}
      </div>
    );
  }

  // EMBEDDED MODE (desktop always, mobile before tap)
  return (
    <div
      className="phone-shell"
      aria-label="Demo del agente en un clon de WhatsApp"
      onClick={isMobile ? openFullscreen : undefined}
      style={isMobile ? { cursor: "pointer" } : undefined}
    >
      <div className="phone-frame">
        {statusBar}
        {header}
        {thread}
        {inputBar}
      </div>
    </div>
  );
}
```

> **Note:** `ChatInput` needs a `ref` prop forwarded — see the ChatInput change below.

---

### `components/WhatsAppPhone/ChatInput.tsx` — Add forwardRef

Replace the entire file:

```tsx
import { SendHorizontal, Smile } from "lucide-react";
import { forwardRef } from "react";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      disabled = false,
      placeholder = "Escribe tu mensaje",
    },
    ref
  ) {
    return (
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <button type="button" className="chat-form-icon" aria-label="Stickers">
          <Smile size={18} strokeWidth={2} />
        </button>
        <input
          ref={ref}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Mensaje para el agente"
        />
        <button
          type="submit"
          aria-label="Enviar mensaje"
          disabled={disabled || !value.trim()}
        >
          <SendHorizontal size={18} strokeWidth={2.25} />
        </button>
      </form>
    );
  }
);
```

---

### `app/globals.css` — Add fullscreen styles + fix input focus

Append the following **at the end** of `app/globals.css`:

```css
/* ── Phone fullscreen (mobile) ─────────────────────────────────── */
.phone-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: #ece5dd;
  height: 100dvh; /* dynamic viewport — accounts for iOS keyboard + address bar */
  overflow: hidden;
}

.phone-fullscreen .chat-thread {
  flex: 1;
  min-height: 0; /* critical: allows flex child to shrink below content size */
  max-height: none;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.phone-fullscreen .phone-statusbar {
  background: #f7f7f7;
}

.phone-fullscreen .whatsapp-header {
  background: rgba(247, 247, 247, 0.98);
}

.phone-fullscreen .chat-input-wrap {
  flex-shrink: 0;
}

/* ── Desktop input focus fix ──────────────────────────────────── */
.chat-form input:focus {
  outline: none;
  box-shadow: none;
  background: #fff;
}

.chat-form:focus-within {
  border-color: rgba(37, 165, 95, 0.4);
}
```

---

### `.env.local` — Environment Variables (local dev)

Create or update `.env.local` at the project root. This file is already in `.gitignore` and should never be committed.

```
OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Rules:
- No spaces around `=`
- No quotes around the value
- Restart `npm run dev` after any change to this file

### Vercel Production
1. Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**
2. Confirm `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` exist under **Production**
3. Go to **Deployments** tab → click the `...` menu on the latest deployment → **Redeploy**
4. Do NOT check "Use existing build cache" so the new env vars are picked up

---

## Acceptance Criteria

- [ ] Typing a message in the phone demo returns a real AI response (not the error bubble)
- [ ] On desktop, clicking the input shows no dark/black highlight or overlay
- [ ] On mobile (< 768px), tapping the phone component expands it to fill the full screen
- [ ] On mobile fullscreen, tapping the input brings up the native iOS/Android keyboard and the input bar sits directly above it
- [ ] The back button (`<`) closes the fullscreen and returns to the normal page
- [ ] New messages auto-scroll the thread to the bottom
- [ ] The page behind the fullscreen chat does not scroll while the chat is open
- [ ] No fake keyboard is rendered at any point
- [ ] `TypingBubble` appears while the AI is generating a response

---

## Files to Touch (Summary)

| File | Type of Change |
|---|---|
| `components/WhatsAppPhone/PhoneFrame.tsx` | Full rewrite |
| `components/WhatsAppPhone/ChatInput.tsx` | Add `forwardRef`, add input attrs |
| `app/globals.css` | Append fullscreen + focus styles |
| `.env.local` | Add/fix env vars (local only) |
| Vercel Dashboard | Confirm env vars + redeploy |

**Do not modify:**
- `useLiveChat.ts` — SSE streaming logic is correct
- `ChatBubble.tsx` — no changes needed (but `TypingBubble` import is now used)
- `route.ts` — API logic is correct, only env vars need fixing
- `WhatsAppPhone.tsx` — the legacy demo-section component, leave as-is
- `page.tsx` — hero layout is correct, no changes needed
