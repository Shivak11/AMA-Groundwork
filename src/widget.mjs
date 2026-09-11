import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'AI Use-Case Workshop checkpoint', version: '0.1.0' }, {}, { autoResize: true });
const root = document.getElementById('workshop-root');
let current = null;
let artifacts = {};
let connected = false;
let pending = false;
let notice;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showNotice(text, error = false) {
  notice.textContent = text;
  notice.classList.toggle('error', error);
  notice.setAttribute('role', error ? 'alert' : 'status');
}

function updateActions() {
  root.querySelectorAll('button').forEach(button => { button.disabled = !connected || pending; });
}

function button(label, action, primary = false) {
  const node = element('button', label, primary ? 'button primary' : 'button');
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

async function sendRequest(action) {
  if (!connected || pending || !current) return;
  pending = true;
  updateActions();
  const record = current.record;
  const message = `Group: ${JSON.stringify(record.group.name)}. Record revision: ${record.revision}. `
    + 'Apply this request only to the latest matching group record and revision. If a newer version exists, show the differences and ask the group to reconfirm. '
    + action;
  try {
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: message }] }, { timeout: 15000 });
    if (result?.isError) throw new Error('denied');
    showNotice('Your request was sent to the conversation. Wait for the updated record before taking another action.');
  } catch {
    pending = false;
    updateActions();
    showNotice('The request could not be sent. Ask in the conversation: ' + action, true);
  }
}

async function download(kind) {
  if (!connected || pending || !current) return;
  const file = artifacts[kind];
  const isPdf = kind === 'pdf';
  if (!file || (isPdf ? typeof file.blob !== 'string' : typeof file.text !== 'string')) {
    showNotice('This result has no downloadable file. Ask in the conversation: Export our current workbook PDF and JSON checkpoint.', true);
    return;
  }
  const name = String(file.name || (isPdf ? 'our-ai-use-case-portfolio.pdf' : 'workshop-checkpoint.json'))
    .replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 160);
  const resource = { uri: `file:///${encodeURIComponent(name)}`, mimeType: isPdf ? 'application/pdf' : 'application/json' };
  if (isPdf) resource.blob = file.blob;
  else resource.text = file.text;
  pending = true;
  updateActions();
  try {
    const result = await app.downloadFile({ contents: [{ type: 'resource', resource }] }, { timeout: 30000 });
    if (result?.isError) {
      showNotice('The download was declined or cancelled. You can try again, or ask for the file in the conversation.', true);
    } else {
      showNotice('The host accepted the download request. Check its download prompt or files area for the file.');
    }
  } catch {
    showNotice('The download could not be completed through this view. Ask in the conversation: Export our current workbook PDF and JSON checkpoint.', true);
  } finally {
    pending = false;
    updateActions();
  }
}

function render(data, meta) {
  const record = data?.record;
  if (!record || !Number.isInteger(record.revision) || typeof record.group?.name !== 'string' || !Array.isArray(record.phases)) {
    showNotice('The view did not receive a complete group record. Ask in the conversation: Show our current workshop progress and checkpoint.', true);
    return;
  }
  if (current && record.group.name === current.record.group.name && record.revision < current.record.revision) {
    showNotice('An older record arrived. Continue with the latest version in the conversation.', true);
    return;
  }
  current = data;
  artifacts = meta?.artifacts ?? {};
  pending = false;
  root.replaceChildren();
  root.append(element('h1', 'Our AI Use-Case Portfolio'));
  root.append(element('p', `${record.group.name} · record revision ${record.revision}`, 'group-line'));
  const completed = record.phases.filter(phase => phase.status === 'confirmed').length;
  root.append(element('p', `${completed} of 6 phases are confirmed. The PDF includes confirmed work and clearly identified chapters that need review.`));
  notice = element('p', 'This view shows the conversation’s returned record. Download a checkpoint before changing clients.', 'notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  root.append(notice);
  const actions = element('div', undefined, 'actions');
  if (artifacts.pdf) actions.append(button('Download workbook PDF', () => download('pdf'), true));
  if (artifacts.checkpoint) actions.append(button('Download JSON checkpoint', () => download('checkpoint')));
  if (!artifacts.pdf || !artifacts.checkpoint) {
    actions.append(button('Request current PDF and checkpoint', () => sendRequest('Export the current cumulative workbook PDF and JSON checkpoint using export_workbook. Do not confirm or change any phase.')));
  }
  root.append(actions);
  const preview = element('details');
  preview.append(element('summary', 'Review the returned summary'));
  preview.append(element('p', typeof data.summary === 'string' ? data.summary : 'Ask for the readable phase summary in the conversation.', 'summary-text'));
  root.append(preview);
  if (data.phase?.question) {
    const next = element('section', undefined, 'next-step');
    next.append(element('h2', typeof data.phase.title === 'string' ? data.phase.title : 'Continue the workshop'));
    next.append(element('p', data.phase.question));
    next.append(button('Continue in the conversation', () => sendRequest('Continue the workshop from the latest record. Ask one manageable question for the next unconfirmed phase. Do not change or confirm answers automatically.')));
    root.append(next);
  }
  root.append(element('p', 'Prepared by Dr. Shiva Kakkar', 'credit'));
  updateActions();
}

function hostContext(context) {
  document.documentElement.classList.toggle('dark', context?.theme === 'dark');
  const insets = context?.safeAreaInsets ?? {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const value = Number(insets[side]);
    document.documentElement.style.setProperty(`--safe-${side}`, Number.isFinite(value) && value >= 0 ? `${Math.min(value, 100)}px` : '0px');
  }
}

root.append(element('h1', 'Our AI Use-Case Portfolio'));
notice = element('p', 'Connecting to the conversation. If this view is unavailable, ask for your checkpoint in chat.', 'notice');
notice.setAttribute('role', 'status');
notice.setAttribute('aria-live', 'polite');
root.append(notice);
app.ontoolresult = result => {
  if (result.isError) {
    showNotice('The workshop action did not complete. Read the tool’s explanation in the conversation and retry there.', true);
    return;
  }
  render(result.structuredContent, result._meta);
};
app.onhostcontextchanged = hostContext;
app.ontoolcancelled = () => showNotice('The operation was cancelled. Continue or request your checkpoint in the conversation.', true);
app.onclose = () => { connected = false; updateActions(); showNotice('This view is disconnected. Continue the workshop in the conversation.', true); };
app.connect().then(() => {
  connected = true;
  hostContext(app.getHostContext());
  updateActions();
}).catch(() => showNotice('This host could not connect the view. Ask in the conversation: Export our current workbook PDF and JSON checkpoint.', true));
