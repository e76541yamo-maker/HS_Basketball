# Courtside — team-possession strategy laboratory

Traditional Chinese browser prototype for **2015-12-25 CLE at GSW**, inspired by HS-BaseSta / HS-Mahjong. Dependency-free JavaScript state machine, Python static/API server, optional Claude rewrite, seeded Web Worker rollouts, local-only branches and bundled font subsets. No account or external analytics.

## Run and verify

```sh
source ~/.nvm/nvm.sh
python3 server.py                    # http://localhost:3000; PORT overrides 3000
npm run check && npm test
node verify/browser.mjs             # Playwright from sibling HS-BaseSta/node_modules
python3 verify/live-claude.py        # separately start server with environment-bound ANTHROPIC_API_KEY
```

There is no build/install step for the app. Node 22+, Python 3.10+. The browser verifier overwrites desktop/mobile/full-game screenshots in /home/ubuntu/shots/. Never put an API key into a file, URL, frontend or repository. The API returns HTTP 200 on rule fallback: check `source === "Claude"`.

## Turn semantics and manager windows

**A turn is a complete team's possession**, not a player's hold or pass. Makes, turnovers, defensive rebounds, completed shooting/bonus free throws, and period end terminate it. Offensive rebounds (including awarded team offensive rebounds) continue the same turn. A made basket plus its and-one is one possession; non-final missed-FT team-rebound placeholders do not create possessions. Technical free throws retain control.

Non-shooting fouls, timeouts, violations and substitutions create **management windows within the same possession**; they do not illegally transfer the ball. Simultaneous dead-ball events at one game clock are grouped into one window, after the last such event, with updated resources and any already-completed free throws. Remaining free throws cannot be replaced with a live play. The final four-second GSW dribble-out counts as a scoreless possession.

The historical line advances automatically across live non-decision possessions to the next dead ball. Every possession in Q4/OT's final five minutes is also a decision window. A short log records completed possessions, including automatically advanced ones. Choosing an estimated tactic, timeout, substitution or risk remedy forks permanently into simulation: it never imports future historical points/resources. Undo restores the previous decision window; autosave/branches use a version-3 key, deliberately separate from old hold-based saves.

Center: score, clock, estimated shot clock, possession, team fouls, bonus, remaining timeout budget, both lineups and personal fouls (four or more highlighted). Options cover seven offensive play types; hold/2-for-1/quick-three clock calls; switch/drop/blitz/zone/intentional-foul defense; substitutions and timeouts. Live-ball substitutions are rejected; a defending team cannot call a live-ball timeout. Intentional non-bonus fouls retain control before subsequent bonus free throws. Fouled-out players are replaced automatically by an eligible bench player.

## Sources, validation and actual versus estimated

### Actual (實際)

- Ordered NBA PBP CSV, game **0021500438**:
  https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/events/0021500438.csv
- Independent box score:
  https://www.basketball-reference.com/boxscores/201512250GSW.html
- 2015–16 season per-game player tables and published advanced usage/TS metrics:
  https://www.basketball-reference.com/teams/CLE/2016.html and
  https://www.basketball-reference.com/teams/GSW/2016.html
  (all **26 roster names** matched, normalizing the Varejão diacritic; team-season splits for traded players).
- SportVU archive: https://github.com/neilmj/BasketballData ;
  downloaded mirror:
  https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/12.25.2015.CLE.at.GSW.7z

Committed `src/possession-game.json` contains **193 full possessions: CLE 96, GSW 97**, or **96.5 per team**; **144 decision windows** (the final transition to the game-over state is not a playing window). The independent box formula `FGA + .44*FTA - ORB + TOV` gives **98.94** per team, so 193 is within 2.5% of twice that approximate pace. The .44 formula is an estimate, not an exact possession-count oracle. Different period-end/FT definitions can move the count.

Exact final score: **CLE 83–GSW 89**. Independent totals: CLE 95 FGA / 25 FTA / 17 ORB / 11 TOV; GSW 78 / 27 / 8 / 16. All **25 player offensive rebounds** remain within possessions, plus **7 awarded team offensive continuations**. Team and player score totals reconcile. The previous tracking validation remains in `data/validation.json`: 63,908 deduplicated frames, 955 inferred holds, 404 inferred passes, 155/173 temporal shot matches (89.6%), 22/22 box-score player FGA/FG/points matches. These are alignment/box checks, not independent pass-accuracy measurements.

### Estimated (估計)

