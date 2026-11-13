import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/anuphan/400.css";
import "@fontsource/anuphan/500.css";
import "@fontsource/anuphan/600.css";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LangToggle, useT } from "@/shared/i18n";
import { ThemeToggle } from "@/shared/theme";
import { safeNext } from "@/shared/authNavigation";
import "./home.css";

const COPY = {
  th: {
    navFeatures: "สำรวจฟีเจอร์", signIn: "เข้าสู่ระบบ",
    headline: ["ดูให้ครบทั้งรอบ", "ก่อนสรุปจากจังหวะเดียว"],
    tryNow: "เข้าใช้งาน CS2 UNTITLED",
    demoLabel: "ชมการใช้งาน CS2 UNTITLED", demoNote: "คลิปสาธิตจากระบบของเรา",
    workflowTitle: ["หนึ่งเดโม", "รีวิวได้ครบทั้งแมตช์"],
    preview: "เล่นภาพตัวอย่าง", pause: "หยุดภาพตัวอย่าง", open: "เปิดฟีเจอร์",
    finalTitle: "ดูแมตช์ของคุณ",
    finalBody: "เข้าสู่ระบบด้วย Steam เพื่ออัปโหลดเดโม หรือดูแมตช์ตัวอย่างในโหมดผู้เยี่ยมชม",
    finalCta: "เข้าใช้งาน CS2 UNTITLED",
    features: [
      ["อัปโหลดเดโม", "นำเข้าไฟล์ .dem ของการแข่งขัน ระบบจะประมวลผลและเพิ่มแมตช์ให้พร้อมรีวิว"],
      ["2D Replay", "เล่นเหตุการณ์ย้อนหลัง เลื่อนเวลา และดูตำแหน่งผู้เล่นกับระเบิดบนแผนที่"],
      ["Heatmap", "สำรวจตำแหน่งคิล การตาย การยืน และระเบิด พร้อมเลือกรอบ ฝั่ง และผู้เล่น"],
      ["Economy", "เปรียบเทียบมูลค่าอุปกรณ์ ประเภทการซื้อ และผลแพ้ชนะในแต่ละรอบ"],
      ["Analysis", "ดูพื้นที่ที่ตายบ่อยและรูปแบบการเล่น เพื่อทบทวนจุดที่ควรปรับร่วมกับทีม"],
      ["Opening Routes", "ย้อนดูตำแหน่งผู้เล่นช่วงต้นรอบ เปรียบเทียบการเปิดพื้นที่และจุดที่ตาย"],
      ["รายงาน PDF", "รวบรวมผลวิเคราะห์และคำแนะนำเป็นรายงาน PDF สำหรับอ่านต่อหรือแชร์กับทีม"],
    ],
  },
  en: {
    navFeatures: "Explore features", signIn: "Sign in",
    headline: ["See the whole round", "before judging one moment"],
    tryNow: "Open CS2 UNTITLED",
    demoLabel: "CS2 UNTITLED in action", demoNote: "A walkthrough of our application",
    workflowTitle: ["One demo.", "A complete match review."],
    preview: "Play preview", pause: "Pause preview", open: "Open feature",
    finalTitle: "Review your match",
    finalBody: "Sign in with Steam to upload a demo, or explore a sample match in guest mode first.",
    finalCta: "Open CS2 UNTITLED",
    features: [
      ["Upload demo", "Import a .dem match file. The system processes it and adds the match to your review library."],
      ["2D Replay", "Replay events, scrub the timeline, and follow player positions and grenades on the map."],
      ["Heatmap", "Explore kills, deaths, positions, and utility. Filter by round, side, and player."],
      ["Economy", "Compare equipment values, buy types, and the result of each round."],
      ["Analysis", "Review frequent death locations and player patterns to discuss what your team can improve."],
      ["Opening Routes", "Revisit early-round positions and compare opening movements and death locations."],
      ["PDF Report", "Keep analysis and coaching recommendations in a PDF to read later or share with your team."],
    ],
  },
} as const;

const FEATURES = [
  { media: "upload", destination: "/matches" },
  { media: "replay", destination: "/matches" },
  { media: "heatmap", destination: "/matches" },
  { media: "economy", destination: "/matches" },
  { media: "analysis", destination: "/analysis" },
  { media: "opening", destination: "/analysis?tool=opening-route" },
  { media: "report", destination: "/matches" },
] as const;

