// Перевірка індексу страху та жадібності (alternative.me, з 2018-02) на історії.
// 1) Зміна ціни через 7 і 30 днів після днів у кожній зоні проти звичайного дня тієї ж монети (навчання до 2024-01-01 / перевірка після).
// 2) Контрарні сигнали: вхід у «сильний страх» (≤ 20) і в «сильну жадібність» (≥ 80).
// 3) Індекс як фільтр для денної стратегії (strategy.js): результат угод (R) залежно від зони в день входу.
// Результат: backtest/fng.json, backtest/fng.md. Лише публічні дані.
const fs = require("fs");
const path = require("path");
const IND = require("./engine.js");
const S = require("../docs/js/strategy.js");
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "backtest"); fs.mkdirSync(OUT, { recursive: true });
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const SPLIT = Date.UTC(2024, 0, 1), DAY = 864e5;
const ZONES = [["сильний страх (0–24)", 0, 24], ["страх (25–44)", 25, 44], ["нейтрально (45–55)", 45, 55], ["жадібність (56–75)", 56, 75], ["сильна жадібність (76–100)", 76, 100]];
const zoneOf = v => ZONES.findIndex(([, a, b]) => v >= a && v <= b);

async function daily(sym) {
  const all = { t: [], o: [], h: [], l: [], c: [], v: [] }; let st = Date.UTC(2017, 0, 1);
  for (let p = 0; p < 6; p++) {
    const k = await (await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=1000&startTime=${st}`)).json();
    if (!Array.isArray(k) || !k.length) break;
    for (const x of k) { all.t.push(x[0]); all.o.push(+x[1]); all.h.push(+x[2]); all.l.push(+x[3]); all.c.push(+x[4]); all.v.push(+x[7]); }
    if (k.length < 1000) break; st = k[k.length - 1][0] + DAY;
  }
  for (const key in all) all[key].pop();
  return all;
}
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
function summ(ex, hits, base) { // ex — надлишки у п.п.; hits — 1/0 ріст; base — частка росту звичайного дня
  if (ex.length < 5) return { n: ex.length };
  return { n: ex.length, excess: +mean(ex).toFixed(2), t: +(mean(ex) / (sd(ex) / Math.sqrt(ex.length))).toFixed(2), up: +(mean(hits) * 100).toFixed(1), base_up: +(base * 100).toFixed(1) };
}

(async () => {
  const j = await (await fetch("https://api.alternative.me/fng/?limit=0&format=json")).json();
  const F = new Map(j.data.map(x => [Math.floor(+x.timestamp * 1000 / DAY) * DAY, +x.value]));
  const res = { generated_utc: new Date().toISOString(), fng_days: F.size, fng_from: new Date(Math.min(...F.keys())).toISOString().slice(0, 10), split: "2024-01-01", zones: {}, signals: {}, filter: {}, coins: [], errors: [] };
  const H = [7, 30];
  // накопичувачі: [група][період][горизонт] → {ex:[], hit:[], base:[]}
  const acc = {}; const put = (g, per, h, ex, hit, base) => { const k = `${g}|${per}|${h}`; (acc[k] ||= { ex: [], hit: [], base: [] }); acc[k].ex.push(ex); acc[k].hit.push(hit); acc[k].base.push(base); };
  const trades = [];
  for (const sym of CFG.assets.map(x => (typeof x === "string" ? x : x.symbol))) {
    try {
      const d = await daily(sym); if (d.c.length < 260) throw new Error("мало історії");
      res.coins.push(sym);
      const grp = sym === "BTC" ? ["BTC", "усі"] : ["альти", "усі"];
      // звичайна зміна монети по періодах
      for (const h of H) {
        const fw = d.c.map((c, i) => (i + h < d.c.length ? (d.c[i + h] / c - 1) * 100 : NaN));
        const per = i => (d.t[i] < SPLIT ? "навчання" : "перевірка");
        const base = {}; for (const p of ["навчання", "перевірка"]) { const a = fw.filter((x, i) => isFinite(x) && per(i) === p && F.has(d.t[i])); base[p] = { m: a.length ? mean(a) : 0, up: a.length ? a.filter(x => x > 0).length / a.length : 0.5 }; }
        let last = -1e9;
        for (let i = 1; i < d.c.length; i++) {
          if (!isFinite(fw[i]) || !F.has(d.t[i])) continue;
          const v = F.get(d.t[i]), p = per(i), b = base[p], ex = fw[i] - b.m, hit = fw[i] > 0 ? 1 : 0;
          for (const g of grp) put(`zone:${zoneOf(v)}:${g}`, p, h, ex, hit, b.up);
          const pv = F.get(d.t[i - 1]);
          if (pv != null && i - last >= 5) {
            if (v <= 20 && pv > 20) { for (const g of grp) put(`fear_in:${g}`, p, h, ex, hit, b.up); if (h === 7) last = i; }
            if (v >= 80 && pv < 80) { for (const g of grp) put(`greed_in:${g}`, p, h, ex, hit, b.up); if (h === 7) last = i; }
          }
        }
      }
      // денна стратегія → зона індексу в день входу
      const R = IND.all(d); const out = S.run(d, R, null);
      for (const t of out.trades) { const v = F.get(Math.floor(t.tIn / DAY) * DAY); if (v != null) trades.push({ ...t, sym, fng: v }); }
    } catch (e) { res.errors.push(`${sym}: ${e.message}`); }
    await new Promise(z => setTimeout(z, 300));
  }
  const get = (g, p, h) => { const a = acc[`${g}|${p}|${h}`]; return a ? summ(a.ex, a.hit, mean(a.base)) : { n: 0 }; };
  for (const g of ["BTC", "альти"]) {
    res.zones[g] = ZONES.map(([name], z) => ({ zone: name, ...Object.fromEntries(H.flatMap(h => ["навчання", "перевірка"].map(p => [`${h}d_${p}`, get(`zone:${z}:${g}`, p, h)]))) }));
    res.signals[g] = [["вхід у сильний страх (≤ 20) — «купуй на страху»", "fear_in"], ["вхід у сильну жадібність (≥ 80) — «продавай на жадібності»", "greed_in"]].map(([name, k]) => ({ signal: name, ...Object.fromEntries(H.flatMap(h => ["навчання", "перевірка"].map(p => [`${h}d_${p}`, get(`${k}:${g}`, p, h)]))) }));
  }
  for (const side of [1, -1]) res.filter[side > 0 ? "лонги" : "шорти"] = ZONES.map(([name, a, b]) => ({ zone: name, ...S.stats(trades.filter(t => t.side === side && t.fng >= a && t.fng <= b)).all }));
  fs.writeFileSync(path.join(OUT, "fng.json"), JSON.stringify(res, null, 1));
  const f = x => (x == null ? "—" : String(x).replace(".", ","));
  const cell = s => (s.n >= 5 ? `${s.excess > 0 ? "+" : ""}${f(s.excess)} (t ${f(s.t)}, n ${s.n}, ріст ${f(s.up)}% / ${f(s.base_up)}%)` : `n ${s.n ?? 0}`);
  let md = `# Індекс страху та жадібності — перевірка на історії\n\n${res.generated_utc.slice(0, 16).replace("T", " ")} UTC · індекс з ${res.fng_from} (${res.fng_days} днів) · ${res.coins.length} монет · Binance.\n\nНадлишок = зміна ціни після дня в зоні мінус звичайна зміна тієї ж монети за той самий період, п.п. «Ріст» — частка випадків, коли ціна виросла / те саме для звичайного дня. Навчання — до 2024-01-01, перевірка — після.\n\n`;
  for (const g of ["BTC", "альти"]) {
    md += `## ${g}: зони індексу\n\n| Зона | 7 д навчання | 7 д перевірка | 30 д навчання | 30 д перевірка |\n|---|---|---|---|---|\n`;
    for (const z of res.zones[g]) md += `| ${z.zone} | ${cell(z["7d_навчання"])} | ${cell(z["7d_перевірка"])} | ${cell(z["30d_навчання"])} | ${cell(z["30d_перевірка"])} |\n`;
    md += `\n**Контрарні сигнали (${g})**\n\n| Сигнал | 7 д навчання | 7 д перевірка | 30 д навчання | 30 д перевірка |\n|---|---|---|---|---|\n`;
    for (const s of res.signals[g]) md += `| ${s.signal} | ${cell(s["7d_навчання"])} | ${cell(s["7d_перевірка"])} | ${cell(s["30d_навчання"])} | ${cell(s["30d_перевірка"])} |\n`;
    md += "\n";
  }
  md += `## Денна стратегія: результат угод залежно від індексу в день входу\n\n| Бік | Зона | Угод | Виграш, % | Сер. R | PF |\n|---|---|---|---|---|---|\n`;
  for (const [side, rows] of Object.entries(res.filter)) for (const x of rows) md += `| ${side} | ${x.zone} | ${x.n} | ${f(x.win)} | ${f(x.avgR)} | ${f(x.pf)} |\n`;
  md += `\nЗастереження: дні в одній зоні йдуть серіями, тому t завищене (перекриття вікон); індекс — один на весь ринок, тож альткоїни не є незалежними спостереженнями. Помилки: ${res.errors.length ? res.errors.join("; ") : "немає"}.\n`;
  fs.writeFileSync(path.join(OUT, "fng.md"), md);
  console.log(md.slice(0, 3000));
})();