- **Play-type distributions were not obtained as actual team Synergy data.** A 2015–16 `stats.nba.com/stats/synergyplaytypes` request timed out; the public NBA ball-handler page was reachable, but no historical statistical table was obtained. The seven play-type priors in `PLAY_TYPES` are explicit illustrative league-typical estimates, shared by both teams, not fabricated CLE/GSW measurements.
- Each prior includes non-turnover **0/1/2/3/4-point** probabilities, turnover probability, foul-rate prior and seconds. Turnovers are sampled first; foul/FT resolution, lineup efficiency, defense and clock calls then modify outcomes. The displayed prior is not a claim about final simulated empirical frequencies. Offensive rebounds repeat internally and never create a new turn.
- Lineup adjustment: usage-weighted season TS shrunk with at most eight game-shot equivalents against thirty season equivalents, then bounded. Game efficiency uses PBP points/FGA/FTA. Usage and TS are published derived metrics, labeled estimated in popovers. This is a transparent heuristic, not a causal tactical or opponent-adjusted fit. It uses the completed game/full-season data as a retrospective laboratory, not a leakage-free forecast.
- Historical play type is only a **shot-description proxy** (driving/fadeaway, hook, fast break, other); PBP does not contain Synergy labels. Monte Carlo's baseline resolves that proxy with the same estimated model, not the known actual result.
- Win probability is an **estimated logistic residual-variance approximation**, using margin, time remaining, possession advantage and bonus. Its scale is calibrated to the requested plausibility point, not fitted to a historical win-probability dataset: **up six, 1:17, ball =94.39%**. Leverage is a three-point probability swing relative to a reference swing.
- The separate Monte Carlo result is a seeded full-game rollout win fraction; it need not equal the logistic display. Paired seeds compare selected and baseline tactics; remedies rank on expected final margin, then win fraction. Remedy branches start from the first sampled representative risk state, not a conditional average. Small ranking differences may be sampling noise.
- Shot clocks between PBP events are inferred, not authoritative tracking clocks. Timeout budget starts at eight regulation allocations, subtracts charged full/short timeouts, and resets to two in OT; expiration/conversion rules and TV timeouts are not fully modeled. Hence remaining timeout budgets are explicitly estimated. Replay personal/team foul counts derive from PBP; bonus derives from NBA quarter/last-two-minute thresholds.
- Defense coefficients, seconds, rebound probabilities, FT rebound simplification, bench availability and simulated matchups are estimated. No injuries, fatigue, challenge/review simulation, or full NBA special-case officiating. Simulated shooting/bonus FT trips terminate with a defensive change of control; their offensive-FT-rebound rate is not separately modeled.

## SportVU is replay detail only

Expand **SportVU 實際回合重播** and step the actual hold-start snapshots/pass chain for that possession. These controls never execute a decision, change a score, advance a turn or create a branch. Missing tracking is shown as missing, never filled as actual. Coordinates/nearest-player control are algorithmically inferred from 25 Hz data (3 ft radius, ball below 7.5 ft, at least four samples, gap bridge up to .64 s), not manually labeled possession truth. Tracking is not displayed as invented coordinates on simulated branches. Real key moments use possession/window boundaries; the old 1:17 Smith hold belongs to the **1:19 CLE possession at 77–83**.

## Offline regeneration

Compact JSON is committed; normal play never fetches external data. Raw downloads are ignored.

```sh
python3 -m pip install --user py7zr
python3 preprocess_tracking.py --download
# Fetch both season pages above into data/raw/CLE-2016.html and GSW-2016.html.
python3 preprocess_possessions.py
# Font generation only:
python3 -m pip install --user fonttools brotli
python3 subset_fonts.py /path/to/NotoSansTC.ttf /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
```

`preprocess_possessions.py` needs only stdlib and the tracking/PBP/box/season outputs. It preserves chronological CSV order rather than sorting only EVENTNUM (the feed contains same-clock reorderings). It checks period closure, substitution consistency and independent box totals. Tests include synthetic offensive/team rebounds, and-ones and non-final FT placeholders, dead-ball coverage, exact historical replay, safe persistence, managerial resource errors, distributions, paired risk rankings, a seeded 100-game invariant sweep including OT, server grounding/fallback/allowlist and font coverage. Browser verification exercises the actual rendered controls and full historical/alternative playthrough.

## Server, fonts and licenses

The allowlisted Python server is the only Claude caller. Rule arguments remain available without a key or on upstream/validation failure. Numeric grounding rejects invented numbers, and output is constrained to bundled-font vocabulary. Anthropic structured schema uses array minItems=1; local validation enforces counts. The source archive's MIT notice is retained in `data/SOURCE-LICENSE.txt`; it is not a blanket license grant for NBA tracking, PBP or Basketball Reference content. Respect upstream terms. Bundled Noto TC subsets retain OFL; arrow glyphs use DejaVu and its retained license.
