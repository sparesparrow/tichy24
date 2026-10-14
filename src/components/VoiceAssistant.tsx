"use client";

import { createElement, useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * ElevenLabs Agents widget (https://elevenlabs.io/docs/eleven-agents/customization/widget).
 * Jedna instance v root layoutu, skript se nacte jednou (async z unpkg), v /admin se nezobrazuje.
 * Agent „Tichy24 Shop (DE/EN)“ je verejny — pristup omezuje allowlist domen v dashboardu ElevenLabs.
 */
const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "agent_3301m4y78hfse2ksm41yrgjdahp4";
const EMBED_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";
const SCRIPT_ID = "elevenlabs-convai-embed";

export function VoiceAssistant() {
  const pathname = usePathname();
  const hidden = pathname?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (hidden || document.getElementById(SCRIPT_ID) || customElements.get("elevenlabs-convai")) return;
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = EMBED_SRC;
    s.async = true;
    s.type = "text/javascript";
    document.body.appendChild(s);
  }, [hidden]);

  if (hidden || !AGENT_ID) return null;
  return createElement("elevenlabs-convai", { "agent-id": AGENT_ID, dismissible: "true" });
}
