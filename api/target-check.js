// Vercel Serverless Function — Target (Redsky) SKU monitor
// -----------------------------------------------------------------------------
// ドロップ予測ツールの「事前検知」エンジン。
// Target.com が内部で使う公開 JSON API "Redsky" を **サーバー側から** 叩く。
// ブラウザから直接叩くと CORS で弾かれるため、この関数が中継する。
//
// 使い方 (フロントの drops.html が呼ぶ):
//   GET /api/target-check?mode=stores&zip=94022  … ZIPから最寄り Target 店舗を解決
//   GET /api/target-check?tcin=12345678&zip=94022 … 特定商品の発売状況(店舗基準)
//   GET /api/target-check?keyword=squeezy+toy&zip=94022&count=24
//                                            … キーワード検索で「今 Target に
//                                              登録されている商品」を一覧取得。
//                                              カレンダー未登録の新SKU＝未告知
//                                              ドロップの早期検知に使う。
//
// なぜこれが「事前に分かる」のか:
//   小売の商品DBには、一般販売が始まる前に SKU(TCIN)と street_date(発売日)が
//   登録される。Redsky はその情報を露出するため、棚に並ぶ前／購入可能になる前に
//   検知できる。ZIP を渡すと最寄り店舗基準の価格・在庫で判定する。
//
// APIキーについて:
//   key は target.com のフロントに埋め込まれた公開キー。定期的にローテーション
//   されるため、Vercel の環境変数 TARGET_REDSKY_KEY で上書き可能にしてある。
// -----------------------------------------------------------------------------

const REDSKY = "https://redsky.target.com/redsky_aggregations/v1/web";
const DEFAULT_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const DEFAULT_STORE = "3991";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// スキーマ変更に強くするため、興味のあるキーを再帰的に探索する。
const INTEREST = /(street_date|launch_date|release_date|street|available_to_promise|preorder|pre_order|purchase_limit|is_available|out_of_stock|onhand|coming_soon|availability_status)/i;

