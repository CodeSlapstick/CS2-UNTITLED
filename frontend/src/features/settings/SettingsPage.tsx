import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { auth, isGuest, request } from "@/shared/api";
import { useT } from "@/shared/i18n";
import "./settings.css";

interface SteamSettings {
  steam_id: string; connected: boolean; service_ready: boolean;
  status: string; message: string | null; imported: number; last_sync_at: string | null;
}
export function SettingsPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: auth.me });
  const guest = isGuest(me.data?.user);
  const query = useQuery({ queryKey: ["steam-settings"], queryFn: () => request<SteamSettings>("/api/settings/steam"), enabled: !!me.data && !guest,
    refetchInterval: q => ["queued", "syncing"].includes(q.state.data?.status ?? "") ? 3000 : false });
  const [code, setCode] = useState("");
  const [share, setShare] = useState("");
  const [saved, setSaved] = useState(false);
  const action = useMutation({ mutationFn: async (kind: "save" | "sync" | "disconnect") => {
    if (kind === "save") return request("/api/settings/steam", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authentication_code: code.trim(), share_code: share.trim() }) });
    return request(kind === "sync" ? "/api/settings/steam/sync" : "/api/settings/steam", { method: kind === "sync" ? "POST" : "DELETE" });
  }, onSuccess: async (_, kind) => {
    setSaved(kind === "save"); setCode(""); setShare("");
    await qc.invalidateQueries({ queryKey: ["steam-settings"] });
    await qc.invalidateQueries({ queryKey: ["matches"] });
  } });
  const data = query.data;
  const working = action.isPending || ["queued", "syncing"].includes(data?.status ?? "");
  function save(event: FormEvent) { event.preventDefault(); setSaved(false); action.mutate("save"); }
  return <div className="settings-page">
    <h1>{t("ตั้งค่า")}</h1>
    <section className="settings-steam" aria-labelledby="steam-settings-heading">
      <h2 id="steam-settings-heading">{t("นำเข้าแมตช์จาก Steam")}</h2>
      <p>{t("บันทึกรหัสประวัติแมตช์ แล้วกดซิงก์เพื่อนำเข้าเดโมโดยไม่ต้องอัปโหลดไฟล์")}</p>
      {guest ? <a className="btn-primary" href="/auth/steam/login?next=%2Fsettings">{t("ล็อกอินด้วย Steam")}</a> : <>
        {query.isPending && <p role="status">{t("กำลังโหลด…")}</p>}
        {query.error && <p className="err" role="alert">{t(query.error.message)}</p>}
        {data && <>
          <dl className="settings-status"><div><dt>Steam ID</dt><dd>{data.steam_id}</dd></div>
            <div><dt>{t("การเชื่อมต่อ")}</dt><dd>{t(data.connected ? "บันทึกรหัสแล้ว" : "ยังไม่ได้เชื่อมต่อ")}</dd></div>
          </dl>
          {!data.service_ready && <p className="settings-notice" role="status">{t("บริการนำเข้าแมตช์ Steam ยังไม่พร้อม กรุณาติดต่อผู้ดูแลระบบ")}</p>}
          <form onSubmit={save} className="settings-form">
            <label>Game Authentication Code<input type="password" name="steam-history-auth" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" required maxLength={15} placeholder="XXXX-XXXXX-XXXX" disabled={working} /></label>
            <label>Match Sharing Code<input type="text" name="steam-history-share" value={share} onChange={e => setShare(e.target.value)} autoComplete="off" spellCheck={false} required maxLength={34} placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx" disabled={working} /></label>
            <p className="settings-help">{t("ใช้ Share Code ของแมตช์ล่าสุดในบัญชีนี้ รหัสจะถูกเก็บแบบเข้ารหัสและไม่แสดงกลับบนหน้าเว็บ")}</p>
            <a href="https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128" target="_blank" rel="noreferrer">{t("เปิดหน้ารหัสประวัติแมตช์บน Steam")}</a>
            <div className="settings-actions"><button className="btn-primary" type="submit" disabled={working || !code.trim() || !share.trim()}>{t(data.connected ? "บันทึกรหัสใหม่" : "บันทึกรหัส")}</button></div>
          </form>
          {saved && <p className="settings-result" role="status">{t("บันทึกรหัสแล้ว กดซิงก์เพื่อตรวจรหัสและนำเข้าแมตช์")}</p>}
          <div className="settings-sync">
            <div><h3>{t("ซิงก์แมตช์")}</h3><p>{t("นำเข้าสูงสุด 3 แมตช์ต่อครั้ง จากนั้นรอประมวลผลในหน้าแมตช์")}</p></div>
            <button type="button" className="btn-primary" disabled={working || !data.connected || !data.service_ready} onClick={() => { setSaved(false); action.mutate("sync"); }}>{t(working ? "กำลังดำเนินการ…" : "ซิงก์ตอนนี้")}</button>
          </div>
          {["queued", "syncing"].includes(data.status) && <p role="status">{t(data.status === "queued" ? "รอคิวซิงก์แมตช์…" : "กำลังดึงแมตช์จาก Steam…")}</p>}
          {data.message && <p role={data.status === "error" ? "alert" : "status"} className={data.status === "error" ? "err" : "settings-result"}>{t(data.message)}</p>}
          {data.last_sync_at && <p className="settings-help">{t("ซิงก์ล่าสุด")} {new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.last_sync_at))}</p>}
          <div className="settings-actions"><Link to="/matches">{t("ไปหน้าแมตช์")}</Link>{data.connected && <button type="button" className="link-btn" disabled={working} onClick={() => { setSaved(false); action.mutate("disconnect"); }}>{t("ลบรหัสเชื่อมต่อ")}</button>}</div>
        </>}
        {action.error && <p className="err" role="alert">{t(action.error.message)}</p>}
      </>}
    </section>
  </div>;
}
