# Courtside — technical notes

See the [player guide (繁體中文)](../README.md) for features and local setup. This document covers the possession engine, data validation, model assumptions and developer tooling.

## Developer verification

Run these commands from the repository root. Keep the Python server running in one terminal and run the checks in another.

```sh
python3 server.py                    # http://localhost:3000; PORT overrides 3000
npm run check && npm test
node verify/browser.mjs             # Playwright from sibling HS-BaseSta/node_modules
node verify/shared-ui-browser.mjs   # desktop and 390px decision, feedback, review and tutorial screenshots
python3 verify/live-claude.py        # separately start server with environment-bound ANTHROPIC_API_KEY
```

There is no build/install step for the app. Node 22+, Python 3.10+. The browser verification scripts expect Playwright in the sibling `HS-BaseSta` checkout; some write or overwrite screenshots in `/home/ubuntu/shots/`. Never put an API key into a file, URL, frontend or repository. The API returns HTTP 200 on rule fallback: check `source === "Claude"`. `COURTSIDE_URL` can point the live verifier at a separate local key-enabled server.

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

Committed `src/possession-game.json` contains **193 full possessions: CLE 96, GSW 97**, or **96.5 per team**; **152 windows are marked for decisions**. The independent box formula `FGA + .44*FTA - ORB + TOV` gives **98.94** per team, so 193 is within 2.5% of twice that approximate pace. The .44 formula is an estimate, not an exact possession-count oracle. Different period-end/FT definitions can move the count.

Exact final score: **CLE 83–GSW 89**. Independent totals: CLE 95 FGA / 25 FTA / 17 ORB / 11 TOV; GSW 78 / 27 / 8 / 16. All **25 player offensive rebounds** remain within possessions, plus **7 awarded team offensive continuations**. Team and player score totals reconcile. The previous tracking validation remains in `data/validation.json`: 63,908 deduplicated frames, 955 inferred holds, 404 inferred passes, 155/173 temporal shot matches (89.6%), 22/22 box-score player FGA/FG/points matches. These are alignment/box checks, not independent pass-accuracy measurements.

### Estimated (估計)

- **Play-type distributions were not obtained as actual team Synergy data.** A 2015–16 `stats.nba.com/stats/synergyplaytypes` request timed out; the public NBA ball-handler page was reachable, but no historical statistical table was obtained. The seven play-type priors in `PLAY_TYPES` are explicit illustrative league-typical estimates, shared by both teams, not fabricated CLE/GSW measurements.
- Each prior includes non-turnover **0/1/2/3/4-point** probabilities, turnover probability, foul-rate prior and seconds. Turnovers are sampled first; foul/FT resolution, lineup efficiency, defense and clock calls then modify outcomes. The displayed prior is not a claim about final simulated empirical frequencies. Offensive rebounds repeat internally and never create a new turn.
- Lineup adjustment: usage-weighted season TS shrunk with at most eight game-shot equivalents against thirty season equivalents, then bounded. Game efficiency uses PBP points/FGA/FTA. Usage and TS are published derived metrics, labeled estimated in popovers. This is a transparent heuristic, not a causal tactical or opponent-adjusted fit. It uses the completed game/full-season data as a retrospective laboratory, not a leakage-free forecast.
- Historical play type is only a **shot-description proxy** (driving/fadeaway, hook, fast break, other); PBP does not contain Synergy labels. Monte Carlo's baseline resolves that proxy with the same estimated model, not the known actual result.
- Default win probability is an **estimated logistic residual-variance approximation**, using margin, time remaining, possession advantage and bonus. Its scale is calibrated to the requested plausibility point, not fitted to a historical win-probability dataset: **up six, 1:17, ball =94.39%**. The independently selectable Brownian alternative is described below. Scoreboard leverage is a three-point probability swing relative to a reference swing.
- The separate Monte Carlo result is a seeded full-game rollout win fraction; it need not equal the logistic display. Paired seeds compare selected and baseline tactics; remedies rank on expected final margin, then win fraction. Remedy branches start from the first sampled representative risk state, not a conditional average. Small ranking differences may be sampling noise.
- Shot clocks between PBP events are inferred, not authoritative tracking clocks. Timeout budget starts at eight regulation allocations, subtracts charged full/short timeouts, and resets to two in OT; expiration/conversion rules and TV timeouts are not fully modeled. Hence remaining timeout budgets are explicitly estimated. Replay personal/team foul counts derive from PBP; bonus derives from NBA quarter/last-two-minute thresholds.
- Defense coefficients, seconds, rebound probabilities, FT rebound simplification, bench availability and simulated matchups are estimated. Fatigue is modeled only in coach mode. The prototype does not model injuries, challenges/reviews, or all NBA special-case officiating. Simulated shooting/bonus FT trips terminate with a defensive change of control; their offensive-FT-rebound rate is not separately modeled.

