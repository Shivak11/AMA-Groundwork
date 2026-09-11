# Inline workshop conversation concept

Open `dist/index.html` after building. It is self-contained, works offline and makes no network requests. The review copy puts this file at its root as `index.html`.

This is a deliberately scripted hiring example for interaction review, not an MCP host, a general-purpose chatbot or a connected model. It does not overwrite the live connector. Choices and notes remain in page memory until refresh; there is no resume promise. Notes are retained literally in the book and do not cause a generated reply.

## What to try

Choose a measure, identify a gap, click a task in the journey, compare a use case, choose the next priority and finish the recommendation. Open the small book after any confirmed step. The final screen lets you name it and add group members. Print / save PDF invokes the browser print dialogue. No PDF service is contacted.

Earlier answers can be reopened. Cancel edit restores the complete previous state; confirming a replacement clears later answers so unsupported conclusions are not retained.

## Design and implementation

The React skill informed explicit state unions and the pure reducer. Design of Everyday Things informed one visible decision, choice feedback, cancellable edits and focus recovery. The frontend taste skill was applied only to restraint, hierarchy and visual inspection because its marketing-page scope does not fit this product interaction. No external imagery is needed: diagrams encode the work and decisions.

The MCP Apps skill informed the boundary between a review harness and a real host integration. This concept does not call MCP tools. A later approved integration must connect the same interaction to the existing authoritative server record via the App bridge, register handlers before connection, consume host theme/context, preserve text fallback and treat asynchronous tool/PDF failures independently. A pinned side artifact is host-dependent and remains unproved here. Do not show the scripted prototype as a working Claude or ChatGPT connector.

## Build and checks

Run `npm ci`, `npm run typecheck`, `npm test` and `npm run build` in this directory. React and its typings were installed through npm; the lockfile pins the resolved versions. `verify.mjs` exercises the browser and captures screenshots/PDF. Its Playwright import and Chromium binary point to the verified local environment; adapt these two explicit paths on another machine.

Reducer checks cover all three priority routes and every resulting final option, including no-AI recommendations. Browser checks cover the six-step process-first route, note preservation, cancellable earlier edits, desktop dialog focus restoration, narrow layouts, a 600-character unbroken note, dark mode and console errors. Actual ChatGPT/Claude interaction is not tested by this harness.

The generated example book has seven A4 pages with selectable text: cover and Steps1 through6. Each interior page links to the author's profile. Inspect stored screenshots and PDF previews separately from behavioural checks. These are concept checks, not classroom usability evidence or live connector PDF checks.
