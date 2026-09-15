const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export function renderAuthPage({clientName='Your MCP client',view='signin',user=null,error=''}) {
  const create=view==='create';
  const title=user?'Continue to AMA-Groundwork':create?'Create your AMA-Groundwork account':'Sign in to AMA-Groundwork';
  const form=user?`
        <div class="account">
          <span class="avatar">${escapeHtml(user.displayName.slice(0,1).toUpperCase())}</span>
          <span><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.email)}</small></span>
        </div>
        <button class="primary" type="submit" name="action" value="continue">Continue</button>
        <button class="quiet" type="submit" name="action" value="signout">Use another account</button>`:`
        ${create?'<label>Your name<input name="display_name" autocomplete="name" maxlength="100" required></label>':''}
        <label>Email address<input type="email" name="email" autocomplete="email" maxlength="254" required></label>
        <label>Password<input type="password" name="password" autocomplete="${create?'new-password':'current-password'}" minlength="10" maxlength="256" required></label>
        ${create?'<p class="help">Use at least 10 characters.</p>':''}
        ${error?`<p class="error" role="alert">${escapeHtml(error)}</p>`:''}
        <button class="primary" type="submit" name="action" value="${create?'register':'signin'}">${create?'Create account':'Sign in'}</button>
        <a class="switch" href="/authorize?view=${create?'signin':'create'}">${create?'I already have an account':'Create an account'}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light dark;--bg:#f7f7f5;--panel:#fff;--text:#182527;--muted:#607073;--line:#d9e0df;--accent:#087f83;--accent-hover:#066b6f;--error:#b42318;--shadow:0 18px 60px rgba(20,38,40,.10)}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font:16px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(100%,460px);background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:36px;box-shadow:var(--shadow)}
    .mark{width:44px;height:44px;display:grid;place-items:center;margin-bottom:28px;border-radius:12px;background:var(--text);color:var(--panel);font-weight:800;letter-spacing:-.04em}
    h1{margin:0 0 10px;font-size:clamp(26px,5vw,34px);line-height:1.15;letter-spacing:-.035em}
    .intro{margin:0 0 28px;color:var(--muted)}
    form{display:grid;gap:18px}
    label{display:grid;gap:7px;font-size:14px;font-weight:700}
    input{width:100%;min-height:48px;border:1px solid var(--line);border-radius:11px;padding:11px 13px;background:var(--panel);color:var(--text);font:inherit;outline:none}
    input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 20%,transparent)}
    button,.switch{min-height:48px;border-radius:11px;font:inherit;font-weight:750;text-align:center}
    button{border:0;cursor:pointer}
    .primary{padding:12px 18px;background:var(--accent);color:#fff}
    .primary:hover{background:var(--accent-hover)}
    .quiet{padding:10px;background:transparent;color:var(--muted)}
    .switch{display:grid;place-items:center;color:var(--accent);text-decoration:none}
    .help{margin:-12px 0 0;color:var(--muted);font-size:13px}
    .error{margin:0;padding:11px 13px;border-radius:10px;background:color-mix(in srgb,var(--error) 9%,transparent);color:var(--error);font-size:14px}
    .account{display:flex;align-items:center;gap:13px;padding:14px;border:1px solid var(--line);border-radius:12px}
    .account span:last-child{min-width:0;display:grid}
    .account strong,.account small{overflow-wrap:anywhere}
    .account small{color:var(--muted)}
    .avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,var(--panel));color:var(--accent);font-weight:800}
    footer{margin-top:26px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
    @media(prefers-color-scheme:dark){:root{--bg:#171918;--panel:#202322;--text:#f1f4f2;--muted:#aeb8b5;--line:#3b4240;--accent:#42bcc0;--accent-hover:#31a8ac;--error:#ff8a82;--shadow:none}.primary{color:#102526}.mark{background:#eef4f2;color:#172422}}
    @media(max-width:520px){body{padding:0;background:var(--panel)}main{min-height:100vh;border:0;border-radius:0;padding:28px 22px;box-shadow:none}.mark{margin-bottom:38px}}
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">AMA</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro"><strong>${escapeHtml(clientName)}</strong> wants to use AMA-Groundwork. Your account keeps your workbooks available when you return.</p>
    <form method="post" action="/authorize">
      ${form}
      <button class="quiet" type="submit" name="action" value="cancel" formnovalidate>Cancel</button>
    </form>
    <footer>AMA-Groundwork stores your account and workbooks so you can reopen them. You can delete a workbook from the connector.</footer>
  </main>
</body>
</html>`;
}
