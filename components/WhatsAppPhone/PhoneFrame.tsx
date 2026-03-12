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
import { createPortal } from "react-dom";
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

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [live.messages]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.height = "100%";
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || !window.visualViewport) return;

    const handleResize = () => {
      const vvHeight = window.visualViewport?.height ?? window.innerHeight;
      const offset = window.innerHeight - vvHeight;
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
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isMobile]);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setKeyboardOffset(0);
    inputRef.current?.blur();
  }, []);

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
    </div>
  );

  const fullscreenOverlay = isFullscreen
    ? createPortal(
        <div
          className="phone-fullscreen"
          style={{ paddingBottom: keyboardOffset }}
          aria-modal="true"
          role="dialog"
          aria-label="Chat con Agente Prisma"
        >
          <div className="fullscreen-top-safe" />
          {header}
          <button
            type="button"
            className="fullscreen-exit-btn"
            onClick={closeFullscreen}
          >
            Salir — presiona aquí
          </button>
          {thread}
          {inputBar}
          <div className="fullscreen-bottom-safe" />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className="phone-shell"
        aria-label="Demo del agente en un clon de WhatsApp"
        onClick={isMobile ? openFullscreen : undefined}
        style={isMobile ? { cursor: "pointer" } : undefined}
      >
        <div className="phone-frame">
          <div className="phone-statusbar">
            <span className="phone-status-time">9:41</span>
            <div className="phone-status-icons" aria-hidden="true">
              <div className="phone-signal">
                <span /><span /><span /><span />
              </div>
              <Wifi size={13} strokeWidth={2.1} />
              <span className="phone-battery" />
            </div>
          </div>
          {header}
          {thread}
          {inputBar}
          <div className="phone-home-indicator" />
        </div>
      </div>
      {fullscreenOverlay}
    </>
  );
}
