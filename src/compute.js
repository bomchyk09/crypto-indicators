// Отримує денні свічки, рахує індикатори (engine.js), визначає переходи станів (сигнали),
// пише data/latest.json, data/series_<SYM>.json (для графіків), data/state.json, data/journal.csv.
// Лише публічні ринкові дані, без ключів і без торгівлі.
const fs = require("fs");
const path = require("path");
const IND = require("./engine.js");

const ROOT = path.join(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "crypto-indicators-bot" } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

// Джерело 1: Binance (публічний ендпоінт лише для ринкових даних). Може повертати 451 із серверів у США.
async function fromBinance(a) {
  const k = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${a.binance}&interval=1d&limit=400`);
  if (!Array.isArray(k)) throw new Error("неочікувана відповідь");
  return { src: `Binance ${a.binance}`, t: k.map(x => x[0]), o: k.map(x => +x[1]), h: k.map(x => +x[2]), l: k.map(x => +x[3]), c: k.map(x => +x[4]), v: k.map(x => +x[7]) };
}
// Джерело 2: Kraken (США дозволені). До 720 денних свічок: [time, o, h, l, c, vwap, volume, count].
async function fromKraken(a) {
  const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${a.kraken}&interval=1440`);
  if (j.error && j.error.length) throw new Error("Kraken: " + j.error.join(","));
  const key = Object.keys(j.result).find(k => k !== "last");
  const k = j.result[key].slice(-400);
  return { src: `Kraken ${a.kraken}`, t: k.map(x => x[0] * 1000), o: k.map(x => +x[1]), h: k.map(x => +x[2]), l: k.map(x => +x[3]), c: k.map(x => +x[4]), v: k.map(x => +x[6] * +x[5]) };
}

// Джерело 3: Coinbase Exchange (США). До 300 денних свічок: [time, low, high, open, close, volume], нові першими.
async function fromCoinbase(a) {
  const k = (await getJSON(`https://api.exchange.coinbase.com/products/${a.coinbase}/candles?granularity=86400`)).slice().reverse();
  return { src: `Coinbase ${a.coinbase}`, t: k.map(x => x[0] * 1000), o: k.map(x => +x[3]), h: k.map(x => +x[2]), l: k.map(x => +x[1]), c: k.map(x => +x[4]), v: k.map(x => +x[5] * +x[4]) };
}

// Тикер → пари на біржах (BTC на Kraken — XBT).
const pairs = s => ({ symbol: s, binance: `${s}USDT`, kraken: `${s === "BTC" ? "XBT" : s}USD`, coinbase: `${s}-USD` });

async function candles(a) {
  const errs = [];
  for (const f of [fromBinance, fromKraken, fromCoinbase]) {
    try { const d = await f(a); if (d.c.length >= 210) return d; errs.push(`${f.name}: мало свічок (${d.c.length})`); }
    catch (e) { errs.push(`${f.name}: ${e.message}`); }
  }
  throw new Error(errs.join(" | "));
}

const r = (x, n = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(n));

// Стани, переходи між якими — сигнали (логіка «перехід, а не перебування», як у 26).
function states(R, d, i) {
  const c = d.c[i];
  const pctl = (arr, i, win) => { const w = arr.slice(i - win + 1, i + 1).filter(isFinite); return w.filter(x => x <= arr[i]).length / w.length * 100; };
  return {
    rsi_zone: R.rsi[i] < 30 ? "перепроданість" : R.rsi[i] > 70 ? "перекупленість" : "норма",
    macd_hist: R.macdHist[i] >= 0 ? "+" : "−",
    price_vs_sma200: c >= R.sma200[i] ? "вище" : "нижче",
    sma50_vs_sma200: R.sma50[i] >= R.sma200[i] ? "золотий хрест" : "хрест смерті",
    mayer_zone: R.mayer[i] < 0.8 ? "< 0,8" : R.mayer[i] > 2.4 ? "> 2,4" : "0,8–2,4",
    supertrend: R.stDir[i] > 0 ? "лонг" : "шорт",
    adx_regime: R.adx[i] > 25 ? "тренд" : R.adx[i] < 20 ? "флет" : "перехідний",
    donchian: c >= R.donHi[i - 1] ? "пробій вгору" : c <= R.donLo[i - 1] ? "пробій вниз" : "в каналі",
    bb_squeeze: pctl(R.bbWidth, i, 90) <= 10 ? "стиснення" : "ні",
    ttm_squeeze: R.squeeze[i] ? "так" : "ні",
    cmf: R.cmf[i] > 0.05 ? "приплив" : R.cmf[i] < -0.05 ? "відплив" : "нейтрально",
    tsmom: R.tsmom[i] === 3 ? "+3" : R.tsmom[i] === -3 ? "−3" : "змішаний",
    ichimoku: c > Math.max(R.spanA[i], R.spanB[i]) ? "над хмарою" : c < Math.min(R.spanA[i], R.spanB[i]) ? "під хмарою" : "у хмарі",
  };
}

