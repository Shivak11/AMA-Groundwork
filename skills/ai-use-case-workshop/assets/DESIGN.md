# Our AI Use-Case Portfolio

This design contract is shared by the conversation's optional activity views, its previews and every PDF checkpoint. The portfolio belongs to the group. Its visual hierarchy should make the group's problem, evidence, disagreements and proposed decisions easy to find.

## Direction

Keep the Terracotta direction selected by Shiva: warm paper, brown serif headings and a functional clay accent. Use the cover's title as the strongest visual element. Interior structure follows the work: a sequence for the difficult case, cards for distinct candidates and a table for their comparison. Do not turn every answer into the same card.

The first page says `Our AI Use-Case Portfolio`, followed by the group name, its members and the problem in their own words. Context and date are secondary. Show the six phases and their actual approval state without scoring the group. A later revision must not appear to be an agreed final answer.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Ground | `#F3E9D8` | Preview background and quiet comparison areas. |
| Paper | `#F8F0E4` | Cover and meaningful emphasis. |
| Ink | `#3A241C` | Headings, body text and strong borders. |
| Muted | `#6F5A4E` | Secondary descriptions and dates. |
| Clay | `#C56A3C` | Rules and non-text accents. |
| Functional clay | `#9B4625` | Links, focus indicators and important status text. |
| White | `#FFFFFF` | Interior pages and editable surfaces. |
| Rule | `#BCA48E` | Dividers; do not rely on a divider alone to identify an input. |

Functional clay has 6.37:1 contrast on white and 5.63:1 on paper. Clay is unsuitable for small text or white button text. Controls use ink or functional clay borders with visible focus.

DM Serif Display regular, locally embedded, carries titles and chapter headings. Use the system sans-serif stack for answers, labels and tables. Never synthesise a bold display face or use italics. The licensed font and its unmodified OFL are in `fonts/`.

## Layout and hierarchy

The PDF uses A4 portrait with 16 mm side margins. Each completed phase begins a chapter on a new page; long answers continue naturally. Body text is 10.5 pt with 1.45 line spacing. Do not shrink the type or truncate answers to force seven pages. The usual short version is a cover followed by six chapters, but content determines the final page count.

Chapter headings state the question and include their actual phase number. No eyebrow, kicker, decorative tag, all-capital label or introductory framework panel is added. One highlighted answer may establish the chapter's main decision; supporting evidence uses plain sections with whitespace and restrained rules.

The case replay uses a numbered vertical chronology with the actor, work and friction at the same step. Candidates identify their attached workflow steps. Priorities show the group's decision alongside its reason and missing evidence; colours never imply an AI-assigned quality score. The final recommendation gives the proposed owner and a stop rule equal clarity to the intended benefit.

Every page has `Prepared by Dr. Shiva Kakkar` and a working profile link with a visible access signifier. Page numbers are a PDF export feature. The cover includes the same authorship independently of the repeating footer.

## State and interaction

Optional MCP Apps views use the same group record as the conversation and PDF. They do not create a separate workflow or quietly save answers in browser storage. Controls name the action they cause; edits remain visibly pending until the host returns the updated record. Use revision-labelled messages for changes and explain how to continue through chat if a view cannot load.

Never gate a phase behind a widget. The entire exercise, corrections, approval, progress and downloads must work through plain-language questions, numbered choices and readable summaries. A PDF is shown as generated only after the renderer returns its bytes. Errors preserve the previous approved record and name a retry action.

Confirmed chapters are included. Chapters marked `needs_review` are included with the visible sentence `This phase needs your review because an earlier answer changed.` Draft chapters are omitted. The cover's progress makes this distinction explicit. A blank value is shown as `Not recorded`; an explicit `Unknown` stays as entered.

## Content

Use the group's own approved words. Never insert private recording details, prompt logic, citations to the facilitator's internal source ledger, company assumptions or an invented baseline. Do not infer agreement from a model suggestion. Show uncertainty and a group's decision not to pilot AI as normal outcomes.

Write connected, plain Indian-English sentences. No slogans, metaphors, dramatic contrast, repetitive label layers or motivational summaries belong in the portfolio. A short field label is functional; a decorative line describing the document is unnecessary.

## Accessibility and export checks

Keep headings in order, native tables with column headers and visible underlined links. Optional controls must have labels, keyboard focus and touch targets of at least 44 px. Reflow previews and views at 320 px; comparison structures may become vertical but must retain their field names. There is no automatic motion.

Escape every group-provided string before HTML insertion. No answers become HTML, CSS, URLs or scripts. Embed fonts locally and block network requests during rendering. Wait for the font before printing, set timeouts and close the browser on failure.

For each release, inspect the rendered cover, timeline, candidates, priorities and final page. Test long answers and unbroken strings. Verify A4 dimensions, selectable text, actual PDF bytes and profile-link annotations on every page. Export and interface tests do not establish usability with real participants or compatibility with an untested chat client.
