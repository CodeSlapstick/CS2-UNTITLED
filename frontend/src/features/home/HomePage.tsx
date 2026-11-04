import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/anuphan/400.css";
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LangToggle, useT } from "@/shared/i18n";
import { ThemeToggle } from "@/shared/theme";
import { MapView } from "@/features/rounds/RoundView";
import { SAMPLE_DURATION, sampleDeaths, sampleGrenades, sampleLiveAt, samplePeople, sampleRound, samplePositions, sampleDefuseAt } from "./homeReplay";
import "./home-replay.css";

const COPY = {
  th: {
    navAbout: "ระบบช่วยอะไรได้บ้าง",
    navFlow: "เริ่มต้นใช้งาน",
    signIn: "เข้าสู่ระบบ",
    tryNow: "ลองใช้งาน",
    headline: "ดูให้ครบทั้งรอบ\nก่อนสรุปจากจังหวะเดียว",
    lead: "เปลี่ยนเดโม CS2 ให้เป็นภาพรวมทีละรอบ เห็นตำแหน่งผู้เล่น จังหวะปะทะ และ utility ที่กำลังทำงานในแต่ละวินาที",
    note: "อ้างอิงจากเดโมของทีมคุณ · ดูข้อเท็จจริงโดยไม่ตัดสินผู้เล่น",
    stageRound: "รอบ 18 · Mirage",
    stageTime: "00:31 / 00:48",
    stageSample: "รีเพลย์ตัวอย่าง",
    stagePlay: "เล่นรีเพลย์ตัวอย่าง",
    stagePause: "หยุดรีเพลย์ตัวอย่างชั่วคราว",
    stageTimeline: "ไทม์ไลน์รีเพลย์ตัวอย่าง",
    stageEvent: "วางระเบิด",
    stageKill: "Opening duel",
    stageUtility: "Smoke กำลังทำงาน",
    whyTitle: "รีวิวรอบบนแผนที่\nพร้อมข้อมูลทุกจังหวะ",
    whyBody: "ดูว่าทีมเสียพื้นที่ตรงไหน เพื่อนอยู่ใกล้พอจะ trade หรือไม่ และ utility ใดกำลังทำงานในแต่ละวินาทีจากแผนที่เดียว",
    f1: "ย้อนดูทุกจังหวะบนแผนที่",
    f1d: "เลื่อน timeline เพื่อดูตำแหน่งผู้เล่น จุดตาย เส้นยิง และ utility ที่กำลังทำงานในขณะนั้น",
    f2: "เห็นพื้นที่ที่ปะทะบ่อย",
    f2d: "ดู heatmap ของทีม แล้วเปรียบเทียบตำแหน่งการตายกับข้อมูลจากทีมอาชีพ",
    f3: "ดูสถิติรอบในบริบท",
    f3d: "ดู opening, trade, clutch, ADR, KAST และภาพรวมเศรษฐกิจในแต่ละรอบได้จากเดโมเดียวกัน",
    flowTitle: "อัปโหลดเดโม\nแล้วเริ่มรีวิวกับทีม",
    step1: "อัปโหลด .dem",
    step1d: "เลือกไฟล์เดโมของทีม แล้วปล่อยให้ระบบประมวลผลอยู่เบื้องหลัง",
    step2: "เลือกแมตช์และรอบ",
    step2d: "ดูสกอร์บอร์ด ภาพรวมเศรษฐกิจ หรือเลือกเจาะรายละเอียดทีละรอบ",
    step3: "รีวิวรอบไปพร้อมกัน",
    step3d: "เลื่อนเวลา เลือกผู้เล่น แล้วแชร์ลิงก์มุมมองเดียวกันให้ทุกคนในทีม",
    finalTitle: "เปิดเดโมแล้วเลือกรอบที่ต้องการทบทวน",
    finalBody: "ลองดูระบบได้ทันทีในโหมดผู้เยี่ยมชม หรือล็อกอินด้วย Steam เพื่อเชื่อมสถิติเข้ากับบัญชีของคุณ",
    finalCta: "ลองใช้งาน CS2 UNTITLED",
  },
  en: {
    navAbout: "About",
    navFlow: "How it works",
    signIn: "Sign in",
    tryNow: "Explore the system",
    headline: "See the whole round\nbefore judging one moment",
    lead: "Turn a CS2 demo into a round-by-round map story. See where every player was, when the fight happened, and which utility was active at that second.",
    note: "Your team's demo data · facts without grading players",
    stageRound: "Round 18 · Mirage",
    stageTime: "00:31 / 00:48",
    stageSample: "SAMPLE REPLAY",
    stagePlay: "Play sample replay",
    stagePause: "Pause sample replay",
    stageTimeline: "Sample replay timeline",
    stageEvent: "Bomb planted",
    stageKill: "Opening duel",
    stageUtility: "Smoke active",
    whyTitle: "Review the round\nwith every event on the map",
    whyBody: "See where the team lost space, whether a teammate was close enough to trade, and which utility was active at each second.",
    f1: "Replay player positions",
    f1d: "Scrub second by second with deaths, shot lines, and utility active at that moment.",
    f2: "Read fight patterns",
    f2d: "View your team's death heatmap and compare positional shares with a professional reference set.",
    f3: "Put round stats in context",
    f3d: "Break down openings, trades, clutches, ADR, KAST, and round economy from the same demo.",
    flowTitle: "Upload a demo\nand review it with your team",
    step1: "Upload a .dem",
    step1d: "Drop in your team's demo while parsing runs in the background.",
    step2: "Pick a match and round",
    step2d: "Open the scoreboard, economy overview, or inspect one round.",
    step3: "Review the same picture",
    step3d: "Scrub time, select a player, and share the exact view by URL.",
    finalTitle: "Open a demo and choose a round to review",
    finalBody: "Explore immediately as a guest, or sign in with Steam to connect stats to your account.",
    finalCta: "Explore CS2 UNTITLED",
  },
} as const;

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 10V3h7M22 3h7v7M29 22v7h-7M10 29H3v-7" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="6.5" stroke="#00E5FF" strokeWidth="2" />
      <path d="M16 6.5v5M16 20.5v5M6.5 16h5M20.5 16h5" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