function Mark() {
  return <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M3 10V3h7M22 3h7v7M29 22v7h-7M10 29H3v-7" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="16" cy="16" r="6.5" stroke="#00E5FF" strokeWidth="2" />
    <path d="M16 6.5v5M16 20.5v5M6.5 16h5M20.5 16h5" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function PlayIcon({ playing }: { playing: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{playing
    ? <path d="M8 5v14M16 5v14" />
    : <path d="m9 5 11 7-11 7Z" />}</svg>;
}

function FeaturePreview({ media, title, playLabel, pauseLabel }: {
  media: string; title: string; playLabel: string; pauseLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const manual = useRef(false);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function play(automatic = false) {
    const node = video.current;
    if (!node || (automatic && reducedMotion())) return;
    if (!node.getAttribute("src")) node.src = "/media/home/" + media + ".webm";
    void node.play().catch(() => setPlaying(false));
  }
  function pause() { video.current?.pause(); }
  function stopAutomatic() { if (!manual.current) pause(); }

  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const stop = () => {
      manual.current = false;
      node.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        stop();
        node.removeAttribute("src");
        node.load();
      }
    });
    const onVisibility = () => { if (document.hidden) stop(); };
    observer.observe(node);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <div className="home-feature-visual"
    onPointerEnter={(event) => { if (event.pointerType === "mouse") play(true); }}
    onPointerLeave={stopAutomatic}>
    <video ref={video} muted playsInline loop preload="none" poster={"/media/home/" + media + ".png"}
      aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
    <button type="button" className="home-preview-toggle" aria-label={(playing ? pauseLabel : playLabel) + " · " + title}
      aria-pressed={playing} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) play(true); }} onBlur={stopAutomatic}
      onClick={() => {
        if (video.current?.paused) { manual.current = true; play(); }
        else { manual.current = false; pause(); }
      }}>
      <PlayIcon playing={playing} />
    </button>
  </div>;
}

export function HomePage() {
  const { lang } = useT();
  const [params] = useSearchParams();
  const loginPath = "/login?next=" + encodeURIComponent(safeNext(params.get("next")));
  const c = COPY[lang];
  return <div className="home-page">
    <header className="home-nav">
      <Link className="home-brand" to="/" aria-label="CS2 UNTITLED home"><Mark /><span>CS2 UNTITLED</span></Link>
      <nav aria-label={lang === "th" ? "เมนูหน้าแรก" : "Home navigation"}>
        <a href="#workflow">{c.navFeatures}</a>
      </nav>
      <div className="home-actions">
        <ThemeToggle /><LangToggle className="home-lang" />
        <Link className="home-signin" to={loginPath}>{c.signIn}</Link>
      </div>
    </header>
    <div className="home-content">
      <section className="home-hero">
        <div className="home-hero-copy">
          <h1>{c.headline.map(line => <span key={line}>{line}</span>)}</h1>
          <div className="home-hero-actions">
            <Link className="home-primary" to={loginPath}>{c.tryNow}<Arrow /></Link>
          </div>
        </div>
        <figure className="home-demo" id="demo">
          <video controls autoPlay muted playsInline preload="auto" poster="/media/home/demo-poster.png"
            src="/media/home/demoweb1.mp4" aria-label={c.demoLabel}>
            <a href="/media/home/demoweb1.mp4">{c.demoLabel}</a>
          </video>
          <figcaption><strong>{c.demoLabel}</strong><span>{c.demoNote}</span></figcaption>
        </figure>
      </section>

      <section className="home-feature-section" id="workflow" aria-labelledby="home-workflow-title">
        <div className="home-feature-intro">
          <h2 id="home-workflow-title">{c.workflowTitle.map(line => <span key={line}>{line}</span>)}</h2>
        </div>
        <ol className="home-feature-grid">
          {FEATURES.map((feature, index) => {
            const [title, description] = c.features[index];
            return <li className="home-feature" key={feature.media}>
              <FeaturePreview media={feature.media} title={title} playLabel={c.preview} pauseLabel={c.pause} />
              <div className="home-feature-copy">
                <div className="home-feature-meta"><span>{String(index + 1).padStart(2, "0")}</span><Arrow /></div>
                <h3>{title}</h3><p>{description}</p>
                <Link className="home-feature-link" to={"/login?next=" + encodeURIComponent(feature.destination)}>
                  {c.open}<Arrow />
                </Link>
              </div>
            </li>;
          })}
        </ol>
      </section>

      <section className="home-close">
        <div><h2>{c.finalTitle}</h2><p>{c.finalBody}</p></div>
        <Link className="home-primary" to={loginPath}>{c.finalCta}<Arrow /></Link>
      </section>
    </div>
    <footer className="home-footer">
      <Link className="home-brand" to="/"><Mark /><span>CS2 UNTITLED</span></Link>
    </footer>
  </div>;
}
