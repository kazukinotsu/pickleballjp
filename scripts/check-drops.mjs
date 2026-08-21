#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Target DPCI ドロップ監視 — 「明日8時に落ちる」商品を公開データ側から検出する。
//
// 店舗の Line listing で拾った DPCI を、Target の公開商品API (Redsky) で追跡し、
//   ・street date (発売日) が今日/明日になった
//   ・最寄り店舗の在庫が 無 → 有 に変わった
//   ・オンラインで購入不可 → 可 に変わった
// のいずれかを検出したらメール本文を書き出す。GitHub Actions から定期実行する。
//
// 状態は state/drop-state.json に持ち越し、同じ事象で二重通知しない。
//
// 環境変数:
//   TARGET_REDSKY_KEY  … Redsky 公開キー(失効時に差し替え)
//   TARGET_STORE_ID    … 監視店舗ID(未指定なら watchlist.json の zip から解決)
//   ALERT_TZ           … 判定に使うタイムゾーン (既定 America/Los_Angeles)
//
// 出力:
//   out/subject.txt, out/email.html … 通知がある場合のみ
//   GITHUB_OUTPUT の alert=true/false, error=true/false
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const WATCHLIST = path.join(ROOT, "watchlist.json");
const STATE_FILE = path.join(ROOT, "state", "drop-state.json");
const OUT_DIR = path.join(ROOT, "out");

const KEY = process.env.TARGET_REDSKY_KEY || "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const BASE = "https://redsky.target.com/redsky_aggregations/v1/web";
const TZ = process.env.ALERT_TZ || "America/Los_Angeles";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// --- 小道具 -----------------------------------------------------------------

const digits = (s) => String(s || "").replace(/\D/g, "");
const gp = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);

// 監視タイムゾーンでの YYYY-MM-DD
function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

async function redsky(endpoint, params) {
  const qs = new URLSearchParams({ key: KEY, ...params }).toString();
  const res = await fetch(`${BASE}/${endpoint}?${qs}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.target.com",
      Referer: "https://www.target.com/",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Redsky HTTP ${res.status} (${endpoint})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Redsky non-JSON response (${endpoint})`);
  }
}

// --- Redsky 問い合わせ ------------------------------------------------------

async function nearestStore(zip) {
  const j = await redsky("nearby_stores_v1", {
    limit: "3", within: "100", place: zip, channel: "WEB",
  });
  const raw = gp(j, "data.nearby_stores.stores") || gp(j, "data.nearby_stores") || [];
  const list = (Array.isArray(raw) ? raw : []).map((s) => ({
    id: String(s.store_id || s.location_id || ""),
    name: s.location_name || s.store_name || null,
  })).filter((s) => s.id);
  return list[0] || null;
}

// DPCI から商品を引く。ハイフン有/無の両方を試す。
async function resolveByDpci(dpci, storeId) {
  for (const kw of [dpci, digits(dpci)]) {
    let j;
    try {
      j = await redsky("plp_search_v2", {
        keyword: kw, channel: "WEB", count: "8", offset: "0",
        page: `/s/${kw}`, platform: "desktop",
        pricing_store_id: storeId, store_ids: storeId,
        visitor_id: "018F6E2A9C3B0201B12CBDDE38A0AB4D",
      });
    } catch { continue; }
    const prods = gp(j, "data.search.products") || [];
    if (!Array.isArray(prods) || !prods.length) continue;
    // DPCI が一致するものを優先。無ければ先頭。
    const want = digits(dpci);
    const hit = prods.find((p) => digits(gp(p, "item.dpci")) === want) || prods[0];
    if (hit && (hit.tcin || gp(hit, "item.tcin"))) return hit;
  }
  return null;
}

async function pdp(tcin, storeId) {
  const j = await redsky("pdp_client_v1", {
    tcin, is_bot: "false", store_id: storeId, pricing_store_id: storeId,
    has_pricing_store_id: "true", channel: "WEB", page: `/p/A-${tcin}`,
  });
  return gp(j, "data.product") || null;
}

async function fulfillment(tcin, storeId, zip) {
  const j = await redsky("pdp_fulfillment_v1", {
    tcin, is_bot: "false", store_id: storeId, store_positions_store_id: storeId,
    has_store_positions_store_id: "true", zip, required_store_id: storeId,
    has_required_store_id: "true", channel: "WEB", page: `/p/A-${tcin}`,
  });
  return gp(j, "data.product.fulfillment") || null;
}

// --- 状態判定 ---------------------------------------------------------------