const PREVIEW_DURATION = SAMPLE_DURATION;
function formatPreviewTime(value: number) {
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

function ReplayPreview({ c }: { c: (typeof COPY)[keyof typeof COPY] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(true);
  const [mapView, setMapView] = useState<{ zoom: number; center: [number, number] | null }>({ zoom: 1, center: null });
  const [highlight, setHighlight] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const live = sampleLiveAt(time);
  const defuse = sampleDefuseAt(time);
  const roundLabel = c.stageRound.replace("Mirage", "Dust2");

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    let frame = 0;
    let previous = performance.now();
    const advance = (now: number) => {
      const elapsed = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      setTime((current) => (current + elapsed * speed) % PREVIEW_DURATION);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, visible, speed]);

  return (
    <div className="home-stage" ref={rootRef} aria-label={roundLabel}>
      <div className="stage-head"><b>{roundLabel}</b><span className="stage-live"><i /> {c.stageSample}</span></div>
      <div className="stage-body">
        <div className="stage-map map-stage">
          <MapView radar={sampleRound.radar!}
            deaths={sampleDeaths.filter((event) => (event.t_round ?? Infinity) <= time)} grenades={sampleGrenades} live={live}
            bomb={time < (sampleRound.round.bomb_resolved_t ?? Infinity) ? sampleRound.round.bomb : null} bombPlantedT={sampleRound.round.bomb_planted_t}
            positions={samplePositions} damages={sampleRound.damages} startTick={sampleRound.round.start_tick} tickrate={128}
            defusingPlayer={defuse?.player} defuseProgressPercent={defuse?.progress}
            playbackTime={time} reducedMotion={reducedMotion}
            zoom={mapView.zoom} center={mapView.center}
            onView={(zoom, center) => setMapView({ zoom, center })}
            highlight={highlight} onHover={setHighlight} selected={null} onSelect={() => {}} />
          <div className="stage-map-hud"><span>CT {live.filter((p) => p.side === "ct").length} : {live.filter((p) => p.side === "t").length} T</span><button type="button" onClick={() => setMapView({ zoom: 1, center: null })}>1:1</button></div>
        </div>
        <div className="stage-sidebar">
          <div className="stage-rosters">{(["ct", "t"] as const).map((side) => <section key={side} className={`stage-team ${side}`}><h3>{side.toUpperCase()}<span>{live.filter((p) => p.side === side).length} / 5</span></h3>{samplePeople.filter((p) => p.side === side).map((person) => {
            const player = live.find((p) => p.steamid === person.steamid);
            return <button type="button" key={person.steamid} className={!player ? "dead" : ""} onMouseEnter={() => setHighlight(person.steamid)} onMouseLeave={() => setHighlight(null)} onFocus={() => setHighlight(person.steamid)} onBlur={() => setHighlight(null)}><i>{person.slot}</i><span title={person.name}>{person.name}</span><b>{player ? `${player.hp} HP` : "×"}</b></button>;
          })}</section>)}</div>
        </div>
      </div>
      <div className="stage-controls">
        <button className={`stage-play${playing ? " playing" : ""}`} type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? c.stagePause : c.stagePlay}><span /></button>
        <input aria-label={c.stageTimeline} type="range" min="0" max={PREVIEW_DURATION} step="0.1" value={time} onChange={(event) => setTime(Number(event.currentTarget.value))} />
        <select className="stage-speed" aria-label={c.stageSample + " speed"} value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>{[.5, 1, 2].map((value) => <option key={value} value={value}>{value}x</option>)}</select>
        <b>{formatPreviewTime(time)} / {formatPreviewTime(PREVIEW_DURATION)}</b>
      </div>
    </div>
  );
}

