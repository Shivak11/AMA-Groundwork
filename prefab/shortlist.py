"""One Prefab comparison exercise. The conversation owns every saved answer."""

import base64
import json
from pathlib import Path
import re
import sys

from prefab_ui import __version__
from prefab_ui.app import PrefabApp
from prefab_ui.actions import SetState, ShowToast
from prefab_ui.actions.mcp import SendMessage
from prefab_ui.components import (
    Accordion, AccordionItem, Button, Card, Column, Div, Field, Heading,
    Label, Select, SelectOption, Text, Textarea,
)
from prefab_ui.components.control_flow import If
from prefab_ui.renderer import get_renderer_html
from prefab_ui.rx import Rx
from prefab_ui.themes import Theme

ROOT = Path(__file__).resolve().parent.parent
PHASE_TITLES = {
    1: "What should improve?", 2: "What prevents progress?",
    3: "What actually happens?", 4: "Where could AI help?",
    5: "Which should we pursue first?", 6: "What do we recommend?",
}
PREFIX = (
    'Group: {{ groupName }}. Record revision: {{ revision }}. '
    'Apply this request only to the latest record with the same group name and revision. '
    'If it is stale, show the differences and ask the group to reconfirm before changing anything. '
    'Use the existing workshop tools; the interface has not saved or confirmed anything.\n\n'
)


def request(content):
    return SendMessage(
        PREFIX + content,
        on_success=[
            SetState("pending", True),
            SetState("notice", "Your request was sent to the conversation. Wait for the updated group record; these changes are not yet saved."),
        ],
        on_error=[
            SetState("notice", "The host did not accept the request. You can send the same choices or approval in the conversation."),
            ShowToast("Could not send. State your choices or approval in the conversation.", variant="error"),
        ],
    )


def changes(key):
    return [SetState(key, "{{ $event }}"), SetState("dirty", True), SetState("reviewed", False)]


def text_field(label, key, value, *, rows=3):
    with Field():
        Label(label, for_id=key)
        Textarea(id=key, name=key, value=value, rows=rows, max_length=1200, on_change=changes(key))


def readable_answers(answers, candidate_titles):
    labels = {
        "kpi": "How we will measure it", "baseline": "What we know now",
        "guardrail": "What must not get worse", "hypothesis": "What may need to change",
        "blockers": "Information and decision gaps", "information": "What is needed",
        "holder": "Who holds it", "barrier": "What prevents access or agreement",
        "unlock": "What could help", "firstGap": "Our first priority",
        "chosenWorkflow": "The workflow we chose", "recentCase": "The case we replayed",
        "tasks": "What happened", "actor": "Who did it", "work": "What they did",
        "friction": "Where the work slowed or repeated", "zeroSecond": "What would remain even if the slow task took no time",
        "redesign": "How the workflow could change", "aiWork": "What AI would do",
        "value": "Expected contribution", "humanCheck": "Human check",
        "nonAiAlternative": "Non-AI alternative", "assumption": "Assumption",
        "choices": "Our shortlist", "candidateId": "Candidate", "evidenceGap": "Missing evidence",
        "challenge": "The group's challenge", "costs": "Recurring costs and human effort",
        "owner": "Proposed owner", "peopleChange": "What changes for people",
        "stopRule": "When we would stop or change direction", "test": "The first test",
    }
    lines = []

    def append_fields(value, indent=""):
        for key, item in value.items():
            if key == "id":
                continue
            label = labels.get(key, re.sub(r"([A-Z])", r" \1", key).capitalize())
            if key == "candidateId":
                item = candidate_titles.get(item, item) if item is not None else "No pilot candidate"
            if key == "taskIds":
                label = "Linked workflow steps"
                item = ", ".join(item) if item else "New work; see the stated dependency"
            if isinstance(item, list):
                lines.append(f"{indent}{label}:")
                for number, row in enumerate(item, 1):
                    if isinstance(row, dict):
                        lines.append(f"{indent}{number}.")
                        append_fields(row, indent + "  ")
                    else:
                        lines.append(f"{indent}• {row}")
            else:
                lines.append(f"{indent}{label}: {item}")
    append_fields(answers)
    return "\n\n".join(lines)


