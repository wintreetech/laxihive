# Game access and pricing

## Published behavior

The upgrade seeds 20 FREE_FULL starter configurations and review drafts. It does not publish paid starter prices. All existing permanent entitlements and pricing records are preserved. Seeding is repeatable and does not overwrite published settings, existing drafts, store rates or expansion ownership.

Supported access types:

| Type                 | Billing unit                             | Preview                                            |
| -------------------- | ---------------------------------------- | -------------------------------------------------- |
| FREE_FULL            | Complete attempt, zero coins             | Not needed; normal rewards remain                  |
| FREE_TRIAL_THEN_PAID | One explicitly purchased full attempt    | Configurable practice period, initially 30 seconds |
| PAID_FROM_START      | One explicitly purchased full attempt    | None                                               |
| PREMIUM_SESSION      | One explicitly purchased premium attempt | None                                               |
| PERMANENT_UNLOCK     | Existing advanced expansion ownership    | No repeated session deduction for owners           |

Each game/mode configuration stores access type, price, trial duration, full-attempt time limit, active state, published version, draft and publication timestamp. Modes match the actual engine: starter for every game and advanced for the five existing expansions. The existing Game visibility setting controls publication of the game itself.

## Recommendations awaiting administrator review

These are business proposals, not activated prices or measured customer-duration claims. No merchant fees, retention data or operating-cost forecast was supplied; margins must be reviewed before selecting final prices.

| Game             | Proposed starter access | Coins / attempt | Reason                                               |
| ---------------- | ----------------------- | --------------: | ---------------------------------------------------- |
| Hive Quest       | Trial then paid         |              50 | Campaign board; preview restarts into a full attempt |
| Orbit Recall     | Trial then paid         |              50 | Growing memory sequence                              |
| Number Rush      | Free full               |               0 | Quick discovery game                                 |
| Daily Hive       | Free full               |               0 | Daily habit                                          |
| Word Scramble    | Paid from start         |              25 | Often too short for a 30-second preview              |
| Word Guess       | Trial then paid         |              50 | Multi-guess puzzle                                   |
| Memory Match     | Trial then paid         |              50 | Full matching board                                  |
| Word Search      | Trial then paid         |              25 | Entry-level grid                                     |
| Letter Rescue    | Paid from start         |              25 | Short single-word challenge                          |
| Word Ladder      | Trial then paid         |              50 | Multi-step puzzle                                    |
| Missing Letters  | Paid from start         |              25 | Preview could reveal the complete puzzle             |
| Synonym Match    | Paid from start         |              25 | Four short pairs                                     |
| Odd One Out      | Paid from start         |              25 | Five short questions                                 |
| Category Shuffle | Trial then paid         |              50 | Grouping puzzle                                      |
| Number Trail     | Free full               |               0 | Retain free while mechanics overlap Number Rush      |
| Code Breaker     | Trial then paid         |              75 | Longer deduction challenge                           |
| Word Blitz       | Premium session         |              75 | Whole 90-second challenge                            |
| Sequence Surge   | Paid from start         |              50 | Five short patterns                                  |
| Hive Lock        | Trial then paid         |              75 | Spatial puzzle                                       |
| Slide Rush       | Trial then paid         |             100 | Extended spatial tier for review                     |

The five existing permanent advanced expansions start at their existing 500-coin price. Owners retain advanced access if a later advanced session price is published. Availability can still be disabled by an administrator; ownership is not erased.

## Publishing

Open Admin > Game pricing. Select the access type, exact price, preview seconds and full-attempt time limit, and enter a reason. Save unpublished draft to review later. Select Publish this mode and explicitly confirm to activate it for future sessions. Review audit history by searching `game.pricing` in Audit logs.

A session price is snapshotted when its request is created. The customer must confirm that exact price/version. Publishing a later price does not change existing requests or authorizations. Session offers expire after 30 minutes. Full attempts use at most the engine's supported limit: 90 seconds for Word Blitz, otherwise 600 seconds.

## Rewards

Score is performance; XP advances account level; coins are spendable balance; Hive Quest stars track campaign quality. Eligible full-game wins award 40 XP, at most 20 rewarded wins per UTC day; Daily Hive awards XP once daily. Six existing achievements award 25 coins each once, at most 150 under the configured catalog. Previews award none. Paid and advanced scores are excluded from competitive leaderboards. Repeat wins never produce unlimited coins.

Small fixed question/word pools and overlapping Number Rush/Number Trail mechanics remain intentional follow-up content work. This release corrects instructions without replacing the proven game engine.