function values(R, d, i) {
  return {
    close: r(d.c[i], 4), sma7: r(R.sma7[i]), sma30: r(R.sma30[i]), sma50: r(R.sma50[i]), sma200: r(R.sma200[i]), ema21: r(R.ema21[i]), ema50: r(R.ema50[i]),
    mayer: r(R.mayer[i], 3), macd: r(R.macd[i], 4), macd_signal: r(R.macdSig[i], 4), macd_hist: r(R.macdHist[i], 4),
    rsi14: r(R.rsi[i], 1), rsi7: r(R.rsi7[i], 1), stoch_rsi: r(R.stochRsiK[i], 1), stoch_k: r(R.stochK[i], 1), stoch_d: r(R.stochD[i], 1), williams_r: r(R.willR[i], 1), cci: r(R.cci[i], 0), roc14: r(R.roc[i], 2),
    bb_low: r(R.bbLo[i]), bb_up: r(R.bbUp[i]), bb_pctb: r(R.bbPctB[i], 2), bb_width: r(R.bbWidth[i], 2), kc_low: r(R.kcLo[i]), kc_up: r(R.kcUp[i]),
    atr14: r(R.atr[i]), atr_pct: r(R.atrPct[i], 2), rvol30: r(R.rvol[i], 1),
    adx: r(R.adx[i], 1), di_plus: r(R.diP[i], 1), di_minus: r(R.diN[i], 1), psar: r(R.psar[i]), supertrend: r(R.supertrend[i]), donchian_low: r(R.donLo[i]), donchian_high: r(R.donHi[i]),
    tenkan: r(R.tenkan[i]), kijun: r(R.kijun[i]), span_a: r(R.spanA[i]), span_b: r(R.spanB[i]),
    tsmom: R.tsmom[i], z20: r(R.z20[i], 2), hurst128: r(R.hurst[i], 3),
    obv_change_20d: r(R.obv[i] - R.obv[i - 20], 0), cmf20: r(R.cmf[i], 3), mfi14: r(R.mfi[i], 1), vwap20: r(R.vwap20[i]), vol_ratio20: r(R.volRatio[i], 2),
  };
}

(async () => {
  const statePath = path.join(DATA, "state.json");
  const prev = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
  const out = { generated_utc: new Date().toISOString(), note: "Остання (поточна) денна свічка ще формується; сигнали рахуються по закритих свічках.", assets: {}, signals: [], errors: [] };
  const next = {};
  const journal = [];
  for (const a of CFG.assets.map(x => (typeof x === "string" ? pairs(x) : x))) {
    try {
      const d = await candles(a);
      const R = IND.all(d);
      const N = d.c.length - 1, iClosed = N - 1; // N — поточна свічка, iClosed — остання закрита
      const st = states(R, d, iClosed);
      next[a.symbol] = st;
      const was = prev[a.symbol];
      if (was) for (const k of Object.keys(st)) if (was[k] !== undefined && was[k] !== st[k]) {
        const s = { asset: a.symbol, type: k, from: was[k], to: st[k], close: r(d.c[iClosed], 4), candle_utc: new Date(d.t[iClosed]).toISOString().slice(0, 10) };
        out.signals.push(s);
        journal.push([out.generated_utc, a.symbol, k, was[k], st[k], s.close].join(";"));
      }
      out.assets[a.symbol] = {
        source: d.src, candles: d.c.length, last_closed_utc: new Date(d.t[iClosed]).toISOString().slice(0, 10),
        live: values(R, d, N), closed: values(R, d, iClosed), states: st,
        levels: { fib90: Object.fromEntries(Object.entries(R.fib).map(([k, v]) => [k, r(v)])), pivot: Object.fromEntries(Object.entries(R.pivot).map(([k, v]) => [k, r(v)])), poc90: r(R.vp.poc), rsi_divergence: R.div },
      };
      const S = 150, s0 = d.c.length - S, sl = x => x.slice(s0).map(v => (isFinite(v) ? +(+v).toPrecision(8) : null));
      fs.writeFileSync(path.join(DATA, `series_${a.symbol}.json`), JSON.stringify({
        symbol: a.symbol, source: d.src, t: d.t.slice(s0), o: sl(d.o), h: sl(d.h), l: sl(d.l), c: sl(d.c), v: sl(d.v),
        sma50: sl(R.sma50), sma200: sl(R.sma200), bbUp: sl(R.bbUp), bbLo: sl(R.bbLo), bbMid: sl(R.bbMid), supertrend: sl(R.supertrend), stDir: R.stDir.slice(s0),
        rsi: sl(R.rsi), stochRsi: sl(R.stochRsiK), macd: sl(R.macd), macdSig: sl(R.macdSig), macdHist: sl(R.macdHist), adx: sl(R.adx), diP: sl(R.diP), diN: sl(R.diN), cmf: sl(R.cmf), mfi: sl(R.mfi),
      }));
    } catch (e) {
      out.errors.push(`${a.symbol}: ${e.message}`);
      if (prev[a.symbol]) next[a.symbol] = prev[a.symbol];
    }
    await new Promise(r => setTimeout(r, 1200)); // ввічлива пауза між запитами (ліміти публічних API)
  }
  fs.writeFileSync(path.join(DATA, "latest.json"), JSON.stringify(out, null, 1));
  fs.writeFileSync(statePath, JSON.stringify(next, null, 1));
  const jp = path.join(DATA, "journal.csv");
  if (!fs.existsSync(jp)) fs.writeFileSync(jp, "run_utc;asset;type;from;to;close\n");
  if (journal.length) fs.appendFileSync(jp, journal.join("\n") + "\n");
  console.log(`assets ok: ${Object.keys(out.assets).join(",")}; signals: ${out.signals.length}; errors: ${out.errors.length}`);
  if (out.errors.length) console.log(out.errors.join("\n"));
  if (!Object.keys(out.assets).length) process.exit(1);
})();
