# Product Hunt Launch Kit — Signals

Everything you need to paste into Product Hunt's submission form. Written to match how the app already talks about itself — no invented metrics, no fake testimonials, no claims the product can't back up yet.

## Name

**Signals**

Heads up: "Signals" is a very common name on Product Hunt (there have been several unrelated launches with this exact name or close variants). Two options:
- Launch as-is — it's your real product name, and PH allows duplicate names.
- Consider a more specific variant just for the PH listing, e.g. **"Signals — NSE Swing Setups"** or **"Signals for Indian Swing Traders"**, so it's distinguishable in PH search/browse. Purely a discoverability call, not a product rename.

## Tagline (60 characters max)

Pick one:
- `Swing setups for NSE large-caps — entry, target, stop.` (56 chars)
- `One clean swing signal a night. Nothing else to guess.` (55 chars)
- `Nightly swing setups on Indian large-caps, no noise.` (53 chars)

## Description (short, ~260 characters — shows in listings/search)

> A nightly scan surfaces high-conviction swing setups on Indian large-caps. Every signal is one clean card — entry, target, stop — reviewed before it publishes, never auto-blasted. Built solo out of my own trading, now open for early access.

## Topics / Categories

Suggested (pick up to 3 on PH):
- Fintech
- Stock Trading
- Productivity (if you want broader reach beyond finance-only audiences)

## First comment (post as the maker immediately after your listing goes live)

> Hey Product Hunt 👋
>
> I'm Prasoon, and I built Signals to solve a problem I kept running into in my own trading: too many indicators, too much conflicting noise, and no clean, repeatable way to act on a swing setup once I'd found one.
>
> Signals runs a nightly scan across NSE large-caps and flags setups that match a defined technical pattern. Only setups that match a known, pre-mapped scan go live automatically — anything the system doesn't recognize gets queued for manual review instead of being guessed at. Every published signal shows up as one clean card: symbol, entry, target, stop. Nothing else to interpret.
>
> A few things I want to be upfront about, since I'd rather say this plainly than have you find out later:
> - **This is early.** It's a solo project, still in public dry-run — everything is free right now, no card required.
> - **There's no backtested win rate to show yet.** Every signal posted publicly gets logged the moment it's made, and the running track record — wins and losses both — is visible right in the dashboard. No cherry-picking, nothing quietly removed.
> - **This isn't investment advice.** I'm not a registered advisor — it's a technical setup format, and you're trading your own risk.
>
> I'd genuinely love feedback from this community — especially from anyone who trades Indian markets, or anyone who's tried (and been burned by) other signal services. What would make this actually useful to you? What's missing? Fire away in the comments, I'm here all day.

Adjust the personal details (name, exact story) if anything here doesn't match how you actually want to frame it — this is a draft grounded in what's already true about the product, not a script to read verbatim.

## Screenshot / GIF shot list

Product Hunt galleries do better with 4-6 visuals, ideally including one GIF or short screen recording. Suggested shots, in order:

1. **Hero shot** — the live ticker/marquee on `/dashboard` or `/launch`, showing a few signal cards in view (BUY/SELL/WATCH badges visible).
2. **Signal detail modal** — click a card to open it, capture the entry/target/stop breakdown plus the chart + RSI cascade view.
3. **Track record page** (`/dashboard/track-record`) — showing the T1/T2/T3 columns and live Dir badges (BUY/STOPPED/TARGET HIT). This is your strongest "we're not hiding anything" visual.
4. **Admin signal card back face** — the flip animation showing Entry/Targets/Stop (a short GIF of the hover-tilt + flip works well here if you can screen-record it).
5. **Mobile view** — the vertical ticker layout, to show it's not desktop-only.
6. *(Optional)* A short screen recording (10-15s) of scrolling the marquee and opening one card — GIFs consistently outperform static screenshots on PH for engagement.

Capture these against real (or realistic sample) data — avoid anything that looks like placeholder Lorem Ipsum or all-zero values.

## Anticipated questions (have answers ready before you launch)

| Likely comment | Honest answer to give |
|---|---|
| "Is this SEBI-registered advice?" | No — it's a technical setup format, not personalized financial advice. Not a registered advisor. |
| "What's your win rate / backtested performance?" | None to show yet — it's early. Every live call is logged publicly and tracked as it plays out; that's the track record, not a backtest. |
| "How is this different from [other signal service]?" | Be honest about what you know vs. don't — you haven't done competitive user interviews yet, so answer from the product's actual design choices (nothing auto-published blind, one consistent card format, public unfiltered track record) rather than claiming to be "better" than something you haven't directly compared. |
| "Do you use AI / ML for this?" | Answer factually based on what's actually implemented (a rules-based nightly scan + admin review, not a claimed AI model) unless that's changed. |
| "Is it free forever?" | Free during the current public dry run; paid tiers are planned but not active — say that plainly rather than promising a permanent free tier if that's not decided. |

## Launch-day checklist

- [ ] Confirm `/launch` is live and the sample ticker renders correctly before go-time.
- [ ] Swap the placeholder Product Hunt badge on `/launch` for the real embed code (Product Hunt gives you this after your post is created — see the `TODO` comment in `app/launch/page.tsx`).
- [ ] Post the first comment (above) within minutes of going live — early maker engagement matters a lot for PH ranking.
- [ ] Share the PH link from your own channels (Twitter/X, LinkedIn, any community you're already in) in the first few hours — PH's algorithm rewards early velocity.
- [ ] Reply to every comment same-day if possible.
- [ ] Route your PH traffic to `https://<your-domain>/launch` (not the bare homepage) so visitors see the PH-specific framing and FAQ.
