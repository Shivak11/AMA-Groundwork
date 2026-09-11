# Source ledger

## Question ownership correction, 11 September 2026

Shiva's screenshot shows the MCP view asking for a success measure while a host-native question card asks a separate question. The deployed source independently confirms conflicting instructions: UI-mode tool results and app context updates both told the model to ask again. Version 0.3.1 removes those duplicate commands, returns an explicit question owner, and pauses the view on chat handoff. The image and its private conversation were not copied into the public connector. Automated protocol/browser checks do not establish host-model compliance.

## Visual revision reviewed on 11 September 2026

The current candidate implements Shiva's approved conversation/activity/book model. The fictional hiring example in examples/hiring.mjs carries the CV-to-approved-offer journey through all six steps; it contains no real applicant or client data. It retains human selection, compensation and release authority, an unknown baseline, a manual comparator and the limit of retrospective evidence.

The [official MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview) and the installed ext-apps 1.7.5 source establish tool calls, host-context updates and sandboxed views. Actual support for pinning, updates and downloads remains host-specific and must be tested separately.

[pdfcn documentation](https://www.pdfcn.dev/docs) and its [KeyValue component](https://www.pdfcn.dev/docs/components/takumi/key-value) informed the review of composed document components. The raw registry payload was not inspectable and no pdfcn code or dependency was installed. Mermaid, React Flow and tldraw were considered; the candidate uses bundled custom HTML/SVG because these guided decisions do not require a free-form editor or another service.

The earlier evidence below describes the original release and its foundations. It is not deployment evidence for this revision.

Reviewed on 8 September 2026. This records the method's provenance, not proof that participants' proposed use cases work.

| Material | Use in this package | Evidence boundary |
| --- | --- | --- |
| Existing Hyundai Mobis six-phase workbook, content and Terracotta contract | Six questions, short group record, human judgement, explicit uncertainty and visual continuity. | Client facts and recording metadata were not copied. |
| Existing Four-Gate GenAI Opportunity Lab sourcebook and research notes, dated 1–2 August 2026 | Difficult-case replay, connected workflow changes, work decomposition, coordination and effort accounting. | This was a bounded recap of the existing synthesis, not a fresh full-text book review. |
| Existing GenAI Transformation Consultant foundations | Prediction Machines; Power and Prediction; Reinventing Jobs; explicit human authority and accountability. | The lengthy consulting approval and investment gates were deliberately omitted. |
| Don Norman, The Design of Everyday Things, through the installed design skill | Discoverability, visible state, mapping and error recovery. | Design guidance; no claim of measured classroom usability. |
| Local Terracotta design and DM Serif Display font | Stable document and activity styling. | The unmodified font and OFL are packaged. |
| Installed MCP server 2.0.0 and MCP Apps SDK 1.7.5 documentation | Tools, resources, capability detection and embedded-resource downloads. | Local protocol tests do not establish a successful ChatGPT or Claude journey. |
| Prefab official documentation and installed prefab-ui 0.20.2 | Additive, developer-authored shortlist UI using the same workbook record. | Installed envelope and renderer take precedence over stale examples. |

The book foundations and adaptations are documented in `skills/ai-use-case-workshop/references/foundations.md`. TRACE, the zero-second test and the six-phase sequence are workshop synthesis by Dr. Shiva Kakkar, not frameworks attributed to the book authors or NIST.

Primary implementation references: [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview), [Prefab documentation index](https://prefab.prefect.io/docs/llms.txt), [installation](https://prefab.prefect.io/docs/getting-started/installation), [protocol](https://prefab.prefect.io/docs/protocol/overview), [FastMCP integration](https://prefab.prefect.io/docs/running/fastmcp) and [themes](https://prefab.prefect.io/docs/styling/themes). No external claim about AI-project failure rates was added to this generic exercise.
