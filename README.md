# Courtside — tracking replay and strategy branches

A Traditional Chinese browser prototype for **2015-12-25 Cleveland at Golden State** (game `0021500438`, final CLE 83–GSW 89). Following HS-BaseSta / HS-Mahjong: deterministic state transitions, evidence-tagged arguments, distributions, leverage, risk/remedy branches, a Monte Carlo worker, and local branch/undo/autosave. No build step or browser dependencies; Python stdlib serves ES modules and an optional Claude rewrite endpoint.

## Run and test

```sh
source ~/.nvm/nvm.sh
npm run check && npm test
python3 server.py                 # http://localhost:3000
```

Tests include a complete historical replay, a seeded **100-full-game** simulation sweep (pass changes handler and ends a hold; legal score increases, monotone clocks, overtime and decisive finals), branch persistence, evidence/Monte Carlo reproducibility, HTTP security, Claude fallbacks/number validation, and bundled font coverage. Browser verifier: `node verify/browser.mjs` (uses Playwright from the neighboring HS-BaseSta repository).

## Sources and reproduction

- SportVU archive: [neilmj/BasketballData](https://github.com/neilmj/BasketballData), `data/2016.NBA.Raw.SportVU.Game.Logs/12.25.2015.CLE.at.GSW.7z`; usable [Neil Seward mirror](https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/12.25.2015.CLE.at.GSW.7z).
- [Same-game play-by-play CSV](https://raw.githubusercontent.com/sealneaward/nba-movement-data/master/data/events/0021500438.csv), including made/missed shots, free throws, rebounds, turnovers/steals, fouls and period ends.
- Independent [Basketball Reference box score](https://www.basketball-reference.com/boxscores/201512250GSW.html), checking each active player's FGA, FGM and points and both teams' totals.
- The archive's MIT notice is retained in `data/SOURCE-LICENSE.txt`. This preserves the repository license, not a claim to ownership of NBA/SportVU data or a separate NBA commercial-data license. Check upstream and NBA/provider terms before redistribution/commercial use. Fonts have their own bundled OFL/DejaVu notices.

Committed `src/tracking-game.json` contains compact holds, snapshots, PBP, chronological replay nodes, player distributions, source hashes and validation; the browser never downloads raw tracking. Raw archives/HTML/CSV/JSON are ignored.

```sh
python3 -m pip install --user py7zr
python3 preprocess_tracking.py --download
# Subsequent offline runs, using data/raw/{0021500438.json,pbp.csv,box.html}:
python3 preprocess_tracking.py
```

Python stdlib plus **py7zr only for extraction**; alternatively extract the archive with the 7z CLI to `data/raw/0021500438.json`. Network failures are errors, never silent substitution of another game. A downloaded raw archive can be hundreds of MB; allow memory for parsing and deduplication.

### Control and alignment, not manual ground truth

Deduplicate overlapping event windows by period and 25 Hz game-clock frame. A controller is the nearest of ten tracked players within **3 feet**, ball height at most **7.5 feet**. Keep runs with at least **4 frames / 0.12 seconds** and bridge same-owner gaps at most **0.64 seconds**. Different teammate controls separated by at most **2 seconds**, with no intervening PBP shot/FT/rebound/turnover/foul/period boundary, infer a pass. Cross-team changes without a PBP turnover remain **unclassified changes**, not invented steals. Other gaps stay unresolved. Court sides are inferred from the majority of matched shot endpoints per team/quarter; zones include backcourt.

Assign PBP shots/turnovers/fouls to the same player's nearest unmatched hold end in the same quarter, from **0.4 seconds before to 5 seconds after** that end. Store the offset and PBP ID. Flight, timing granularity, dead balls, short touches and control ambiguity mean this heuristic can mislabel events. Unmatched PBP is retained as separate replay nodes, so no missing shot/FT disappears from the score. Stable CSV order for equal-clock events matters: NBA event numbers are not always causal order (e.g. rebound/make at Q2 0:41).

Current `data/validation.json`:

| Check | Result |
|---|---:|
| Deduplicated tracking frames | 63,908 |
| Inferred holds | 955 |
| Inferred passes | 404 |
| PBP field-goal attempts | 173 |
| Shot-to-hold temporal matches | 155 / 173 = **89.60%** |
| Active player FGA/FGM/PTS vs independent box | **22 / 22 = 100%** |
| Team points vs independent box | **83–89, exact** |

**89.60% is temporal tracking coverage, not a validated pass-detection accuracy.** Box equality validates PBP totals; it does not validate every tracking-inferred controller or shot location. No annotated pass ground truth is available. Shot cells use aligned release-zone estimates and nearest-defender distance at hold start, not exact release-time contest distance. Three-point shot labels come from PBP. All unmatched shots remain in FGA/FGM totals but not location cells.

## Interaction and modeling

One decision is one player's hold. **Replay actual choice** advances chronological holds/PBP without randomness. The start is the first reliable tracked control, not an invented opening tip snapshot. Court markers use the ten observed start coordinates; PBP-only nodes explicitly identify their preceding snapshot. Situation tabs select actual late-fourth-quarter tracking nodes around cited PBP moments.

Choose another named pass, shoot, drive or reset to fork into **simulation**. The real replay node is automatically saved; undo/branch/reload remain local. Once forked, future actual scores and substitutions are never reapplied. Simulated positions are labeled schematic estimates. Historical pass transitions use observed receivers; simulated passes can fail or hit a clock boundary, but always finish the hold and change handler. Lineups in a simulated branch remain the anchor lineup; no invented injuries/stamina/substitution model remains.

**實際** means source-observed counts/coordinates or explicitly tracking-inferred counts: hold-duration samples, pass targets/shares, per-zone choices, PBP FGA/FGM/FT/turnovers. **估計** means modeled values:

- Shot FG in zone × defender-distance cells (`<4`, `4–6`, `≥6` ft) shrinks toward that team's game-wide FG: `(made + 10 × team FG)/(attempts + 10)`. Empty cells use the prior. This simple prior does not represent calibrated shot quality.
- Turnover rate shrinks with ten holds toward the team's turnovers/holds. FT uses ten attempts at a 0.75 prior. Sample durations are resampled from that player's observed holds (team fallback). Action and receiver policies add small pseudocounts, preserving unseen legal actions. Drive is a move-to-rim abstraction, not a movement physics model; rim-ending shot holds are used to infer drive choices.
- Shooting-foul probability 0.075; offensive rebound probability 0.25. Backcourt shooting uses 0.15 times the shrunk FG. These are explicitly heuristic, not measured causal effects. Simulated quarter starts and geometry are schematic. Regulation is four 12-minute periods; tied games use five-minute overtimes until decisive.
- Leverage = the estimated win-probability swing of adding three CLE points divided by its average over tracked holds. Win probability is a logistic score/time heuristic, not a historical fitted win model.
- Worker Monte Carlo uses paired seeds, rolls to final, compares the selected action with a **model of the observed action**, not its already-realized outcome. Historical fouls/unresolved changes map to reset for the baseline; this is an explicit limitation. Selected/baseline use **2,048 rollouts in the last two minutes of Q4/overtime**, otherwise 48; alternatives use up to 64 and risk remedies up to 256. Alternatives and remedies rank by **expected final point margin (original team minus opponent)**, with win rate secondary. A rare-win scenario no longer collapses the primary metric into all-zero win counts. Small differences may still be sampling noise, not evidence of causal superiority.
- Late-game policy is explicitly **estimated**, sanity-checked against the request's approximate 5–10% comeback range for CLE down six with the ball at 1:17, not fitted to a historical NBA win-probability database. The Smith stationary-shot branch gives about 6.2% at the default seed; other first actions differ. After a possession change, simulated offense advances into the frontcourt with **four additional seconds** charged against both clocks (capped by remaining clocks), rather than leaving successive handlers stranded in the old half. Hold durations otherwise still resample tracking. In the last two minutes, a leader uses resets until seven shot-clock seconds; a trailer attacks immediately (80% shoot / 20% drive when down at least four, otherwise 60% / 40%). Within 40 seconds a trailing defense intentionally fouls when down 4–9, or when a 1–3 point deficit leaves no useful clock after a full defensive possession (`clock ≤ shotClock + 2`). Each tactical foul consumes 1.5 seconds and awards two FT attempts with no further clock runoff, assuming the bonus; exact team-foul/bonus rules are not reconstructed. A one-point deficit with time for a stop does not automatically trigger fouling. These changes affect simulation only, never historical replay.
- Risk branches retain the first sample state after an empty or turnover result, then rank persistent **defensive** remedies from the original team's perspective. They are representative states, **not conditional averages over all such outcomes**. Pressure multiplies opponent FG by 0.93 but raises foul probability to 0.12; perimeter defense multiplies threes by 0.88 and other shots by 1.04; protect-rebound lowers opponent offensive rebounds to 0.18. All coefficients are estimated, not inferred treatment effects. Clicking a remedy creates that actual simulated post-risk branch. On an offensive-rebound/retained-ball risk these plans apply when that team next defends.

Only this game is used. Small samples, incomplete tracking coverage and heuristic branch behavior make this a decision-exploration prototype, **not a calibrated counterfactual forecast**.

Both pro and con cards expose evidence rows by default; either remains collapsible. The con side includes the observed shot-cell sample, estimated shrinkage prior/rate and observed turnovers.

## Optional Claude and fonts

Start the server with `ANTHROPIC_API_KEY` supplied in its environment; never put keys into source or browser storage. `/api/analyze` returns HTTP 200 on rule fallback, so inspect `source` (`Claude` vs `規則引擎`). Supplied evidence numbers are the whitelist: rewritten numbers (including Chinese numerals/percentages), vocabulary, text lengths and bundled glyphs are validated locally. The Anthropic schema uses array `minItems: 1`; local validators enforce count limits. Without a key/upstream success, the same rule arguments remain available. Static serving is allowlisted and raw data/secrets are not served.

Regenerate fonts after UI/data-copy changes (fonttools required):

```sh
python3 subset_fonts.py /path/to/NotoSansTC-variable.ttf /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
```

Subset character collection includes source UI strings and tracked player names. CSS content hashes invalidate old font caches.
