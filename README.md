# HS Basketball — Courtside strategy laboratory

A Traditional Chinese, browser-only basketball strategy prototype of the 2002 Western Conference Finals: Los Angeles Lakers vs Sacramento Kings. It follows HS-BaseSta's static ES-module/Python architecture, three-column workspace, progressive pro/con disclosure, bundled subset fonts, seeded engine, Web Worker simulations and browser-local saves. No build step or runtime npm dependencies.

## Run and check

Python 3.10+ and Node 22+:

```sh
python3 server.py
# http://localhost:3000 (PORT overrides 3000)
source ~/.nvm/nvm.sh
npm run check && npm test
```

The server serves an explicit static-file allowlist; never expose an API-key-enabled instance to untrusted users. No accounts, tracking or remote storage. A missing or corrupt local save starts a fresh game.

## Rules and interactions

One turn is one player's hold of the ball. A named pass ends that turn and gives the receiver the next hold; a steal/clock violation can instead change possession. Each action consumes 2–9 seconds, capped by the remaining game/24-second clocks. Drive, pull-up, three and post-up resolve a shot; screen and hold/reset consume a turn while retaining the handler. The screen creates a small next-shot advantage. Shots resolve makes, misses, offensive/defensive rebounds, shooting fouls, free throws and and-ones. All randomness is seeded and reproducible.

Four 12-minute quarters, repeating five-minute overtimes until a winner, automatic quarter transitions, scores, possession, ball handler, court zone, positional matchups, individual/team fouls, six timeouts per team, stamina, floor and bench are tracked. Six personal fouls trigger automatic replacement if a reserve is available. Substitutions and timeouts are manager resource actions and do not consume a hold; timeouts restore some stamina. Both teams are controlled by the user, rather than a hidden opponent making strategic decisions.

Select a historical situation on the left. Read the center scoreboard/court/matchup, select a hold action and offensive/defensive manager layer, inspect expandable arguments and their source tags, then execute. Click any roster/court player for actual season and available WCF per-game stats, current resources and legal substitutions. Undo swaps the previous/current state; save branch retains a snapshot for alternative exploration (30 retained). Autosave and branches stay in localStorage under `courtside.2002.v1`.

## Tactical model and Monte Carlo

Triangle adds .02 to post shot probability; post-up adds .045 for players averaging more than eight rebounds. Motion passing adds .025 to the next shot. Screens add .04, or .01 against switching. Doubling Shaq reduces his shot probability by .09; hack raises the shooting-foul probability to .30. These coefficients, base turnover/steal probabilities, offensive-rebound heuristics, clock consumption and stamina are **estimated**, not historical tactical effects. Stats supply individual shooting/FT rates, rebounding and turnover/steal inputs. Defense uses representative lineup slot matchups, not calibrated defender tracking.

Monte Carlo runs 80 paired full-game samples per tactic and baseline inside a Web Worker, sharing initial seeds. The selected manager setup persists; the first selected hold is then followed by a fixed stochastic shot policy to final. Baseline starts with a pull-up and the existing setup. Expected points count only the first hold (including free throws), while win probability counts full-game wins for the originally possessing team. Small samples and an uncalibrated model limit interpretation; these are not betting predictions or causal estimates.

## Data and historical limits

`src/rosters.json` contains the full 2001–02 team-season rosters (15 Lakers, 14 Kings) and regular-season per-game stats fetched directly from Basketball Reference. WCF per-game stats are included where their series table reports them. `實際` means a sourced historical statistic or the current simulation's objective input state; it never means that a simulated event actually happened.

- https://www.basketball-reference.com/teams/LAL/2002.html
- https://www.basketball-reference.com/teams/SAC/2002.html
- https://www.basketball-reference.com/playoffs/2002-nba-western-conference-finals-lakers-vs-kings.html
- Game 4: https://www.basketball-reference.com/boxscores/200205260LAL.html
- Game 6: https://www.basketball-reference.com/boxscores/200205310LAL.html
- Game 7: https://www.basketball-reference.com/boxscores/200206020SAC.html

Game 6's 75–75 start of the fourth and Game 7's 100–100 overtime start are verified from quarter totals. Game 4's 97–99 late possession and Game 7's end-regulation 100–100 are illustrative reconstructions around those actual moments, not play-by-play snapshots. Exact seconds, possession, zones, starting lineups, remaining fouls/timeouts and stamina in historical presets are explicitly **estimated**. The initial floor uses representative rotation players, not the recorded starting five. Full-season availability spans roster changes and does not enforce historical injury restrictions. Stojaković played Games 5, 6 and 7, verified from all three box scores (Game 5: https://www.basketball-reference.com/boxscores/200205280SAC.html); Game 4 lists him as Did Not Dress. He did **not** miss Games 4–6. The Game 4 preset starts Türkoğlu instead, but users may subsequently substitute any season-roster player. Other injury restrictions are not modeled.

Refresh with `python3 fetch_rosters.py` (network required; optional local `lal-source.html`, `sac-source.html`, `wcf-source.html` caches). Game rules are intentionally simplified: no live-ball non-shooting fouls/bonus, technicals, flagrant fouls, backcourt/eight-second violations, goaltending, jump balls, blocked-shot attribution, individual points box score, tactical opponent AI, or official timeout carryover rules. Offensive rebounds reset to the era-appropriate 24 seconds. Foul-out exhaustion does not simulate the rare NBA insufficient-player penalty. A screen/reset allows another hold by the same player, rather than animating a separate live-ball movement.

## Optional Claude rewrite

Set `ANTHROPIC_API_KEY` **only in the server environment**, never in a file or browser. `/api/analyze` rewrites supplied rule pro/con/attack/contingency points; the UI always renders deterministic rules immediately. The response explicitly reports `source: "Claude"` or `source: "規則引擎"`; fallback is HTTP 200. Missing key, network errors, incomplete output, unsupported glyphs, bad shape or invented numbers reject the rewrite. No key or upstream error is sent to the browser. Model defaults to `claude-haiku-5-5` and can be overridden with `ANTHROPIC_MODEL`.

Numbers in AI output must already occur in source facts or rule arguments, including normalized percentages and Chinese numeric forms. This validates numeric grounding, not whether a number was attached to the correct basketball claim. Structured-output schema never has `minItems` above one; local validation enforces card counts. Only current facts and rule cards leave the browser, never saved branches.

## Fonts and tests

Bundled Noto Sans TC 400/600 subsets and retained licenses follow the baseball reference. Rebuild after copy/data changes using `fonttools`:

```sh
python3 subset_fonts.py /path/to/NotoSansTC.ttf /path/to/DejaVuSans.ttf
```

`ui_characters.py` gathers visible sources and decoded roster names. Tests inspect both font cmaps and content hashes. Node tests cover immutable seeded transitions, legal scores, clocks, pass handoffs, resource errors, overtime, a 100-full-game seeded sweep, layered tactics, paired simulations and scenario/branch/autosave flows. Python tests cover font and HTTP/Claude validators without requiring a key. Browser verification uses Playwright from the sibling reference repository and plays a complete game with actual UI clicks.

With the server running and the sibling HS-BaseSta Playwright installation available:

```sh
node verify/browser.mjs
# Desktop, mobile and full-game PNGs: /home/ubuntu/shots/basketball-*.png
# Against a key-enabled server, explicitly checks source rather than HTTP status:
python3 verify/live-claude.py
```

Verified browser run: 550 UI decisions to a regulation final, Lakers 154–152 Kings, no console errors. This deliberately shot-heavy test is an interaction/invariant check, not a claim of historically calibrated scoring.