// 商品オブジェクトから、通知判定に使う状態を組み立てる
function readStatus(product, ful) {
  const item = product?.item || {};
  const price = product?.price || {};
  const tcin = product?.tcin || item.tcin || null;

  // street date は複数の場所に現れうるので広めに探す
  const streetDate =
    item.street_date || gp(item, "mmbv_content.street_date") ||
    product?.street_date || gp(product, "item.launch_date") || null;

  const priceText =
    price.formatted_current_price ||
    (price.current_retail != null ? `$${price.current_retail}` : null);

  // オンライン購入可否（値段が付き、販売停止でない）
  const eligibility = gp(item, "eligibility_rules") || {};
  const soldOut = !!gp(eligibility, "hold.is_active") ||
    String(gp(product, "item.relationship_type") || "").includes("UNAVAILABLE");
  const purchasable = !!priceText && !soldOut;

  // 最寄り店舗の在庫
  const sf = ful?.store_options?.[0];
  const storeStatus =
    gp(sf, "location_available_to_promise_quantity") != null
      ? (sf.location_available_to_promise_quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK")
      : (gp(sf, "order_pickup.availability_status") ||
         gp(sf, "in_store_only.availability_status") || null);
  const storeQty = gp(sf, "location_available_to_promise_quantity");
  const storeAvailable = storeStatus === "IN_STOCK";

  return {
    tcin,
    title: gp(item, "product_description.title") || null,
    dpci: item.dpci || null,
    price: priceText,
    streetDate,
    purchasable,
    storeAvailable,
    storeStatus,
    storeQty: storeQty == null ? null : Number(storeQty),
    url: tcin ? `https://www.target.com/p/-/A-${tcin}` : null,
  };
}

// 前回状態と比べて「通知すべき事象」を返す
function detectEvents(prev, now, today, tomorrow) {
  const events = [];
  const p = prev || {};

  if (now.streetDate === today && p.alertedStreet !== today) {
    events.push({ key: "street-today", label: "🔥 本日発売（street date = 今日）" });
  } else if (now.streetDate === tomorrow && p.alertedStreet !== tomorrow) {
    events.push({ key: "street-tomorrow", label: "🗓 明日発売（street date = 明日）" });
  }

  if (now.storeAvailable && !p.storeAvailable) {
    events.push({
      key: "store-in-stock",
      label: `🟢 近くの店舗で在庫化${now.storeQty != null ? `（残 ${now.storeQty}）` : ""}`,
    });
  }

  if (now.purchasable && p.purchasable === false) {
    events.push({ key: "purchasable", label: "🛒 オンライン購入が可能に" });
  }

  // 初回に既に発売間近なら知らせる（見逃し防止）
  if (!prev && (now.streetDate === today || now.streetDate === tomorrow) &&
      !events.some((e) => e.key.startsWith("street"))) {
    events.push({ key: "street-initial", label: `🗓 発売日 ${now.streetDate}` });
  }

  return events;
}

// --- メール本文 -------------------------------------------------------------

function buildEmail(hits, meta) {
  const rows = hits.map(({ item, status, events }) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e8ee;vertical-align:top">
        <div style="font-weight:700;font-size:15px">${esc(status.title || item.name || item.dpci)}</div>
        <div style="color:#6b7280;font-size:12px;margin-top:2px">
          DPCI ${esc(status.dpci || item.dpci)}${status.tcin ? ` ・ TCIN ${esc(status.tcin)}` : ""}${status.price ? ` ・ ${esc(status.price)}` : ""}
        </div>
        <div style="margin-top:6px">
          ${events.map((e) => `<span style="display:inline-block;background:#fdf2f8;color:#9d174d;border:1px solid #fbcfe8;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;margin:2px 4px 2px 0">${esc(e.label)}</span>`).join("")}
        </div>
        ${status.url ? `<div style="margin-top:8px"><a href="${esc(status.url)}" style="color:#0d9488;font-weight:700;font-size:13px">Target で見る →</a></div>` : ""}
      </td>
    </tr>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',Segoe UI,Roboto,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">
    <div style="background:#fff;border:1px solid #e6e8ee;border-radius:14px;overflow:hidden">
      <div style="padding:16px 18px;background:linear-gradient(135deg,#fce7f3,#ede9fe)">
        <div style="font-size:17px;font-weight:800;color:#1f2937">🧸 ドロップ検知 — ${hits.length}件</div>
        <div style="font-size:12px;color:#6b7280;margin-top:2px">
          監視店舗: ${esc(meta.storeName || meta.storeId)} ・ ${esc(meta.checkedAt)}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="padding:12px 18px;color:#9ca3af;font-size:11px;line-height:1.6">
        Target の公開商品API(Redsky)で street date・店舗在庫・購入可否の変化を検出しています。
        同じ事象は再通知しません。監視リストは watchlist.json で編集できます。
      </div>
    </div>
  </div></body></html>`;

  const subject = `🧸 ドロップ検知 ${hits.length}件 — ${hits.slice(0, 2).map((h) => h.status.title || h.item.name).join(" / ")}${hits.length > 2 ? " ほか" : ""}`;
  return { subject, html };
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// GitHub Issue 用の本文。Issue を立てると GitHub が通知メールを送ってくれるので、
// SMTP の秘密情報を一切登録せずにメール通知が成立する。
function buildIssueMarkdown(hits, meta) {
  const lines = [
    `**監視店舗**: ${meta.storeName || meta.storeId} (${meta.storeId})`,
    `**検知時刻**: ${meta.checkedAt}`,
    "",
    "| 商品 | 検知した変化 | DPCI / TCIN | 価格 |",
    "| --- | --- | --- | --- |",
  ];
  for (const { item, status, events } of hits) {
    const name = status.url
      ? `[${status.title || item.name || item.dpci}](${status.url})`
      : (status.title || item.name || item.dpci);
    lines.push(
      `| ${name} | ${events.map((e) => e.label).join("<br>")} | ${status.dpci || item.dpci}` +
      `${status.tcin ? ` / ${status.tcin}` : ""} | ${status.price || "—"} |`
    );
  }
  lines.push(
    "",
    "<sub>Target の公開商品API(Redsky)で street date・店舗在庫・購入可否の変化を検出しています。",
    "同じ事象は再通知しません。監視リストは `watchlist.json` で編集できます。</sub>"
  );
  return lines.join("\n");
}

function setOutput(k, v) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  console.log(`::set-var:: ${k}=${v}`);
}

// --- main -------------------------------------------------------------------

async function main() {
  const cfg = JSON.parse(fs.readFileSync(WATCHLIST, "utf8"));
  const state = fs.existsSync(STATE_FILE)
    ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8"))
    : { items: {} };
  state.items = state.items || {};

  const today = localDate(0);
  const tomorrow = localDate(1);

  // 監視店舗を決める（近くの Target だけを見る）
  let storeId = process.env.TARGET_STORE_ID || cfg.storeId || "";
  let storeName = state.storeName || null;
  if (!storeId) {
    const s = await nearestStore(cfg.zip);
    if (!s) throw new Error(`ZIP ${cfg.zip} の近くに Target が見つかりません`);
    storeId = s.id; storeName = s.name;
  }
  state.storeId = storeId;
  if (storeName) state.storeName = storeName;

  const hits = [];
  const failures = [];

  for (const item of cfg.items) {
    const key = digits(item.dpci);
    const prev = state.items[key] || null;
    try {
      // 既に TCIN 解決済みならそれを使い、無ければ DPCI 検索
      let tcin = prev?.tcin || null;
      let product = null;
      if (tcin) {
        product = await pdp(tcin, storeId).catch(() => null);
      }
      if (!product) {
        const found = await resolveByDpci(item.dpci, storeId);
        if (found) {
          tcin = found.tcin || gp(found, "item.tcin");
          product = await pdp(tcin, storeId).catch(() => found);
        }
      }
      if (!product) {
        // まだ Target 側に出ていない＝これから登録される可能性がある
        state.items[key] = { ...(prev || {}), dpci: item.dpci, name: item.name, notFound: true, checkedAt: new Date().toISOString() };
        continue;
      }

      const ful = tcin ? await fulfillment(tcin, storeId, cfg.zip).catch(() => null) : null;
      const status = readStatus(product, ful);
      const events = detectEvents(prev, status, today, tomorrow);

      if (events.length) hits.push({ item, status, events });

      state.items[key] = {
        dpci: item.dpci,
        name: item.name,
        tcin: status.tcin,
        title: status.title,
        price: status.price,
        streetDate: status.streetDate,
        purchasable: status.purchasable,
        storeAvailable: status.storeAvailable,
        storeStatus: status.storeStatus,
        storeQty: status.storeQty,
        alertedStreet: events.some((e) => e.key.startsWith("street"))
          ? status.streetDate
          : prev?.alertedStreet || null,
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      failures.push(`${item.dpci}: ${e.message}`);
    }
  }

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

  const allFailed = failures.length === cfg.items.length && cfg.items.length > 0;
  const summary = [
    `店舗: ${storeName || storeId} (${storeId})`,
    `判定日: ${today} (明日=${tomorrow}, TZ=${TZ})`,
    `検知: ${hits.length}件 / 失敗: ${failures.length}件`,
    ...failures.slice(0, 5).map((f) => `  ⚠ ${f}`),
  ].join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + summary + "\n```\n");
  }

  if (hits.length) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const { subject, html } = buildEmail(hits, {
      storeId, storeName, checkedAt: new Date().toLocaleString("ja-JP", { timeZone: TZ }),
    });
    fs.writeFileSync(path.join(OUT_DIR, "subject.txt"), subject);
    fs.writeFileSync(path.join(OUT_DIR, "email.html"), html);
    fs.writeFileSync(path.join(OUT_DIR, "issue.md"), buildIssueMarkdown(hits, {
      storeId, storeName, checkedAt: new Date().toLocaleString("ja-JP", { timeZone: TZ }),
    }));
  }

  setOutput("alert", hits.length ? "true" : "false");
  setOutput("error", allFailed ? "true" : "false");
  setOutput("count", String(hits.length));

  // Redsky が全滅している場合だけ、非ゼロで終わらせず可視化に留める
  if (allFailed) console.error("‼ 全DPCIで取得失敗。Redsky キー失効か bot ブロックの可能性。");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  setOutput("alert", "false");
  setOutput("error", "true");
  process.exitCode = 0; // ワークフローは落とさず、状態だけ知らせる
});
