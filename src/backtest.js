// Перевірка сигналів на історії (бектест): що відбувалося з ціною через 1/7/30 днів після кожного сигналу,
// порівняно зі «звичайним днем» тієї ж монети. Лише публічні дані, без ключів і без торгівлі.
// Чесність: вибірка «навчання» до SPLIT, перевірка — після; повтори сигналу ближче 5 днів відкидаються;
// сигнал на закритті дня i, вхід за ціною закриття i (не раніше, ніж сигнал відомий).
const fs = require("fs");
const path = require("path");
const IND = require("./engine.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "backtest");
fs.mkdirSync(OUT, { recursive: true });
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const SPLIT = Date.UTC(2024, 0, 1);              // до — «навчання», після — «перевірка»
const LAST365 = Date.now() - 365 * 864e5;
const H = [1, 7, 30];                            // горизонти, днів
const MIN_N = 30;                                // мінімум випадків для висновку

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "crypto-indicators-bot" } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}
async function history(sym) {
  const out = []; let start = Date.UTC(2017, 0, 1);
  for (let k = 0; k < 15; k++) {
    const rows = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=1000&startTime=${start}`);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < 1000) break;
    start = rows[rows.length - 1][0] + 864e5;
    await new Promise(r => setTimeout(r, 300));
  }
  out.pop(); // остання свічка формується
  return { t: out.map(x => x[0]), o: out.map(x => +x[1]), h: out.map(x => +x[2]), l: out.map(x => +x[3]), c: out.map(x => +x[4]), v: out.map(x => +x[7]) };
}

// Сигнали: [ключ, назва українською, очікуваний напрям (+1 ріст, -1 падіння, 0 — волатильність), умова(i)]
function signals(R, d) {
  const c = d.c, X = (a, b, i) => a[i - 1] <= b[i - 1] && a[i] > b[i], Xd = (a, b, i) => a[i - 1] >= b[i - 1] && a[i] < b[i];
  const k = (arr, v) => arr.map(() => v);
  const v30 = k(c, 30), v70 = k(c, 70), v08 = k(c, 0.8), v24 = k(c, 2.4), v25 = k(c, 25), z0 = k(c, 0);
  const pct = (arr, i, w) => { const s = arr.slice(Math.max(0, i - w + 1), i + 1).filter(isFinite); return s.filter(x => x <= arr[i]).length / s.length; };
  const hMed = R.hurst.map((_, i) => { const s = R.hurst.slice(Math.max(0, i - 364), i + 1).filter(isFinite).sort((a, b) => a - b); return s.length > 100 ? s[Math.floor(s.length / 2)] : NaN; });
  return [
    ["rsi_exit_oversold", "RSI виходить вгору з перепроданості (<30)", +1, i => X(R.rsi, v30, i)],
    ["rsi_enter_oversold", "RSI входить у перепроданість (<30)", +1, i => Xd(R.rsi, v30, i)],
    ["rsi_exit_overbought", "RSI виходить униз з перекупленості (>70)", -1, i => Xd(R.rsi, v70, i)],
    ["rsi_enter_overbought", "RSI входить у перекупленість (>70)", -1, i => X(R.rsi, v70, i)],
    ["macd_up", "MACD: гістограма стає «+»", +1, i => X(R.macdHist, z0, i)],
    ["macd_down", "MACD: гістограма стає «−»", -1, i => Xd(R.macdHist, z0, i)],
    ["sma200_up", "Ціна перетинає SMA200 вгору", +1, i => X(c, R.sma200, i)],
    ["sma200_down", "Ціна перетинає SMA200 вниз", -1, i => Xd(c, R.sma200, i)],
    ["golden_cross", "Золотий хрест SMA50 > SMA200", +1, i => X(R.sma50, R.sma200, i)],
    ["death_cross", "Хрест смерті SMA50 < SMA200", -1, i => Xd(R.sma50, R.sma200, i)],
    ["mayer_below_08", "Mayer опускається нижче 0,8", +1, i => Xd(R.mayer, v08, i)],
    ["mayer_above_08", "Mayer піднімається вище 0,8", +1, i => X(R.mayer, v08, i)],
    ["mayer_above_24", "Mayer піднімається вище 2,4", -1, i => X(R.mayer, v24, i)],
    ["supertrend_long", "Supertrend перемикається в лонг", +1, i => R.stDir[i - 1] < 0 && R.stDir[i] > 0],
    ["supertrend_short", "Supertrend перемикається в шорт", -1, i => R.stDir[i - 1] > 0 && R.stDir[i] < 0],
    ["supertrend_long_hurst", "Supertrend у лонг + Херст вище річної медіани", +1, i => R.stDir[i - 1] < 0 && R.stDir[i] > 0 && R.hurst[i] > hMed[i]],
    ["supertrend_long_nohurst", "Supertrend у лонг + Херст нижче медіани", +1, i => R.stDir[i - 1] < 0 && R.stDir[i] > 0 && R.hurst[i] <= hMed[i]],
    ["donchian_up", "Пробій 20-денного максимуму", +1, i => c[i] > R.donHi[i - 1] && c[i - 1] <= R.donHi[i - 2]],
    ["donchian_down", "Пробій 20-денного мінімуму", -1, i => c[i] < R.donLo[i - 1] && c[i - 1] >= R.donLo[i - 2]],
    ["adx_trend_up", "ADX > 25, DI+ > DI− (початок висхідного тренду)", +1, i => X(R.adx, v25, i) && R.diP[i] > R.diN[i]],
    ["adx_trend_down", "ADX > 25, DI− > DI+ (початок низхідного тренду)", -1, i => X(R.adx, v25, i) && R.diN[i] > R.diP[i]],
    ["ichimoku_above", "Ціна виходить над хмару Ішимоку", +1, i => c[i - 1] <= Math.max(R.spanA[i - 1], R.spanB[i - 1]) && c[i] > Math.max(R.spanA[i], R.spanB[i])],
    ["ichimoku_below", "Ціна виходить під хмару Ішимоку", -1, i => c[i - 1] >= Math.min(R.spanA[i - 1], R.spanB[i - 1]) && c[i] < Math.min(R.spanA[i], R.spanB[i])],
    ["bb_squeeze", "Стиснення Боллінджера (ширина ≤ 10-го процентиля 90 д)", 0, i => pct(R.bbWidth, i, 90) <= 0.1 && pct(R.bbWidth, i - 1, 90) > 0.1],
    ["ttm_squeeze", "TTM-стиснення (Bollinger усередині Keltner)", 0, i => R.squeeze[i] && !R.squeeze[i - 1]],
    ["tsmom_p3", "Імпульс 1/4/12 тижнів: усі три «+» (бал +3)", +1, i => R.tsmom[i] === 3 && R.tsmom[i - 1] < 3],
    ["tsmom_m3", "Імпульс 1/4/12 тижнів: усі три «−» (бал −3)", -1, i => R.tsmom[i] === -3 && R.tsmom[i - 1] > -3],
    ["z_below_m2", "Z-score < −2 (ціна далеко під SMA20)", +1, i => R.z20[i] < -2 && R.z20[i - 1] >= -2],
    ["z_above_p2", "Z-score > +2 (ціна далеко над SMA20)", -1, i => R.z20[i] > 2 && R.z20[i - 1] <= 2],
    ["cmf_pos", "CMF стає > +0,05 (приплив)", +1, i => R.cmf[i] > 0.05 && R.cmf[i - 1] <= 0.05],
    ["cmf_neg", "CMF стає < −0,05 (відплив)", -1, i => R.cmf[i] < -0.05 && R.cmf[i - 1] >= -0.05],
  ];
}

// Накопичувачі: на кожен (сигнал, період) — суми для різниці зі «звичайним днем» тієї ж монети в тому ж періоді
const acc = {};
const bucket = (key, per) => (acc[key] ??= {})[per] ??= { n: 0, assets: new Set(), h: Object.fromEntries(H.map(x => [x, { sum: 0, sum2: 0, hit: 0, ex: 0, exAbs: 0 }])) };
const periodOf = t => [t < SPLIT ? "train" : "test", ...(t >= LAST365 ? ["last365"] : [])];

(async () => {
  const meta = { generated_utc: new Date().toISOString(), split: "2024-01-01", horizons: H, min_n: MIN_N, assets: {}, errors: [] };
  let SIG = null;
  for (const sym of CFG.assets) {
    try {
      const d = await history(sym);
      if (d.c.length < 300) { meta.errors.push(`${sym}: мало історії (${d.c.length})`); continue; }
      const R = IND.all(d); const N = d.c.length;
      const sigs = signals(R, d); SIG ??= sigs.map(s => s.slice(0, 3));
      const fwd = Object.fromEntries(H.map(hz => [hz, d.c.map((x, i) => (i + hz < N ? d.c[i + hz] / x - 1 : NaN))]));
      // «звичайний день»: середнє і частка росту по всіх днях монети в періоді (від 200-го дня, коли є всі індикатори)
      const base = {};
      for (let i = 200; i < N; i++) for (const per of periodOf(d.t[i])) for (const hz of H) {
        const f = fwd[hz][i]; if (!isFinite(f)) continue;
        const b = ((base[per] ??= {})[hz] ??= { s: 0, a: 0, up: 0, n: 0 }); b.s += f; b.a += Math.abs(f); b.up += f > 0; b.n++;
      }
      meta.assets[sym] = { days: N, from: new Date(d.t[0]).toISOString().slice(0, 10) };
      for (const [key, , dir, cond] of sigs) {
        let last = -99;
        for (let i = 201; i < N; i++) {
          let ok = false; try { ok = cond(i); } catch { ok = false; }
          if (!ok) continue;
          if (i - last < 5) continue; last = i;               // повтор ближче 5 днів — не новий випадок
          for (const per of periodOf(d.t[i])) {
            const B = bucket(key, per); B.n++; B.assets.add(sym);
            for (const hz of H) {
              const f = fwd[hz][i]; if (!isFinite(f)) continue;
              const bs = base[per]?.[hz]; if (!bs?.n) continue;
              const ex = f - bs.s / bs.n;                       // надлишок над звичайним днем цієї монети
              const x = B.h[hz]; x.sum += f; x.sum2 += ex * ex; x.ex += ex; x.exAbs += Math.abs(f) - bs.a / bs.n; x.cnt = (x.cnt || 0) + 1;
              x.hit += dir === 0 ? 0 : (Math.sign(f) === dir ? 1 : 0); x.baseHit = (x.baseHit || 0) + (dir > 0 ? bs.up / bs.n : dir < 0 ? 1 - bs.up / bs.n : 0);
            }
          }
        }
      }
    } catch (e) { meta.errors.push(`${sym}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 500));
  }
  // Підсумок
  const rows = [];
  for (const [key, name, dir] of SIG || []) for (const per of ["train", "test", "last365"]) {
    const B = acc[key]?.[per]; if (!B) continue;
    const r = { key, name, dir, period: per, n: B.n, assets: B.assets.size };
    for (const hz of H) {
      const x = B.h[hz]; const n = x.cnt || 0; if (!n) continue;
      const mEx = x.ex / n, sd = Math.sqrt(Math.max(x.sum2 / n - mEx * mEx, 0));
      r[`h${hz}`] = {
        n, mean: +(x.sum / n * 100).toFixed(2), excess: +(mEx * 100).toFixed(2), t: +(sd > 0 ? mEx / (sd / Math.sqrt(n)) : 0).toFixed(2),
        hit: dir ? +(x.hit / n * 100).toFixed(1) : null, base_hit: dir ? +(x.baseHit / n * 100).toFixed(1) : null,
        vol_excess: dir === 0 ? +(x.exAbs / n * 100).toFixed(2) : null,
      };
    }
    rows.push(r);
  }
  // Вердикт за 7 днями: «працює» — якщо і на навчанні, і на перевірці перевага в очікуваному напрямі, n ≥ MIN_N і |t| ≥ 2 на перевірці
  const get = (k, p) => rows.find(r => r.key === k && r.period === p);
  const verdicts = (SIG || []).map(([key, name, dir]) => {
    const tr = get(key, "train")?.h7, te = get(key, "test")?.h7, l1 = get(key, "last365")?.h7;
    let v = "мало даних";
    if (tr && te && te.n >= MIN_N) {
      if (dir === 0) v = te.vol_excess > 0 && tr.vol_excess > 0 ? "працює (рух після сигналу більший)" : "не підтверджено";
      else {
        const good = s => s && Math.sign(s.excess) === dir;
        v = good(tr) && good(te) && Math.abs(te.t) >= 2 ? "працює" : good(tr) && good(te) ? "слабко (в потрібний бік, але статистично не значуще)" : good(te) ? "лише на перевірці (нестабільно)" : "не працює / протилежно";
      }
    }
    return { key, name, dir, verdict: v, train7: tr || null, test7: te || null, last365_7: l1 || null };
  });
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ meta, verdicts, rows }, null, 1));
  // Markdown-звіт
  const f = x => (x == null ? "—" : String(x).replace(".", ","));
  const dirTxt = d => (d > 0 ? "↑" : d < 0 ? "↓" : "±");
  let md = `# Перевірка сигналів на історії\n\nЗгенеровано ${meta.generated_utc.slice(0, 16).replace("T", " ")} UTC. Дані: Binance, денні свічки, ${Object.keys(meta.assets).length} монет. Навчання — до ${meta.split}, перевірка — після. Горизонт вердикту — 7 днів. Повтори сигналу ближче 5 днів відкинуто.\n\n`;
  md += `**Як читати.** «Надлишок» — середня зміна ціни за 7 днів після сигналу мінус звичайна зміна за 7 днів для тієї ж монети в тому ж періоді (п.п.). «Влучання» — частка випадків, коли ціна пішла в очікуваний бік; поруч — те саме для звичайного дня. t ≥ 2 — різниця навряд чи випадкова (випадки однієї монети перекриваються в часі, тож t завищене — вимога суворіша, ніж виглядає). Стан ринку, не прогноз і не порада.\n\n`;
  md += `| Сигнал | Бік | Вердикт | Перевірка: n | Надлишок 7 д, п.п. | t | Влучання / звичайний, % | Навчання: надлишок | Останні 365 д: надлишок |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const v of verdicts) md += `| ${v.name} | ${dirTxt(v.dir)} | ${v.verdict} | ${f(v.test7?.n)} | ${f(v.dir === 0 ? v.test7?.vol_excess : v.test7?.excess)} | ${f(v.test7?.t)} | ${v.dir ? `${f(v.test7?.hit)} / ${f(v.test7?.base_hit)}` : "—"} | ${f(v.dir === 0 ? v.train7?.vol_excess : v.train7?.excess)} | ${f(v.dir === 0 ? v.last365_7?.vol_excess : v.last365_7?.excess)} |\n`;
  md += `\nДля сигналів волатильності (±) «надлишок» — наскільки модуль руху за 7 днів більший, ніж звичайно.\n\nПомилки: ${meta.errors.length ? meta.errors.join("; ") : "немає"}.\n`;
  fs.writeFileSync(path.join(OUT, "report.md"), md);
  console.log(`assets: ${Object.keys(meta.assets).length}; signals: ${verdicts.length}; errors: ${meta.errors.length}`);
  console.log(verdicts.map(v => `${v.key}: ${v.verdict} (test n=${v.test7?.n ?? 0}, ex=${v.test7?.excess ?? v.test7?.vol_excess ?? "—"}, t=${v.test7?.t ?? "—"})`).join("\n"));
})();
