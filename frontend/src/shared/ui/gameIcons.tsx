import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type SVGAttributes } from "react";
import { BombIcon } from "@/shared/assets/icons/weapons/bomb-icon";
import { DecoyIcon } from "@/shared/assets/icons/weapons/decoy-icon";
import { DefuserIcon } from "@/shared/assets/icons/weapons/defuser-icon";
import { FlashbangIcon } from "@/shared/assets/icons/weapons/flashbang-icon";
import { HeGrenadeIcon } from "@/shared/assets/icons/weapons/he-grenade-icon";
import { HelmetIcon } from "@/shared/assets/icons/weapons/helmet-icon";
import { IncendiaryGrenadeIcon } from "@/shared/assets/icons/weapons/incendiary-grenade-icon";
import { KevlarIcon } from "@/shared/assets/icons/weapons/kevlar-icon";
import { MolotovIcon } from "@/shared/assets/icons/weapons/molotov-icon";
import { SmokeGrenadeIcon } from "@/shared/assets/icons/weapons/smoke-grenade-icon";

type Props = SVGAttributes<SVGElement>;
type Icon = ComponentType<Props>;
type LazyIcon = LazyExoticComponent<Icon>;
const dynamic = (loader: () => Promise<{ default: Icon }>): LazyIcon => lazy(loader);

// Detailed weapon paths load only when that weapon is present. Utility/equipment icons stay eager.
const WEAPONS: Record<string, LazyIcon> = {
  ak47: dynamic(() => import("@/shared/assets/icons/weapons/ak47-icon").then((m) => ({ default: m.AK47Icon }))),
  aug: dynamic(() => import("@/shared/assets/icons/weapons/aug-icon").then((m) => ({ default: m.AUGIcon }))),
  awp: dynamic(() => import("@/shared/assets/icons/weapons/awp-icon").then((m) => ({ default: m.AWPIcon }))),
  bizon: dynamic(() => import("@/shared/assets/icons/weapons/bizon-icon").then((m) => ({ default: m.BizonIcon }))),
  bomb: dynamic(() => Promise.resolve({ default: BombIcon })),
  cz75a: dynamic(() => import("@/shared/assets/icons/weapons/cz75a-icon").then((m) => ({ default: m.CZ75AIcon }))),
  deagle: dynamic(() => import("@/shared/assets/icons/weapons/deagle-icon").then((m) => ({ default: m.DeagleIcon }))),
  elite: dynamic(() => import("@/shared/assets/icons/weapons/dual-elite-icon").then((m) => ({ default: m.DualEliteIcon }))),
  famas: dynamic(() => import("@/shared/assets/icons/weapons/famas-icon").then((m) => ({ default: m.FamasIcon }))),
  fiveseven: dynamic(() => import("@/shared/assets/icons/weapons/five-seven-icon").then((m) => ({ default: m.FiveSevenIcon }))),
  g3sg1: dynamic(() => import("@/shared/assets/icons/weapons/g3sg1-icon").then((m) => ({ default: m.G3SG1Icon }))),
  galilar: dynamic(() => import("@/shared/assets/icons/weapons/galilar-icon").then((m) => ({ default: m.GalilarIcon }))),
  glock: dynamic(() => import("@/shared/assets/icons/weapons/glock-icon").then((m) => ({ default: m.GlockIcon }))),
  knife: dynamic(() => import("@/shared/assets/icons/weapons/knife-icon").then((m) => ({ default: m.KnifeIcon }))),
  m249: dynamic(() => import("@/shared/assets/icons/weapons/m249-icon").then((m) => ({ default: m.M249Icon }))),
  m4a1: dynamic(() => import("@/shared/assets/icons/weapons/m4a4-icon").then((m) => ({ default: m.M4A4Icon }))),
  m4a1silencer: dynamic(() => import("@/shared/assets/icons/weapons/m4a1-icon").then((m) => ({ default: m.M4A1Icon }))),
  mac10: dynamic(() => import("@/shared/assets/icons/weapons/mac10-icon").then((m) => ({ default: m.Mac10Icon }))),
  mag7: dynamic(() => import("@/shared/assets/icons/weapons/mag7-icon").then((m) => ({ default: m.Mag7Icon }))),
  mp5sd: dynamic(() => import("@/shared/assets/icons/weapons/mp5sd-icon").then((m) => ({ default: m.MP5SDIcon }))),
  mp7: dynamic(() => import("@/shared/assets/icons/weapons/mp7-icon").then((m) => ({ default: m.MP7Icon }))),
  mp9: dynamic(() => import("@/shared/assets/icons/weapons/mp9-icon").then((m) => ({ default: m.MP9Icon }))),
  negev: dynamic(() => import("@/shared/assets/icons/weapons/negev-icon").then((m) => ({ default: m.NegevIcon }))),
  nova: dynamic(() => import("@/shared/assets/icons/weapons/nova-icon").then((m) => ({ default: m.NovaIcon }))),
  p2000: dynamic(() => import("@/shared/assets/icons/weapons/p2000-icon").then((m) => ({ default: m.P2000Icon }))),
  p250: dynamic(() => import("@/shared/assets/icons/weapons/p250-icon").then((m) => ({ default: m.P250Icon }))),
  p90: dynamic(() => import("@/shared/assets/icons/weapons/p90-icon").then((m) => ({ default: m.P90Icon }))),
  revolver: dynamic(() => import("@/shared/assets/icons/weapons/revolver-icon").then((m) => ({ default: m.RevolverIcon }))),
  sawedoff: dynamic(() => import("@/shared/assets/icons/weapons/sawed-off-icon").then((m) => ({ default: m.SawedOffIcon }))),
  scar20: dynamic(() => import("@/shared/assets/icons/weapons/scar20-icon").then((m) => ({ default: m.Scar20Icon }))),
  sg553: dynamic(() => import("@/shared/assets/icons/weapons/sg553-icon").then((m) => ({ default: m.SG553Icon }))),
  ssg08: dynamic(() => import("@/shared/assets/icons/weapons/ssg08-icon").then((m) => ({ default: m.SSG08Icon }))),
  tec9: dynamic(() => import("@/shared/assets/icons/weapons/tec9-icon").then((m) => ({ default: m.Tec9Icon }))),
  ump45: dynamic(() => import("@/shared/assets/icons/weapons/ump45-icon").then((m) => ({ default: m.UMP45Icon }))),
  usps: dynamic(() => import("@/shared/assets/icons/weapons/usps-icon").then((m) => ({ default: m.USPSIcon }))),
  world: dynamic(() => import("@/shared/assets/icons/weapons/world-icon").then((m) => ({ default: m.WorldIcon }))),
  xm1014: dynamic(() => import("@/shared/assets/icons/weapons/xm1014-icon").then((m) => ({ default: m.XM1014Icon }))),
  zeusx27: dynamic(() => import("@/shared/assets/icons/weapons/zeus-icon").then((m) => ({ default: m.ZeusIcon }))),
};

