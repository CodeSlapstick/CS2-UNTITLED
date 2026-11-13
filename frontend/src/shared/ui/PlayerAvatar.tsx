import { useState } from "react";
import "./player-avatar.css";

export function PlayerAvatar({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className="player-avatar" aria-hidden="true">
    <span>{Array.from(name.trim())[0]?.toLocaleUpperCase() || "?"}</span>
    {src && src !== failed && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />}
  </span>;
}
