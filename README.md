# crypto-indicators — безкоштовний розрахунок 28 технічних індикаторів

Тричі на добу GitHub Actions бере **публічні** денні свічки (Binance, запасне джерело — Kraken), рахує 28 індикаторів
(рушій — `src/engine.js`, той самий, що в проєкті «Мій персональний AI», документ 31), визначає переходи станів
і малює PNG-графіки. Результати комітяться в цей репозиторій; Claude читає їх у запланованих перевірках.

## Де результати
Гілка **`results`** (перезаписується кожним запуском, тому репозиторій не розростається):
https://github.com/bomchyk09/crypto-indicators/tree/results
- графік: https://raw.githubusercontent.com/bomchyk09/crypto-indicators/results/charts/BTC.png (замість BTC — будь-який тикер)
- дані: https://raw.githubusercontent.com/bomchyk09/crypto-indicators/results/data/latest.json

Файли:
- `data/latest.json` — усі індикатори (поточна і остання закрита свічка), стани, рівні, нові сигнали, помилки.
- `data/journal.csv` — журнал сигналів (основа для оцінки «чи спрацьовують»).
- `data/state.json` — попередні стани (для визначення переходів).
- `charts/BTC.png`, `ETH.png`, `SOL.png` — графіки.

## Безпека
- Жодних ключів, паролів чи токенів: лише публічні ринкові дані, без торгівлі й без доступу до акаунтів бірж.
- Права workflow: `contents: write` лише для цього репозиторію (щоб зберігати результати).
- Використовуються тільки офіційні дії GitHub (`actions/checkout`, `actions/setup-python`) і бібліотека matplotlib.
- Публічний репозиторій видно всім: тут лише код і ринкові індикатори, особистих даних немає.

## Вартість
- Публічний репозиторій + стандартний раннер `ubuntu-latest` — безкоштовно, без ліміту хвилин.
- Платіжний метод на GitHub не потрібен. Не вмикайте «larger runners» і не підвищуйте spending limit / budget.
- Запуск триває ~1–2 хв; `timeout-minutes: 10` — запобіжник.

## Монети (24)
BTC, ETH, SOL, BNB, AVAX, ATOM, NEAR, ADA, ALGO, TRX, JUP, EGLD, INJ, DOT, VET, PUMP, APT, HBAR, ONDO, SUI, FIL, RSR, ZIL, LINK.
Джерела свічок по черзі: Binance → Kraken → Coinbase (перевірено 24.11.2026: усі монети є на Binance з історією ≥ 440 днів;
на Kraken — усі, крім ZIL; на Coinbase — усі, крім TRX, JUP, ZIL). ZIL є лише на Binance: якщо Binance не віддає дані серверам GitHub, ZIL пропускається з поясненням у `data/latest.json → errors`.

## Як додати або прибрати монету
1. Сказати Claude («додай TAO, LINK» / «прибери ZIL») — він змінить `config.json` і запустить розрахунок.
2. Самостійно, з телефона чи комп'ютера: Actions → indicators → Run workflow → поле **add** (тикери через кому) або **remove** → Run.
Потрібен лише тикер: пари на біржах бот знаходить сам (`<TICKER>USDT`, `<TICKER>USD`, `<TICKER>-USD`). Монета з історією менше 210 днів або без пари на жодній із трьох бірж пропускається з поясненням.

## Налаштування
- Розклад — `.github/workflows/indicators.yml` (UTC), тричі на добу. Ручний запуск: Actions → indicators → Run workflow.
- Введені в поля add/remove значення передаються через змінні середовища і перевіряються (лише латиниця й цифри) — захист від підстановки команд.

Стан ринку, не прогноз і не інвестиційна порада.