def build(record):
    phases = {phase["id"]: phase for phase in record["phases"]}
    candidates = phases[4]["answers"].get("candidates", [])
    if not 1 <= len(candidates) <= 5:
        raise ValueError("Complete at least one candidate in phase 4 before opening the shortlist.")
    if any(phases[phase_id]["status"] != "confirmed" for phase_id in range(1, 5)):
        raise ValueError("Confirm phases 1–4 before opening the shortlist.")
    answers = phases[5]["answers"]
    choice_map = {choice["candidateId"]: choice for choice in answers.get("choices", [])}
    state = {
        "groupName": record["group"]["name"], "revision": record["revision"],
        "problem": record["group"].get("problem", ""),
        "outcome": phases[1]["answers"].get("outcome", ""),
        "kpi": phases[1]["answers"].get("kpi", ""),
        "source": candidates, "dirty": False, "reviewed": False, "pending": False,
        "notice": "Edits stay in this view until the conversation saves them. You can complete the whole exercise in chat.",
        "challenge": answers.get("challenge", ""), "costs": answers.get("costs", ""),
    }
    complete = bool(answers.get("challenge", "").strip() and answers.get("costs", "").strip())
    message_parts = []
    for i, candidate in enumerate(candidates):
        choice = choice_map.get(candidate["id"], {})
        state.update({
            f"decision{i}": choice.get("decision", ""),
            f"reason{i}": choice.get("reason", ""),
            f"gap{i}": choice.get("evidenceGap", ""),
            f"assumption{i}": candidate.get("assumption", ""),
        })
        complete = complete and all(choice.get(key, "").strip() for key in ("decision", "reason", "evidenceGap"))
        message_parts.append(
            f'Candidate ID: {{{{ source.{i}.id }}}}\n'
            f'Decision: {{{{ decision{i} }}}}\n'
            f'Reason: {{{{ reason{i} }}}}\n'
            f'Evidence gap: {{{{ gap{i} }}}}\n'
        )
    first_count = " + ".join(f"(decision{i} == 'First' ? 1 : 0)" for i in range(len(candidates)))
    incomplete = " || ".join(f"!decision{i} || !reason{i} || !gap{i}" for i in range(len(candidates)))
    invalid = f"({first_count}) > 1 || {incomplete} || !challenge || !costs"
    save_text = (
        "Please save the following phase 5 draft choices, challenge and costs, then show a readable summary for group approval. Do not confirm yet.\n\n"
        + "\n".join(message_parts)
        + "\nDissent or challenge: {{ challenge }}\nRecurring costs and effort: {{ costs }}"
    )
    with Column(gap=6) as view:
        Heading("Which should we pursue first?", level=1)
        Text("Compare the candidates against your outcome. Choose at most one to pursue first; choosing none is allowed.")
        with Div(css_class="workshop-context"):
            Text("Group {{ groupName }} · revision {{ revision }}", css_class="workshop-meta")
            Text("{{ outcome }}", css_class="workshop-outcome")
            Text("Measure: {{ kpi }}")
        Text("{{ notice }}", css_class="workshop-notice", id="workshop-notice")
        with Div(css_class="shortlist-grid"):
            for i, candidate in enumerate(candidates):
                with Card(css_class="shortlist-card"):
                    Heading(f"{{{{ source.{i}.title }}}}", level=2)
                    Text("Expected contribution", css_class="workshop-label")
                    Text(f"{{{{ source.{i}.value }}}}")
                    with Accordion():
                        with AccordionItem("Review the candidate"):
                            with Div(css_class="candidate-details"):
                                with Div(css_class="candidate-detail"):
                                    Text("AI work", css_class="workshop-label")
                                    Text(f"{{{{ source.{i}.aiWork }}}}")
                                with Div(css_class="candidate-detail"):
                                    Text("Human check", css_class="workshop-label")
                                    Text(f"{{{{ source.{i}.humanCheck }}}}")
                                with Div(css_class="candidate-detail"):
                                    Text("Non-AI alternative", css_class="workshop-label")
                                    Text(f"{{{{ source.{i}.nonAiAlternative }}}}")
                        with AccordionItem("Edit the assumption"):
                            text_field("Assumption to change", f"assumption{i}", f"{{{{ assumption{i} }}}}")
                            Text("Changing a candidate reopens phase 4 and requires the shortlist to be reviewed again.", css_class="workshop-hint")
                            Button("Request assumption change", variant="outline", disabled=Rx("pending"), on_click=request(
                                f"Please change only the assumption on phase 4 candidate {{{{ source.{i}.id }}}} to the following text:\n{{{{ assumption{i} }}}}\n"
                                "Preserve all other candidate fields. Reopen phase 4 for review and mark dependent confirmed phases needs_review. Do not confirm the revised candidate or shortlist."
                            ))
                    with Field():
                        Label("Priority", for_id=f"decision{i}")
                        with Select(id=f"decision{i}", name=f"decision{i}", value=f"{{{{ decision{i} }}}}", placeholder="Choose a priority", on_change=changes(f"decision{i}")):
                            for option in ("First", "Later", "Do not pursue"):
                                SelectOption(option, value=option)
                    text_field("Why this choice?", f"reason{i}", f"{{{{ reason{i} }}}}")
                    text_field("What evidence is missing?", f"gap{i}", f"{{{{ gap{i} }}}}")
        with If(Rx(f"({first_count}) > 1")):
            Text("More than one candidate is marked First. Change a priority before sending the shortlist.", css_class="workshop-error")
        with Div(css_class="group-questions"):
            text_field("What does a dissenting group member challenge?", "challenge", "{{ challenge }}")
            text_field("What recurring costs and human effort must we allow for?", "costs", "{{ costs }}")
        Button("Review these choices", variant="outline", disabled=Rx("pending"), on_click=SetState("reviewed", True))
        with If(Rx("reviewed")):
            with Card(css_class="review-card"):
                Heading("Review before sending", level=2)
                for i in range(len(candidates)):
                    Text(f"{{{{ source.{i}.title }}}}: {{{{ decision{i} }}}}", css_class="workshop-label")
                    Text(f"Reason: {{{{ reason{i} }}}}\nMissing evidence: {{{{ gap{i} }}}}")
                Text("Challenge: {{ challenge }}\nRecurring costs and effort: {{ costs }}")
                Text("A save request records a draft. Confirm only after the conversation has returned the saved version.", css_class="workshop-hint")
                Button("Send choices for review", disabled=Rx(f"pending || {invalid}"), on_click=request(save_text))
                if complete and phases[5]["status"] != "confirmed":
                    Button("Confirm the saved shortlist", disabled=Rx("pending || dirty"), on_click=request(
                        "Our group approves the saved phase 5 shortlist shown in this record revision. "
                        "This approval applies only if no answer has changed since that saved version. "
                        "Call confirm_workshop_phase for phase 5 with approved:true and confirmation: \"Our group approves the saved phase 5 shortlist shown in this record revision.\", then provide the cumulative PDF and JSON checkpoint. "
                        "If any required evidence or earlier phase is missing, explain it and do not advance."
                    ))
        with Accordion():
            with AccordionItem("Review the accumulated workbook"):
                for phase_id, phase in phases.items():
                    if phase["status"] in ("confirmed", "needs_review"):
                        state[f"chapter{phase_id}"] = readable_answers(phase["answers"], {candidate["id"]: candidate["title"] for candidate in candidates})
                        Heading(PHASE_TITLES[phase_id], level=3)
                        if phase["status"] == "needs_review":
                            Text("This chapter needs review.", css_class="workshop-error")
                        Text(f"{{{{ chapter{phase_id} }}}}", css_class="workshop-saved-chapter")
        Button("Ask for the current PDF and checkpoint", variant="outline", disabled=Rx("pending"), on_click=request(
            "Please export the current cumulative workbook PDF and JSON checkpoint using export_workbook. "
            "Include confirmed and needs-review work with its status; do not present unsaved changes as agreed."
        ))
        Text("Prepared by Dr. Shiva Kakkar", css_class="workshop-credit")
    css = (ROOT / "prefab" / "shortlist.css").read_text(encoding="utf-8")
    theme = Theme(mode="light", gradient=False, css=css)
    return PrefabApp(title="Our AI Use-Case Portfolio", view=view, state=state, theme=theme, css_class="workshop-shortlist").to_json()


def renderer():
    html = get_renderer_html(mode="bundled")
    font = (ROOT / "skills" / "ai-use-case-workshop" / "assets" / "fonts" / "DMSerifDisplay-Regular.ttf").read_bytes()
    font_css = "@font-face{font-family:'DM Serif Display';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/ttf;base64," + base64.b64encode(font).decode("ascii") + ") format('truetype')}"
    csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\">"
    return html.replace("<head>", "<head>" + csp + "<style>" + font_css + "</style>", 1)


if __name__ == "__main__":
    if __version__ != "0.20.2":
        raise RuntimeError("This evaluated adapter requires prefab-ui==0.20.2.")
    if sys.argv[1:] == ["--renderer"]:
        print(renderer())
    elif sys.argv[1:] == ["--view"]:
        raw = sys.stdin.read(1_000_001)
        if len(raw) > 1_000_000:
            raise ValueError("Record exceeds the view input limit.")
        print(json.dumps(build(json.loads(raw)), ensure_ascii=False))
    else:
        raise SystemExit("Use --view or --renderer")
