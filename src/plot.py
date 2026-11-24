"""Малює PNG-дашборд для кожного активу з data/series_<SYM>.json і data/latest.json.
Лише читання локальних файлів; мережі не використовує."""
import json, os, datetime as dt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA, OUT = os.path.join(ROOT, "data"), os.path.join(ROOT, "charts")
os.makedirs(OUT, exist_ok=True)
RED, GRN, BLU, GOLD, INK, MUTE = "#c8371e", "#1f7a4d", "#2b5ea7", "#9a6b00", "#141210", "#8a847b"

latest = json.load(open(os.path.join(DATA, "latest.json"), encoding="utf-8"))

def fmt(x, n=None):
    if x is None: return "–"
    n = n if n is not None else (0 if abs(x) >= 100 else 2)
    return f"{x:,.{n}f}".replace(",", " ").replace(".", ",")

for sym, a in latest["assets"].items():
    s = json.load(open(os.path.join(DATA, f"series_{sym}.json"), encoding="utf-8"))
    x = list(range(len(s["c"])))
    dates = [dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).strftime("%d.%m") for t in s["t"]]
    fig = plt.figure(figsize=(14, 10), dpi=110, facecolor="#f4f2ee")
    gs = fig.add_gridspec(5, 2, height_ratios=[3.2, 0.5, 1.2, 1.2, 0.05], hspace=0.35, wspace=0.12)
    ax = fig.add_subplot(gs[0, :]); axv = fig.add_subplot(gs[1, :], sharex=ax)
    a_rsi, a_macd = fig.add_subplot(gs[2, 0], sharex=ax), fig.add_subplot(gs[2, 1], sharex=ax)
    a_adx, a_cmf = fig.add_subplot(gs[3, 0], sharex=ax), fig.add_subplot(gs[3, 1], sharex=ax)
    for A in (ax, axv, a_rsi, a_macd, a_adx, a_cmf):
        A.set_facecolor("white"); A.grid(color="#e6e2dc", lw=0.6); [sp.set_color("#d5d0c8") for sp in A.spines.values()]
        A.tick_params(colors=MUTE, labelsize=8)
    for i in x:
        o, h, l, c = s["o"][i], s["h"][i], s["l"][i], s["c"][i]
        col = GRN if c >= o else RED
        ax.vlines(i, l, h, color=col, lw=0.8); ax.add_patch(plt.Rectangle((i - 0.32, min(o, c)), 0.64, max(abs(c - o), 1e-9), color=col))
        axv.bar(i, s["v"][i], color="#cfc9c0", width=0.7)
    ax.plot(x, s["bbUp"], color=GOLD, ls="--", lw=0.9, label="Bollinger 20/2"); ax.plot(x, s["bbLo"], color=GOLD, ls="--", lw=0.9)
    ax.plot(x, s["sma50"], color=BLU, lw=1.8, label="SMA 50"); ax.plot(x, s["sma200"], color=INK, lw=2.2, label="SMA 200")
    for i in range(1, len(x)):
        if s["supertrend"][i - 1] is not None and s["stDir"][i] == s["stDir"][i - 1]:
            ax.plot([i - 1, i], [s["supertrend"][i - 1], s["supertrend"][i]], color=GRN if s["stDir"][i] > 0 else RED, lw=2)
    ax.axhline(s["c"][-1], color=RED, ls=":", lw=0.8)
    ax.legend(loc="upper left", fontsize=8, frameon=False)
    a_rsi.plot(x, s["stochRsi"], color=MUTE, lw=0.8); a_rsi.plot(x, s["rsi"], color=INK, lw=1.6)
    for lv in (30, 70): a_rsi.axhline(lv, color=MUTE, ls="--", lw=0.7)
    a_rsi.set_ylim(0, 100); a_rsi.set_title("RSI 14 (чорна) і StochRSI", fontsize=9, loc="left", color=INK)
    a_macd.bar(x, [v or 0 for v in s["macdHist"]], color=[GRN if (v or 0) >= 0 else RED for v in s["macdHist"]], width=0.7)
    a_macd.plot(x, s["macd"], color=BLU, lw=1.1); a_macd.plot(x, s["macdSig"], color=GOLD, lw=1.1); a_macd.axhline(0, color=MUTE, lw=0.6)
    a_macd.set_title("MACD 12/26/9", fontsize=9, loc="left", color=INK)
    a_adx.plot(x, s["adx"], color=INK, lw=1.6); a_adx.plot(x, s["diP"], color=GRN, lw=1); a_adx.plot(x, s["diN"], color=RED, lw=1)
    a_adx.axhline(25, color=MUTE, ls="--", lw=0.7); a_adx.set_title("ADX 14 (чорна), DI+ / DI−", fontsize=9, loc="left", color=INK)
    a_cmf.bar(x, [v or 0 for v in s["cmf"]], color=[GRN if (v or 0) >= 0 else RED for v in s["cmf"]], width=0.7)
    a2 = a_cmf.twinx(); a2.plot(x, s["mfi"], color=INK, lw=1.1); a2.set_ylim(0, 100); a2.tick_params(colors=MUTE, labelsize=8)
    a_cmf.set_title("CMF 20 (стовпчики), MFI 14 (лінія)", fontsize=9, loc="left", color=INK)
    step = max(1, len(x) // 10)
    for A in (a_adx, a_cmf): A.set_xticks(x[::step]); A.set_xticklabels(dates[::step])
    for A in (ax, axv, a_rsi, a_macd): plt.setp(A.get_xticklabels(), visible=False)
    L, st = a["live"], a["states"]
    cs = L.get("composite_score"); comp = st.get("composite", "—")
    title = f"{sym}: {fmt(L['close'])} $ · ЗВЕДЕНО: {comp.upper()} ({'+' if (cs or 0) > 0 else ''}{cs if cs is not None else '–'} з ±6) · RSI {fmt(L['rsi14'],1)} · ADX {fmt(L['adx'],1)} · Mayer {fmt(L['mayer'],3)}"
    fig.text(0.02, 0.965, title, fontsize=16, weight="bold", color=INK)
    sub = (f"Стани (закрита свічка {a['last_closed_utc']}): тренд {st['supertrend']} · {st['adx_regime']} · ціна {st['price_vs_sma200']} SMA200 · {st['sma50_vs_sma200']} · "
           f"Mayer {st['mayer_zone']} · RSI {st['rsi_zone']} · CMF {st['cmf']} · Ішимоку {st['ichimoku']} · стиснення BB {st['bb_squeeze']}")
    fig.text(0.02, 0.94, sub, fontsize=9, color=MUTE)
    fig.text(0.02, 0.012, f"Джерело: {a['source']}, денні свічки. Згенеровано {latest['generated_utc'][:16].replace('T',' ')} UTC. Остання свічка формується. Стан ринку, не прогноз і не порада.", fontsize=8, color=MUTE)
    fig.savefig(os.path.join(OUT, f"{sym}.png"), facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    print("chart", sym)