## Switchable evaluation models

**選項估值模型** and **勝率模型（獨立）** can be changed without advancing time, changing the score, or creating a simulation branch. The default is **現行 + 現行勝率**, preserving the original distributions and logistic formula. Selections are saved with the current state, undo snapshot and branches, and survive historical auto-advance. Existing version-3 saves with no model fields remain valid and use those defaults; unknown model IDs are rejected on restore. Situation tabs retain the selected pair.

### Possession valuation

Implementation: `src/evaluation-models.js`; reproducible source inputs: `src/model-data.json` / `preprocess_models.py`.

1. **現行 — current:** existing play-type 0–4-point priors, turnover/foul priors, defense/clock modifiers and usage-weighted TS shrinkage. These are estimates, not measured Synergy outcomes.
2. **四要素 — Dean Oliver Four Factors:** `eFG=(FG+.5*3PM)/FGA`, `TOV=TOV/(FGA+.44*FTA+TOV)`, `ORB=ORB/(ORB+opponent DRB)`, **FT rate = FTM/FGA**, not FTA/FGA. The latter is retained separately as `a=FTA/FGA`. Team game factors come from the independent Christmas box score; team season factors use the exact 2015–16 team/opponent totals. These are descriptive arithmetic on **實際** published counts. A five-player lineup proxy sums each player's per-36-minute counting rates, blended **75% season / 25% game** (missing or zero-minute game data falls back to season; a missing player profile falls back to explicitly estimated typical rates). This is **估計**, not observed shared-floor lineup performance.

   A transparent estimated efficiency mapping is `PPP=(2*eFG+FT rate)/[(1+.44*a)/(1-TOV)-ORB*(1-FG/FGA)]`. For each option, its existing prior PPP is multiplied by `clamp(lineupPPP/1.05,.8,1.2)` and an option-specific factor-fit term bounded to `.85–1.15`. The fit term contrasts the option's heuristic factor weights with `.40/.25/.20/.15` and the lineup's relative deviation from `.50/.135/.25/.20` reference factors. The exact weight table is exposed in `evaluation-models.js`. Turnover probability blends the option and lineup rates equally; foul propensity scales with FT rate, bounded `.04–.35`; continuation ORB probability uses lineup ORB, bounded `.10–.40`. Thus all four factors affect actual simulated possessions as well as the comparison. These mappings/weights are **not Dean Oliver's fitted tactical coefficients**.
3. **球員影響 — plus-minus-style:** **26/26** published 2015–16 Basketball Reference **BPM** values are present in the already-downloaded public team-page advanced tables. Examples: LeBron James **8.9**, Stephen Curry **11.9**. Those *sourced published values* are labeled **實際・來源刊載 BPM**, including negative values; BPM itself is a box-score statistical model, not an observed causal effect or raw on-court plus-minus. No RPM or new RAPM regression was obtained or fitted.

   Estimated option PPP adjustment: `.005*(sum own BPM - sum opponent BPM) + .025*(usage/role-weighted own BPM - usage-weighted own BPM)`, bounded to ±`.22` points. Role weights for guards/forwards/centers vary by play type and are explicit in the module. A substitution changes both lineup strength and option fit. Missing BPM falls back to **0, 估計**; the current committed data needs no such BPM fallback. The TS boost specific to **現行** is not additionally applied in the other valuation models. PPP changes are mapped to the non-turnover distribution by transferring probability between 0 and 2 points, bounded by available probability mass; all distributions remain normalized. Remaining-FT windows use the same FT model across valuation choices, not an artificial BPM shooting bonus.