const normalize = (value: string) => value.toLowerCase().replace(/^weapon_/, "").replace(/[^a-z0-9]/g, "");
const ALIASES: Record<string, string> = {
  c4: "bomb", desert_eagle: "deagle", dualberettas: "elite", glock18: "glock", bayonet: "knife",
  m4a4: "m4a1", m4a1s: "m4a1silencer", hkp2000: "p2000", ppbizon: "bizon",
  r8revolver: "revolver", uspsilencer: "usps", taser: "zeusx27", worldspawn: "world",
};
const NORMALIZED_ALIASES = Object.fromEntries(Object.entries(ALIASES).map(([key, value]) => [normalize(key), value]));

export function isFirearm(name: string | null | undefined): boolean {
  if (!name) return false;
  const key = normalize(name);
  const weapon = NORMALIZED_ALIASES[key] ?? key;
  return weapon !== "knife" && weapon !== "bomb" && weapon !== "world" && weapon in WEAPONS;
}

export function isHeldUtility(name: string | null | undefined): boolean {
  return !!name && /smoke|flash|hegrenade|molotov|incendiary|decoy|^he$/.test(normalize(name));
}

export function isKnife(name: string | null | undefined): boolean {
  return !!name && /knife|bayonet|karambit|daggers|talon|stiletto|ursus|kukri/.test(normalize(name));
}

export function isReplayWeapon(name: string | null | undefined): boolean {
  return isFirearm(name) || isKnife(name);
}

export type UtilityKind = "smoke" | "flash" | "he" | "molotov" | "decoy";
const UTILITIES: Record<UtilityKind, Icon> = {
  smoke: SmokeGrenadeIcon, flash: FlashbangIcon, he: HeGrenadeIcon, molotov: MolotovIcon, decoy: DecoyIcon,
};

export function weaponIconFor(name: string | null | undefined): LazyIcon | Icon | null {
  if (!name) return null;
  const key = normalize(name);
  if (isKnife(name)) return WEAPONS.knife;
  if (key.includes("incendiary")) return IncendiaryGrenadeIcon;
  if (key.includes("molotov")) return MolotovIcon;
  if (key.includes("smoke")) return SmokeGrenadeIcon;
  if (key.includes("flash")) return FlashbangIcon;
  if (key.includes("hegrenade") || key === "he") return HeGrenadeIcon;
  if (key.includes("decoy")) return DecoyIcon;
  return WEAPONS[NORMALIZED_ALIASES[key] ?? key] ?? null;
}

export function WeaponIcon({ name, ...props }: { name: string | null | undefined } & Omit<Props, "name">) {
  const IconComponent = weaponIconFor(name);
  return IconComponent ? <Suspense fallback={null}><IconComponent aria-hidden="true" focusable="false" {...props} /></Suspense> : null;
}

export function UtilityIcon({ type, ...props }: { type: UtilityKind } & Props) {
  const IconComponent = UTILITIES[type];
  return <IconComponent aria-hidden="true" focusable="false" {...props} />;
}

export function EquipmentIcon({ kind, ...props }: { kind: "helmet" | "kevlar" | "defuser" | "bomb" } & Props) {
  const IconComponent = kind === "helmet" ? HelmetIcon : kind === "kevlar" ? KevlarIcon : kind === "defuser" ? DefuserIcon : BombIcon;
  return <IconComponent aria-hidden="true" focusable="false" {...props} />;
}
