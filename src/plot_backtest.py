"""Графік підсумку бектесту: надлишок за 7 днів після сигналу (навчання vs перевірка) для кожного сигналу."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rep = json.load(open(os.path.join(ROOT, "backtest", "report.json"), encoding="utf-8"))
V = [v for v in rep["verdicts"] if v["test7"] and v["train7"]]
val = lambda s, d: (s["vol_excess"] if d == 0 else s["excess"] * (d if d else 1))  # «у правильний бік» = додатне
V.sort(key=lambda v: val(v["test7"], v["dir"]))
names = [f'{"↑" if v["dir"]>0 else "↓" if v["dir"]<0 else "±"} {v["name"]}' for v in V]
te = [val(v["test7"], v["dir"]) for v in V]; tr = [val(v["train7"], v["dir"]) for v in V]
col = {"працює": "#1f7a4d"}
colors = ["#1f7a4d" if v["verdict"].startswith("працює") else "#c9a227" if v["verdict"].startswith("слабко") else "#c8371e" for v in V]
fig, ax = plt.subplots(figsize=(12, 0.36 * len(V) + 2), dpi=110, facecolor="#f4f2ee")
ax.set_facecolor("white"); y = range(len(V))
ax.barh([i + 0.2 for i in y], te, height=0.4, color=colors, label="перевірка (з 2024)")
ax.barh([i - 0.2 for i in y], tr, height=0.4, color="#b8b2a8", label="навчання (до 2024)")
ax.axvline(0, color="#141210", lw=0.8); ax.set_yticks(list(y)); ax.set_yticklabels(names, fontsize=8)
ax.set_xlabel("Перевага за 7 днів у очікуваний бік, п.п. (для ± — додатковий модуль руху)", fontsize=9)
ax.legend(loc="lower right", fontsize=8, frameon=False); ax.grid(axis="x", color="#e6e2dc")
fig.suptitle("Які сигнали щось передбачають: 7 днів після сигналу проти звичайного дня", fontsize=13, weight="bold", x=0.01, ha="left")
fig.text(0.01, 0.005, f'Binance, {len(rep["meta"]["assets"])} монет, денні свічки. Зелений — працює (стабільно і t ≥ 2), жовтий — слабко, червоний — ні. Стан ринку, не прогноз і не порада. {rep["meta"]["generated_utc"][:10]}', fontsize=7, color="#6b655d")
fig.tight_layout(rect=(0, 0.02, 1, 0.97))
fig.savefig(os.path.join(ROOT, "backtest", "summary.png"), facecolor=fig.get_facecolor())
print("summary.png")
