import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

export const config = { path: "/api" };

const DAYS = 7;
const OPTS = {
  mood: ["Sangat buruk", "Buruk", "Biasa saja", "Baik", "Sangat baik"],
  ease: ["Sangat sulit", "Sulit", "Cukup mudah", "Mudah", "Sangat mudah"],
  wakeCount: ["Tidak pernah", "1 kali", "2 kali", "3 kali atau lebih"],
  wakeFeel: ["Sangat lelah dan masih mengantuk", "Lelah dan masih mengantuk", "Cukup segar", "Segar", "Sangat segar"],
  quality: ["Sangat buruk", "Buruk", "Cukup baik", "Baik", "Sangat baik"],
  barrier: ["Tidak mengalami kesulitan tidur", "Sulit memulai tidur", "Terbangun beberapa kali saat tidur", "Sulit tidur kembali setelah terbangun", "Bangun terlalu pagi dan sulit tidur kembali", "Lainnya"],
};
const GENDERS = ["Perempuan", "Laki-laki", "Memilih tidak menjawab"];
const UID_RE = /^[a-f0-9]{32}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_PHOTO = 900_000; // karakter data-URL

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const isDate = (s) => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z"));
const addDays = (s, n) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const minsBetween = (a, b) => {
  const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number);
  return (h2 * 60 + m2 - (h1 * 60 + m1) + 1440) % 1440;
};

function isAdmin(key) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || typeof key !== "string") return false;
  const a = Buffer.from(key), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanEntry(raw, startDate, hasPhoto) {
  if (!raw || typeof raw !== "object") return null;
  if (!isDate(raw.date)) return null;
  const idx = Array.from({ length: DAYS }, (_, i) => addDays(startDate, i)).indexOf(raw.date);
  if (idx < 0) return null; // di luar periode 7 hari
  for (const k of ["mood", "ease", "wakeCount", "wakeFeel", "quality", "barrier"]) {
    if (!OPTS[k].includes(raw[k])) return null;
  }
  if (!TIME_RE.test(raw.sleepTime) || !TIME_RE.test(raw.wakeTime)) return null;
  const am = Number(raw.activityMinutes);
  if (!Number.isFinite(am) || am < 0 || am > 1440) return null;
  return {
    date: raw.date,
    mood: raw.mood,
    sleepTime: raw.sleepTime,
    wakeTime: raw.wakeTime,
    sleepMinutes: minsBetween(raw.sleepTime, raw.wakeTime),
    ease: raw.ease,
    wakeCount: raw.wakeCount,
    wakeFeel: raw.wakeFeel,
    quality: raw.quality,
    barrier: raw.barrier,
    barrierOther: raw.barrier === "Lainnya" ? str(raw.barrierOther, 300) : "",
    activityType: str(raw.activityType, 200),
    activityMinutes: Math.round(am),
    hasPhoto: !!hasPhoto,
    savedAt: new Date().toISOString(),
  };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad-json" }, 400);
  }
  const { action } = body || {};
  const store = getStore({ name: "sleepmate", consistency: "strong" });

  // ---------- admin ----------
  if (action === "adminList" || action === "adminPhoto" || action === "adminDelete") {
    if (!isAdmin(body.adminKey)) return json({ error: "unauthorized" }, 401);
    if (action === "adminDelete") {
      if (!UID_RE.test(body.target || "")) return json({ error: "bad-request" }, 400);
      const { blobs: photos } = await store.list({ prefix: `photo/${body.target}/` });
      await Promise.all(photos.map((p) => store.delete(p.key)));
      await store.delete(`resp/${body.target}`);
      return json({ ok: true, photosDeleted: photos.length });
    }
    if (action === "adminList") {
      const { blobs } = await store.list({ prefix: "resp/" });
      const rows = (
        await Promise.all(
          blobs.map(async (b) => {
            const d = await store.get(b.key, { type: "json" });
            return d ? { uid: b.key.slice(5), ...d } : null;
          })
        )
      ).filter(Boolean);
      return json({ rows });
    }
    if (!UID_RE.test(body.target || "") || !isDate(body.date)) return json({ error: "bad-request" }, 400);
    const data = await store.get(`photo/${body.target}/${body.date}`);
    return json({ data: data || null });
  }

  // ---------- siswa ----------
  const uid = body.uid;
  if (!UID_RE.test(uid || "")) return json({ error: "bad-uid" }, 400);
  const key = `resp/${uid}`;
  const cur = await store.get(key, { type: "json" });

  if (action === "get") return json({ data: cur || null });

  if (action === "profile") {
    const name = str(body.name, 100);
    if (!name || !GENDERS.includes(body.gender)) return json({ error: "bad-profile" }, 400);
    let doc;
    if (cur) {
      doc = { ...cur, name, gender: body.gender };
    } else {
      const startDate = isDate(body.startDate) ? body.startDate : new Date().toISOString().slice(0, 10);
      doc = { name, gender: body.gender, startDate, days: {}, createdAt: new Date().toISOString() };
    }
    await store.setJSON(key, doc);
    return json({ data: doc });
  }

  if (action === "saveDay") {
    if (!cur) return json({ error: "no-profile" }, 400);
    const photo = typeof body.photo === "string" ? body.photo : null;
    if (photo && (!photo.startsWith("data:image/jpeg;base64,") || photo.length > MAX_PHOTO)) {
      return json({ error: "bad-photo" }, 400);
    }
    const had = !!cur.days?.[body.entry?.date]?.hasPhoto;
    const entry = cleanEntry(body.entry, cur.startDate, photo ? true : had && body.entry?.hasPhoto !== false);
    if (!entry) return json({ error: "bad-entry" }, 400);
    if (photo) await store.set(`photo/${uid}/${entry.date}`, photo);
    const doc = { ...cur, days: { ...(cur.days || {}), [entry.date]: entry } };
    await store.setJSON(key, doc);
    return json({ data: doc });
  }

  if (action === "photo") {
    if (!isDate(body.date)) return json({ error: "bad-request" }, 400);
    const data = await store.get(`photo/${uid}/${body.date}`);
    return json({ data: data || null });
  }

  return json({ error: "unknown-action" }, 400);
};