export function HomePage() {
  const { lang } = useT();
  const c = COPY[lang];
  return (
    <div className="home-page">
      <header className="home-nav">
        <Link className="home-brand" to="/" aria-label="CS2 UNTITLED home"><Mark /><span>CS2 UNTITLED</span></Link>
        <nav aria-label="Home navigation">
          <a href="#about">{c.navAbout}</a>
          <a href="#workflow">{c.navFlow}</a>
        </nav>
        <div className="home-actions">
          <ThemeToggle />
          <LangToggle className="home-lang" />
          <Link className="home-signin" to="/login">{c.signIn}</Link>
        </div>
      </header>

      <div className="home-content">
        <section className="home-hero">
          <div className="home-hero-copy">
            <h1>{c.headline.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
            <p>{c.lead}</p>
            <div className="home-hero-actions">
              <Link className="home-primary" to="/login?next=%2Fmatches">{c.tryNow}<Arrow /></Link>
              <span>{c.note}</span>
            </div>
          </div>

          <ReplayPreview c={c} />
        </section>

        <section className="home-proof" id="about">
          <div className="proof-copy"><h2>{c.whyTitle.split("\n").map((line) => <span key={line}>{line}</span>)}</h2><p>{c.whyBody}</p></div>
          <div className="proof-list">
            {[[c.f1, c.f1d], [c.f2, c.f2d], [c.f3, c.f3d]].map(([title, body], i) => (
              <article key={title}><span className={`proof-glyph glyph-${i + 1}`} aria-hidden="true" /><div><h3>{title}</h3><p>{body}</p></div></article>
            ))}
          </div>
        </section>

        <section className="home-workflow" id="workflow">
          <h2>{c.flowTitle.split("\n").map((line) => <span key={line}>{line}</span>)}</h2>
          <ol>
            {[[c.step1, c.step1d], [c.step2, c.step2d], [c.step3, c.step3d]].map(([title, body], i) => (
              <li key={title}><b>{i + 1}</b><div><h3>{title}</h3><p>{body}</p></div></li>
            ))}
          </ol>
        </section>

        <section className="home-close">
          <div><h2>{c.finalTitle}</h2><p>{c.finalBody}</p></div>
          <Link className="home-primary" to="/login?next=%2Fmatches">{c.finalCta}<Arrow /></Link>
        </section>
      </div>
      <footer className="home-footer"><Link className="home-brand" to="/"><Mark /><span>CS2 UNTITLED</span></Link></footer>
    </div>
  );
}