function deepFind(obj, out, depth) {
  if (depth > 8 || obj == null || typeof obj !== "object") return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (INTEREST.test(k) && (v == null || typeof v !== "object")) out[k] = v;
    if (v && typeof v === "object") deepFind(v, out, depth + 1);
  }
  return out;
}
function pick(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function redsky(endpoint, params) {
  const key = process.env.TARGET_REDSKY_KEY || DEFAULT_KEY;
  const qs = new URLSearchParams({ key, ...params }).toString();
  const r = await fetch(`${REDSKY}/${endpoint}?${qs}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      Origin: "https://www.target.com",
      Referer: "https://www.target.com/",
    },
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: r.ok, status: r.status, json };
}

// ZIP → 最寄り店舗のリストを解決
async function nearbyStores(zip) {
  const r = await redsky("nearby_stores_v1", {
    limit: "6",
    within: "100",
    place: zip,
    nearby: zip,
    channel: "WEB",
    membership_experience_enabled: "true",
  });
  const raw =
    pick(r.json, "data.nearby_stores.stores") ||
    pick(r.json, "data.nearby_stores") ||
    [];
  const stores = (Array.isArray(raw) ? raw : []).map((s) => ({
    id: String(s.store_id || s.location_id || ""),
    name: s.location_name || s.store_name || null,
    city: pick(s, "mailing_address.city") || null,
    state: pick(s, "mailing_address.region") || pick(s, "mailing_address.state") || null,
    distance: s.distance != null ? Math.round(s.distance) : null,
  })).filter((s) => s.id);
  return stores;
}

async function resolveStore(zip) {
  if (!zip) return { id: DEFAULT_STORE, name: null };
  try {
    const list = await nearbyStores(zip);
    if (list.length) return list[0];
  } catch (_) {}
  return { id: DEFAULT_STORE, name: null };
}

function normalizeProduct(product) {
  if (!product) return null;
  const item = product.item || {};
  const price = product.price || {};
  const signals = deepFind(product, {}, 0);
  return {
    tcin: product.tcin || item.tcin || null,
    title: pick(item, "product_description.title") || null,
    price:
      price.formatted_current_price ||
      (price.current_retail != null ? `$${price.current_retail}` : null),
    image:
      pick(item, "enrichment.images.primary_image_url") ||
      (Array.isArray(pick(item, "enrichment.images.alternate_image_urls"))
        ? item.enrichment.images.alternate_image_urls[0] : null),
    buyUrl:
      pick(item, "enrichment.buy_url") ||
      (product.tcin ? `https://www.target.com/p/-/A-${product.tcin}` : null),
    streetDate: signals.street_date || signals.launch_date || signals.release_date || null,
    signals,
  };
}
function normalizeSearchItem(p) {
  const item = p.item || {};
  const price = p.price || {};
  const signals = deepFind(p, {}, 0);
  return {
    tcin: p.tcin || item.tcin || null,
    title: pick(item, "product_description.title") || null,
    price:
      price.formatted_current_price ||
      (price.current_retail != null ? `$${price.current_retail}` : null),
    image:
      pick(item, "enrichment.images.primary_image_url") ||
      pick(p, "primary_image_url") || null,
    buyUrl:
      pick(item, "enrichment.buy_url") ||
      (p.tcin ? `https://www.target.com/p/-/A-${p.tcin}` : null),
    streetDate: signals.street_date || signals.launch_date || signals.release_date || null,
    signals,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = req.query || {};
  const mode = (q.mode || "").toString().trim();
  const tcin = (q.tcin || "").toString().trim();
  const keyword = (q.keyword || "").toString().trim();
  const zip = (q.zip || "").toString().trim();
  const count = Math.min(parseInt(q.count, 10) || 24, 48);

  try {
    // --- 店舗解決モード: ZIP → 最寄り店舗 ---
    if (mode === "stores" || (zip && !tcin && !keyword)) {
      const stores = await nearbyStores(zip);
      if (!stores.length) {
        return res.status(200).json({ mode: "stores", zip, stores: [], hint: "この ZIP では店舗が見つかりませんでした。" });
      }
      return res.status(200).json({ mode: "stores", zip, stores, checkedAt: new Date().toISOString() });
    }

    // 以降は ZIP があれば最寄り店舗を採用
    const store = await resolveStore(zip);
    const storeId = store.id || DEFAULT_STORE;

    // --- 単品モード: TCIN 指定 ---
    if (tcin) {
      const r = await redsky("pdp_client_v1", {
        tcin, is_bot: "false",
        store_id: storeId, pricing_store_id: storeId, has_pricing_store_id: "true",
        channel: "WEB", page: `/p/A-${tcin}`,
      });
      if (!r.json) {
        return res.status(502).json({ error: "redsky_unavailable", status: r.status,
          hint: "Redsky が JSON を返しませんでした。公開キー失効の可能性。Vercel の TARGET_REDSKY_KEY を更新してください。" });
      }
      return res.status(200).json({
        mode: "tcin", tcin, store,
        product: normalizeProduct(pick(r.json, "data.product")),
        checkedAt: new Date().toISOString(),
      });
    }

    // --- 検索モード: キーワードで現在のSKU一覧（未告知ドロップの早期検知）---
    if (keyword) {
      const r = await redsky("plp_search_v2", {
        keyword, channel: "WEB", count: String(count), offset: "0",
        page: `/s/${keyword}`, platform: "desktop",
        pricing_store_id: storeId, store_ids: storeId,
        visitor_id: "0000000000000000000000000000AAAA", zip,
      });
      if (!r.json) {
        return res.status(502).json({ error: "redsky_unavailable", status: r.status,
          hint: "Redsky が JSON を返しませんでした。公開キー失効か bot 対策の可能性。TARGET_REDSKY_KEY を更新するか時間を置いて再試行してください。" });
      }
      const products =
        pick(r.json, "data.search.products") ||
        pick(r.json, "data.search.search_response.items.Item") || [];
      const items = (Array.isArray(products) ? products : [])
        .map(normalizeSearchItem).filter((x) => x.tcin);
      return res.status(200).json({
        mode: "keyword", keyword, store, count: items.length, items,
        checkedAt: new Date().toISOString(),
      });
    }

    return res.status(400).json({ error: "missing_param", hint: "?mode=stores&zip=… / ?tcin=… / ?keyword=… を指定してください。" });
  } catch (e) {
    return res.status(500).json({ error: "fetch_failed", message: String((e && e.message) || e) });
  }
};