Public source pages: [CLE](https://www.basketball-reference.com/teams/CLE/2016.html), [GSW](https://www.basketball-reference.com/teams/GSW/2016.html), [game box](https://www.basketball-reference.com/boxscores/201512250GSW.html), [BPM method](https://www.basketball-reference.com/about/bpm2.html), [Four Factors definitions](https://www.basketball-reference.com/about/factors.html); conceptual reference: Dean Oliver, *Basketball on Paper*. The committed inputs include source URLs and SHA-256 hashes of the cached HTML. Player game counts reconcile to both box totals. Per-game season inputs are rounded published rates; team totals are integers. **Full-season and completed-game inputs contain information after this game's decision point: this is a retrospective laboratory, not an out-of-sample forecast.**

### Independent win probability

- **現行勝率:** `logistic(A/[.98*sqrt(max(.08,.075*t))])`, where `A=CLE margin + possession advantage (±.65) + bonus advantage (±.20)` and `t` is regulation/OT seconds left. Other-team probability is its complement; terminal wins/losses are exactly 1/0.
- **布朗運動:** a closed-form **Stern/Brownian-inspired**, zero-drift normal-tail approximation `Phi(A/sqrt(2.25*v*max(.25,2*pace*t/2880)))`. `v` is the descriptive full-possession scoring variance from this game's 193 PBP possessions (**1.19541**); pace averages this game's **96.5** with the mean of published CLE **93.3** / GSW **99.3** season pace. `2.25` is an **estimated variance inflation**, not fitted historical evidence. The normal CDF uses a standard error-function approximation. This deliberately differs from the logistic tails and is not an exact reproduction of Stern's fitted model. Late intentional fouls, future lineup changes and discrete endgame strategies are not explicitly represented in either closed form; full-game rollouts remain a separate estimate.

### Comparison, arguments and Monte Carlo

The horizontally scrollable comparison table evaluates **every available option under all 3 × 2 combinations**, including an estimated proxy for the real play (never the known historical result). Each cell shows **prior expected points, WP after, option leverage and rank**; selected-model columns and rank-one cells are highlighted. A disagreement banner appears if the sets of best play types differ. A five-line assumptions disclosure identifies each model.

Comparison expected points include turnover probability. WP after averages the chosen WP formula over the prior 0–4 outcomes after estimated elapsed time and a control transfer, respecting period/final boundaries; option leverage is the mean absolute WP swing divided by `.055`. **These are quick prior projections**, not the empirical distribution after extra foul/FT and offensive-rebound resolution. The table says so. The simulation engine handles those additional events, so its sampled expected points need not equal the table.

Selected valuation changes drive all simulated possessions, including baseline and risk-remedy rollouts; selected WP drives the scoreboard, leverage, argument facts and the displayed **first-possession-after WP mean** sampled by Monte Carlo. The original **full-game win fraction** and expected final margin are retained, explicitly distinguished from that WP mean: changing only the closed-form WP selector cannot change actual final-game win counts under identical seeds. Remedies continue to rank by expected final margin, then full-game win fraction, and also show the selected WP estimate. They preserve both model IDs when opened as branches. Both argument sides retain evidence rows; Four Factors adds team/lineup factors and impact adds sourced player BPM. Claude receives selected-model facts **and rounded numbers from the selected comparison column only**, allowing valid rewritten model numbers while still rejecting invented ones, without silently borrowing another model's numbers. Tests cover the numeric/vocabulary validator and live verification uses the new model facts.

## Coach segment mode (default)

The fixed status strip always shows win probability for the selected team. 「驗證本單」 keeps only the current choice, recommendation and baseline visible; the other models and evidence are opt-in. Coach previews use 12 paired samples per simulated plan and show the 10th–90th percentile of segment-end model estimates. Possession previews use the analytic prior; explicit rollouts use full-game win counts with Wilson intervals. Both modes have a two-minute beginner case, decision feedback and a separate final review.

The persisted **區段教練** / **逐回合** switch keeps the existing possession engine and all its options intact. Choose CLE or GSW in coach mode. The first phase is **eight coach segments**, computed deterministically at load from the committed PBP windows: preserve quarter starts, then select the historical timeout furthest from existing boundaries, requiring at least 120 seconds from its neighbours. Unselected timeouts merge into the surrounding segment; no new official timeout is invented. A segment ends at a complete-possession/PBP boundary, not at an arbitrary interrupted live play. Simulation finishes the possession crossing the chosen boundary, so its endpoint can differ by seconds from the exact historical endpoint.

In Q4/OT's last 120 seconds, the second phase stops for the managed team's offensive possessions and also its defensive possessions **when trailing**. Other possessions automatically advance. Historical totals are **CLE 22 / GSW 15**: CLE remains behind throughout all 14 final-two-minute possessions, so the required eight coach segments plus all required defensive/offensive stops cannot fit a strict 20-stop cap. This preserves the specified stop rule rather than hiding defensive choices to meet the approximate target. The historical phase begins at the first complete possession starting within 120 seconds (**1:50 Q4**). Every last-two-minute possession is still resolved by the unchanged engine, including its pending free throws and offensive rebound rules. OT's first three minutes run as one coach segment, then use the same selective final-two-minute policy.

Coach levers apply only to the managed team; the opponent follows its default policy. Five selected eligible players replace the lineup at the coach boundary; foul-outs are still automatically replaced. **慢 / 正常 / 推進** multiply managed offensive duration by **1.35 / 1 / .65** and change transition weight **.04 / .16 / .45** before normalization with other play weights. These are illustrative estimates, not measured coach effects. Targeting an opposing guard increases post/iso weight; targeting a forward/center increases PnR/iso. The PPP shift is `.012*(mean opposing lineup BPM - target BPM)`, capped at ±.08, transferred between 0/2-point mass. **Published BPM is sourced; treating it as a defender weakness is explicitly an estimated proxy, not defensive RPM, a measured matchup, or causal evidence.** Targeting a strong defender can hurt value. The target must be on court, and an automatic opponent substitution invalidates it. Fatigue is estimated accumulated on-court seconds (bench recovery .7×), with offensive PPP penalty capped at .06; it is not SportVU workload. Timeout use consumes the resource once and grants no unexplained shooting boost.

**沿歷史區段重播** uses real segment-end score/resources and produces the exact 83–89 final. **執行教練策略** forks permanently and automatically resolves possessions through `simulatePossession`. Paired-seed segment Monte Carlo shows expected segment points, **change in managed-team point margin**, end-segment WP under the independently selected WP model, 10/50/90 percentiles and a margin histogram. The actual historical end score is labeled actual; its formula-based WP remains estimated. For an already-divergent branch it is explicitly a historical reference with a different start, not a causal comparison or an alternate replay. The six-model table reuses the comparison renderer, but its cells are **whole-segment sampled values**, not single-possession priors. Three tempo alternatives are ranked using common seeds; its small quick sample can be noisy. Four scheme remedies are **ex-ante segment alternatives**, not conditional post-risk trajectories. Their ordering is estimated segment margin; negative segment-margin frequency is the displayed risk. Both argument cards contain source-tagged rows. Segment values and percentiles flow through the existing Claude numeric/vocabulary validator; no relaxed numeric validation is introduced.

`tests/segments.test.js` covers schedule construction, exact historical score, managed-team stop rules, tempo/target effects, persistence/mode isolation, finite model comparisons and a seeded 50-game segment sweep including explicit OT. `COURTSIDE_URL=http://localhost:3107 node verify/segments-browser.mjs` exercises both historical team paths, strategy execution, controls, models, worker/remedies, branches, undo, reload and mobile. The existing verifier now explicitly selects possession mode and accepts the same `COURTSIDE_URL` environment override.

## SportVU is replay detail only

Expand **SportVU 實際回合重播** and step the actual hold-start snapshots/pass chain for that possession. These controls never execute a decision, change a score, advance a turn or create a branch. Missing tracking is shown as missing, never filled as actual. Coordinates/nearest-player control are algorithmically inferred from 25 Hz data (3 ft radius, ball below 7.5 ft, at least four samples, gap bridge up to .64 s), not manually labeled possession truth. Tracking is not displayed as invented coordinates on simulated branches. Real key moments use possession/window boundaries; the old 1:17 Smith hold belongs to the **1:19 CLE possession at 77–83**.

## Offline regeneration

Compact JSON is committed; normal play never fetches external data. Raw downloads are ignored.

```sh
python3 -m pip install --user py7zr
python3 preprocess_tracking.py --download
# Fetch both season pages above into data/raw/CLE-2016.html and GSW-2016.html.
python3 preprocess_possessions.py
python3 preprocess_models.py        # cached box + season HTML; stdlib only
# Or refresh the two public season pages first:
# python3 preprocess_models.py --download
# Font generation only:
python3 -m pip install --user fonttools brotli
python3 subset_fonts.py /path/to/NotoSansTC.ttf /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
```

`preprocess_possessions.py` needs only stdlib and the tracking/PBP/box/season outputs. It preserves chronological CSV order rather than sorting only EVENTNUM (the feed contains same-clock reorderings). It checks period closure, substitution consistency and independent box totals. Tests include synthetic offensive/team rebounds, and-ones and non-final FT placeholders, dead-ball coverage, exact historical replay, safe persistence, managerial resource errors, distributions, paired risk rankings, a seeded 100-game invariant sweep including OT, server grounding/fallback/allowlist and font coverage. Browser verification exercises the actual rendered controls and full historical/alternative playthrough.

## Server, fonts and licenses

The allowlisted Python server is the only Claude caller. Rule arguments remain available without a key or on upstream/validation failure. Numeric grounding rejects invented numbers, and output is constrained to bundled-font vocabulary. Anthropic structured schema uses array minItems=1; local validation enforces counts. The source archive's MIT notice is retained in `data/SOURCE-LICENSE.txt`; it is not a blanket license grant for NBA tracking, PBP or Basketball Reference content. Respect upstream terms. Bundled Noto TC subsets retain OFL; arrow glyphs use DejaVu and its retained license.
