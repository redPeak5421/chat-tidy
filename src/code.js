/* Code block tools inside answers: a line-number gutter, folding of long blocks, per-line copy for shell blocks and
   flags for potentially destructive commands. Site structure comes only from the ChatTidyReaderSites adapter. */
globalThis.ChatTidyCode = (() => {
  const FOLD_AT = 24, FOLD_SHOW = 12;
  const SHELL = new Set(['bash','sh','shell','zsh','console','terminal','powershell','ps1','pwsh','posh','cmd','bat','batch','fish','shellsession','sh-session']);
  const CONSOLE = new Set(['console','terminal','shellsession','sh-session']);
  const PLAIN = new Set(['text','plaintext','plain','txt']);
  const SQL = new Set(['sql','psql','mysql','postgres','postgresql','pgsql','plpgsql','plsql','sqlite','tsql','mssql','mariadb']);
  // First words that make an unlabeled block read as commands.
  const COMMAND = /^(?:sudo|cd|ls|pwd|mkdir|rm|cp|mv|touch|cat|echo|export|source|chmod|chown|ln|tar|unzip|curl|wget|ssh|scp|rsync|git|gh|npm|npx|pnpm|yarn|bun|bunx|deno|node|pip3?|pipx|python3?|uv|poetry|conda|brew|apt(?:-get)?|yum|dnf|pacman|apk|snap|docker|docker-compose|podman|kubectl|helm|terraform|make|cmake|cargo|rustup|go|mvn|gradle|dotnet|composer|gem|bundle|systemctl|service|journalctl|sed|awk|grep|find|xargs|kill|killall|winget|choco|scoop|setx|wsl|code|open|cf|wrangler|vercel|firebase|flutter|xcodebuild|swift|nvm|sdk)$/i;
  const norm = lang => { const value = String(lang || '').toLowerCase(); return PLAIN.has(value) ? '' : value; };
  const POWERSHELL = /^(?:powershell|ps1|pwsh|posh)$/, CMD = /^(?:cmd|bat|batch)$/;

  // Logical lines; a trailing newline does not open another line.
  function lines(text) { const list = String(text).split('\n'); if (list.length > 1 && list.at(-1) === '') list.pop(); return list; }
  function lineStarts(text) { const starts = [0]; for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1); return starts; }
  function lineAt(starts, offset) { let low = 0, high = starts.length - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= offset) low = mid; else high = mid - 1; } return low; }

  // "$ ", "% ", "(venv) $ ", "user@host:~$ ", "PS> ", "PS C:\dir> ", "C:\dir>"; "# " is a root prompt only in console transcripts.
  const PROMPT = /^\s*(?:PS(?: [^>\n]*)?>|[A-Za-z]:\\[^>\n]*>|(?:\([\w.-]+\)\s*)?(?:[\w.-]+@[\w.-]+(?::[^\s$#%]*)?\s?)?[$%](?=\s|$))\s*/;
  const ROOT = /^\s*(?:[\w.-]+@[\w.-]+(?::[^\s$#]*)?\s?)?#(?=\s|$)\s*/;
  const COMMENT = /^\s*(?:#|::|rem(?:\s|$)|<#)/i;
  const HEREDOC = /(?:^|[^<])<<-?\s*(['"]?)([A-Za-z_]\w*)\1/;
  function prompt(line, lang) { const match = PROMPT.exec(line) || (CONSOLE.has(lang) ? ROOT.exec(line) : null); return match ? match[0].length : -1; }
  function stripPrompt(line, lang) { const length = prompt(line, norm(lang)); return length >= 0 ? line.slice(length) : line.replace(/^\s*>\s+/, ''); }
  function stripComment(text) {
    let quote = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = ''; else if (c === '\\' && quote === '"') i++; }
      else if (c === '\\') i++;
      else if (c === "'" || c === '"') quote = c;
      else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
    }
    return text;
  }
  const continuation = lang => POWERSHELL.test(lang) ? /(?:`|\|\||&&|\|)\s*$/ : CMD.test(lang) ? /(?:\^|\|\||&&|\|)\s*$/ : /(?:\\|\|\||&&|\|)\s*$/;

  // Commands of a shell block: [{start, end (last continued line), through (heredoc end), text (to copy), command (to scan)}].
  // Transcripts (console languages, or mostly prompted lines) treat unprompted lines as output; otherwise, and always
  // with every = true (the danger scan), each non-empty, non-comment line is a command.
  function commands(text, lang, every = false) {
    const l = norm(lang), list = lines(text), out = [], cont = continuation(l);
    const prompted = list.filter(line => prompt(line, l) >= 0).length, filled = list.filter(line => line.trim()).length;
    const transcriptish = prompted > 0 && (CONSOLE.has(l) || prompted * 2 > filled), transcript = !every && transcriptish;
    for (let i = 0; i < list.length; i++) {
      const length = prompt(list[i], l);
      if (transcript && length < 0) continue;
      // The danger scan reads a transcript's output too, but output prose ("Reboot required", "Shutdown -r scheduled")
      // starts with a capital; typed commands start lowercase.
      if (every && transcriptish && length < 0 && !/^\s*(?:sudo\s+)?[a-z.\/:_-]/.test(list[i])) continue;
      const first = length >= 0 ? list[i].slice(length) : list[i].replace(/^\s*>\s+/, '');
      if (!first.trim() || COMMENT.test(first)) continue;
      const parts = [first.trimEnd()];
      let end = i;
      while (end + 1 < list.length && cont.test(stripComment(parts.at(-1)))) { end++; parts.push((length >= 0 ? list[end].replace(/^\s*>\s?/, '') : list[end]).trimEnd()); }
      const command = parts.map((part, k) => { const code = stripComment(part); return k < parts.length - 1 ? code.replace(/(?:\\|`|\^)\s*$/, '') : code; }).join(' ').trim();
      let through = end;
      const doc = HEREDOC.exec(command);
      if (doc) while (through + 1 < list.length) { through++; parts.push(list[through]); if (list[through].trim() === doc[2]) break; }
      out.push({start: i, end, through, text: parts.join('\n'), command});
      i = through;
    }
    return out;
  }
  function isShell(lang, text = '') {
    const l = norm(lang);
    if (SHELL.has(l)) return true;
    if (l) return false;
    const list = lines(text).filter(line => line.trim());
    if (!list.length || list.length > 80) return false;
    if (list.some(line => prompt(line, l) >= 0)) return true;
    const found = commands(text, l);
    const hits = found.filter(item => COMMAND.test(item.command.replace(/^sudo\s+/, '').split(/\s+/)[0])).length;
    return found.length > 0 && hits >= Math.ceil(found.length * .6);
  }

  // Simple commands grouped by pipeline: [[segment, ...], ...]. Quote aware; ;, &&, ||, &, subshells and brace groups separate.
  function pipelines(source) {
    const out = [[]];
    let current = '', quote = '';
    const cut = next => { out.at(-1).push(current); current = ''; if (next) out.push([]); };
    for (let i = 0; i < source.length; i++) {
      const c = source[i], n = source[i + 1];
      if (quote) { current += c; if (c === quote) quote = ''; else if (c === '\\' && quote === '"' && n) { current += n; i++; } continue; }
      if (c === "'" || c === '"') { quote = c; current += c; }
      else if (c === '\\' && n) { current += c + n; i++; }
      else if (c === '$' && n === '{' && source.indexOf('}', i) > 0) { const close = source.indexOf('}', i); current += source.slice(i, close + 1); i = close; }
      else if ((c === '&' || c === '|') && n === c) { cut(true); i++; }
      else if (c === '|') { cut(false); if (n === '&') i++; }
      else if (c === '&') { if (/[<>]$/.test(current) || n === '>') current += c; else cut(true); }
      else if (';\n`()'.includes(c) || (c === '{' || c === '}') && /(?:^|\s)$/.test(current) && (!n || /[\s;]/.test(n))) cut(true);
      else current += c;
    }
    cut(false);
    return out.map(list => list.map(part => part.replace(/[$<>]\s*$/, '').trim()).filter(Boolean)).filter(list => list.length);
  }
  // Words with quotes removed and redirections ("> file", "2>/dev/null", "2>&1") dropped. Backslashes stay literal
  // unless they escape whitespace or quotes, so Windows paths survive.
  function words(segment) {
    const out = [];
    let current = '', quote = '', quoted = false;
    for (let i = 0; i < segment.length; i++) {
      const c = segment[i];
      if (quote) { if (c === quote) quote = ''; else if (c === '\\' && quote === '"' && /["\\$`]/.test(segment[i + 1] || '')) current += segment[++i]; else current += c; continue; }
      if (c === "'" || c === '"') { quote = c; quoted = true; }
      else if (/\s/.test(c)) { if (current || quoted) out.push(current); current = ''; quoted = false; }
      else if (c === '\\' && /[\s'"]/.test(segment[i + 1] || '')) current += segment[++i];
      else current += c;
    }
    if (current || quoted) out.push(current);
    const kept = [];
    for (let i = 0; i < out.length; i++) { if (/^\d*(?:[<>]{1,2}|&>{1,2})$/.test(out[i])) i++; else if (!/^\d*(?:[<>]|&>)/.test(out[i])) kept.push(out[i]); }
    return kept;
  }
  const WRAPPERS = new Set(['sudo','doas','nohup','time','exec','command','builtin','env','nice','xargs','then','do','else','!','call','start']);
  function head(tokens) {
    let i = 0;
    while (i < tokens.length) {
      const word = tokens[i], name = word.toLowerCase();
      if (/^[A-Za-z_]\w*=/.test(word) || word === 'RUN') { i++; continue; }
      if (!WRAPPERS.has(name)) break;
      i++;
      while (i < tokens.length && tokens[i].startsWith('-')) i += name !== 'xargs' && /^-[ugCDhpTrn]$/.test(tokens[i]) ? 2 : 1;
    }
    return {name: (tokens[i] || '').replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase(), args: tokens.slice(i + 1)};
  }

  /* Risky-command rules. Deliberate false-positive choices:
     - Recursive deletes are flagged only for catastrophic targets: "/", top-level dirs except /tmp, "~", "*", "./*", "..",
       a bare "$VAR" (empty means "/"), drive roots, %VAR% / $env:VAR. "rm -rf ./build", "rm -rf node_modules",
       "rm -rf ~/.cache/x", "rd /s /q node_modules" and "Remove-Item -Recurse -Force .\dist" stay quiet; a PowerShell
       "$folder" is assigned by the script, so it is not treated like an unset shell variable.
     - "find ... -delete" is flagged only without a narrowing test (-name, -path, -mtime, ...): "find ~ -name .DS_Store -delete" is fine.
     - "dd of=/dev/null" and other pseudo devices are fine; "chmod 777 file" is only flagged when recursive or on "/" or "~".
     - "curl ... | sudo tee file" (apt key installs) is fine; only piping into an interpreter is flagged.
     - "git push --force-with-lease", "git clean -n", "git restore --staged ." and "git checkout -- file" are fine.
     - SQL keywords inside comments are ignored; "DELETE ... WHERE" is fine even across lines. Comment lines never match. */
  const RISKY = [
    /^\/+\*?$/,
    /^\/(?!tmp\/?\*?$)[^/\s*]+\/?\*?$/,
    /^~[\w.-]*[\\/]?\*?$/,
    /^(?:\.\/)?\*(?:\.\*)?$|^\.\*$/,
    /^\.\.(?:[\\/]\.\.)*[\\/]?\*?$/,
    /^\$\{?\w+\}?[\\/]?\*?$/,
    /^(?:\$env:\w+|%\w+%)[\\/]?\*?$/i,
    /^[a-z]:(?:[\\/](?:(?!te?mp[\\/]?\*?$)[^\\/*\s]+[\\/]?)?)?\*?(?:\.\*)?$/i,
    /^\\\*?$/
  ];
  const risky = target => RISKY.some(re => re.test(target));
  const PS_PARAM = /^-[A-Z][a-z]{2,}/;
  const FILTER = /^-(?:i?name|i?path|i?wholename|i?regex|i?lname|newer\w*|[acm](?:time|min|newer)|size|empty|user|uid|group|gid|perm|links|inum|samefile|context)$/;
  const FETCH = /^(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)$/;
  const RUNNER = /^(?:(?:ba|z|da|k|c|tc)?sh|fish|python[\d.]*|perl|ruby|node|iex|invoke-expression)$/;
  const FORK = /([\w:]+)\s*\(\)\s*\{\s*\1\s*\|\s*\1\s*&\s*\}\s*;\s*\1/;
  const REMOTE = [
    /(?:\b(?:ba|z|da|k)?sh|\bsource|(?:^|[\s;&|])\.)\s+(?:-\S+\s+)*<\(\s*(?:curl|wget)\b/,
    /\b(?:(?:ba|z|da|k)?sh\s+-c|eval)\s+["']?\$\(\s*(?:curl|wget)\b/,
    /\b(?:iex|invoke-expression)\b[\s(]*(?:iwr|irm|invoke-webrequest|invoke-restmethod|new-object\s+(?:system\.)?net\.webclient\b)/i
  ];
  const FEEDS = /\b(?:ssh|(?:ba|z|da|k)?sh)\b[^;&|]*<<(?!<)|<<[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/;
  const DEVICE = /(?:^|[^>&\d])>{1,2}\s*\/dev\/(?:sd|hd|vd|xvd|nvme|disk|rdisk|mmcblk)\w*/;
  function rules(name, args, add) {
    const flags = args.filter(arg => arg.startsWith('-')), plain = args.filter(arg => !arg.startsWith('-'));
    const short = (list, re) => list.some(flag => /^-[a-zA-Z]+$/.test(flag) && !PS_PARAM.test(flag) && re.test(flag));
    if (/^(?:rm|remove-item|ri|rmdir|rd|del|erase)$/.test(name)) {
      const windows = args.some(arg => /^\/s$/i.test(arg)), ps = name === 'remove-item' || name === 'ri' || flags.some(flag => PS_PARAM.test(flag));
      const recursive = windows || (ps ? flags.some(flag => /^-r(?:e(?:c(?:u(?:r(?:se?)?)?)?)?)?$/i.test(flag)) : name === 'rm' && (flags.includes('--recursive') || short(flags, /r/i)));
      const targets = plain.filter(arg => !/^\/[a-z]$/i.test(arg) && !(ps && /^\$(?!env:)/i.test(arg)));
      if (name === 'rm' && flags.includes('--no-preserve-root') || recursive && targets.some(risky)) add('dangerDelete');
    }
    if (name === 'find' && args.includes('-delete') && !args.some(arg => FILTER.test(arg))) add('dangerDelete');
    if (name === 'dd' && args.some(arg => /^of=\/dev\/(?!null$|zero$|stdout$|stderr$|tty|fd\/|shm)/.test(arg))
      || /^(?:mkfs(?:\.\w+)?|mke2fs|mkswap|wipefs|diskpart|format-volume|clear-disk)$/.test(name)
      || name === 'format' && plain.some(arg => /^[a-z]:$/i.test(arg))
      || name === 'shred' && plain.some(arg => arg.startsWith('/dev/'))) add('dangerDisk');
    if (name === 'chmod' && plain.some(arg => /^0?777$|^(?:a|ugo)[+=]rwx$/.test(arg)) && (flags.includes('--recursive') || short(flags, /R/) || plain.some(arg => /^(?:\/+|~\/?)\*?$/.test(arg)))
      || name === 'chown' && (flags.includes('--recursive') || short(flags, /R/)) && plain.slice(1).some(risky)) add('dangerPermissions');
    if (name === 'git') {
      let i = 0;
      while (i < args.length && args[i].startsWith('-')) i += /^(?:-C|-c|--git-dir|--work-tree|--namespace)$/.test(args[i]) ? 2 : 1;
      const sub = args[i], rest = args.slice(i + 1), joined = rest.join(' ');
      if (sub === 'reset' && rest.includes('--hard')
        || sub === 'clean' && !rest.includes('--dry-run') && !short(rest, /n/) && (rest.includes('--force') || short(rest, /f/)) && short(rest, /d/)
        || sub === 'push' && (rest.includes('--force') || short(rest, /f/) || rest.some(arg => /^\+[^\s+]/.test(arg)))
        || sub === 'checkout' && (joined === '.' || /(?:^| )-- \.(?: |$)/.test(joined))
        || sub === 'restore' && rest.includes('.') && !(rest.some(arg => arg === '--staged' || arg === '-S') && !rest.some(arg => arg === '--worktree' || arg === '-W'))) add('dangerGit');
    }
    let pids = args;
    if (pids[0] === '-s' || pids[0] === '-n') pids = pids.slice(2); else if (pids[0]?.startsWith('-') && pids.length > 1) pids = pids.slice(1);
    if (/^(?:shutdown|reboot|halt|poweroff|killall|stop-computer|restart-computer)$/.test(name)
      || name === 'init' && /^[06]$/.test(plain[0] || '')
      || name === 'systemctl' && plain.some(arg => /^(?:reboot|poweroff|halt|kexec)$/.test(arg))
      || name === 'kill' && pids.includes('-1')) add('dangerSystem');
  }
  function shell(command) {
    const hits = [], add = (rule, match) => hits.push({rule, match: String(match).trim().slice(0, 160)});
    const fork = FORK.exec(command);
    if (fork) add('dangerForkBomb', fork[0]);
    const remote = REMOTE.map(re => re.exec(command)).find(Boolean);
    if (remote) add('dangerRemoteScript', remote[0]);
    const device = DEVICE.exec(command);
    if (device) add('dangerDisk', device[0]);
    for (const pipeline of pipelines(command)) {
      let fetched = false;
      pipeline.forEach((segment, i) => {
        const {name, args} = head(words(segment));
        if (!name) return;
        if (fetched && i > 0 && RUNNER.test(name)) add('dangerRemoteScript', pipeline.join(' | '));
        if (FETCH.test(name)) fetched = true;
        rules(name, args, rule => add(rule, segment));
      });
    }
    return hits;
  }
  // SQL statements split on ";". Strict mode (SQL blocks) blanks comments and string literals first, keeping offsets.
  function sql(text, strict) {
    const source = strict ? text.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g, match => match.replace(/[^\n]/g, ' ')) : text;
    const patterns = [/\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b/i, strict ? /\bTRUNCATE\s+(?:TABLE\s+)?[\w."`[]/i : /\bTRUNCATE\s+TABLE\b/i];
    const hits = [];
    let offset = 0;
    for (const statement of source.split(';')) {
      for (const re of patterns) { const match = re.exec(statement); if (match) hits.push({index: offset + match.index, match: match[0]}); }
      const remove = /\bDELETE\s+FROM\s+\S+/i.exec(statement);
      if (remove && !/\bWHERE\b/i.test(statement)) hits.push({index: offset + remove.index, match: remove[0]});
      offset += statement.length + 1;
    }
    return hits;
  }
  // [{line (0-based start), end (last line of the command), rule (i18n key), match}], one per line and rule.
  function scan(text, lang) {
    const l = norm(lang), out = [], seen = new Set();
    const push = (line, end, rule, match) => { if (!seen.has(line + ':' + rule)) { seen.add(line + ':' + rule); out.push({line, end, rule, match}); } };
    text = String(text || '');
    if (SQL.has(l)) {
      const starts = lineStarts(text);
      for (const hit of sql(text, true)) { const line = lineAt(starts, hit.index); push(line, line, 'dangerDatabase', hit.match); }
    } else if (!l || SHELL.has(l) || l === 'dockerfile' || l === 'docker') {
      const list = lines(text);
      for (const item of commands(text, l, true)) {
        for (const hit of shell(item.command)) push(item.start, item.end, hit.rule, hit.match);
        for (const hit of sql(item.command, false)) push(item.start, item.end, 'dangerDatabase', hit.match);
        // A heredoc fed to a shell is a script: scan its body as commands too.
        if (item.through > item.end + 1 && FEEDS.test(item.command)) for (const hit of scan(list.slice(item.end + 1, item.through).join('\n'), 'bash')) push(hit.line + item.end + 1, hit.end + item.end + 1, hit.rule, hit.match);
      }
    }
    return out.sort((a, b) => a.line - b.line);
  }

  const NS = 'http://www.w3.org/2000/svg';
  const icons = {copy: 'M9 9h10v10H9Z M5 15V5h10', check: 'M5 12.5l4.5 4.5L19 7', down: 'M7 10l5 5 5-5', up: 'M7 14l5-5 5 5', warn: 'M12 4.5 3 19.5h18Z M12 10v4.5 M12 17.2v.1'};
  function icon(name) {
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', icons[name]); svg.append(path); return svg;
  }
  // Visible text is drawn by ::after from an attribute, so innerText/textContent of the page (site copy buttons, the outline,
  // search, other extensions) never picks up our labels or numbers.
  function label(text, className = '') { const span = document.createElement('span'); span.className = className; span.setAttribute('data-cs-code-label', text); return span; }
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; }
  function rgba(value) {
    const match = /^rgba?\(([^)]+)\)$/.exec(value || '');
    const parts = match ? match[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat) : [];
    return parts.length >= 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1] : null;
  }
  // The block's painted background composited up the ancestor chain, so the gutter can hide code scrolled beneath it.
  function backdrop(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const color = rgba(getComputedStyle(n).backgroundColor);
      if (!color) return null;
      if (color[3] > 0) { layers.push(color); if (color[3] >= 1) break; }
    }
    let rgb = [255, 255, 255];
    for (const [r, g, b, a] of layers.reverse()) rgb = [r * a + rgb[0] * (1 - a), g * a + rgb[1] * (1 - a), b * a + rgb[2] * (1 - a)];
    return rgb.map(Math.round);
  }
  // Read-only CodeMirror 6 (Z.ai): each .cm-line is one line and CodeMirror replaces far-away lines with .cm-gap spacers
  // sized to the hidden lines, so only rendered lines are read and their numbers count the lines each gap stands for.
  function editorLines(content, unit = 0) {
    const list = [];
    let n = 0;
    for (const child of content.children) {
      if (child.classList.contains('cm-line')) list.push({el: child, n: ++n});
      else if (unit > 0 && child.classList.contains('cm-gap')) n += Math.round((parseFloat(child.style.height) || child.getBoundingClientRect().height) / unit);
    }
    return {lines: list, text: list.map(line => line.el.textContent).join('\n')};
  }
  // Read-only Monaco (Qwen chat pages): .view-line nodes are absolutely positioned, recycled and kept in any DOM order, and only
  // lines near Monaco's viewport exist. Order and number them by their top offset; Monaco renders spaces as no-break spaces.
  function monacoLines(view, unit = 0) {
    const rows = [...view.querySelectorAll(':scope > .view-line')].map(el => ({el, top: parseFloat(el.style.top) || 0}));
    unit ||= parseFloat(rows[0]?.el.style.height) || parseFloat(rows[0]?.el.style.lineHeight) || 0;
    rows.sort((a, b) => a.top - b.top);
    const list = rows.map((row, i) => ({el: row.el, n: unit > 0 ? Math.round(row.top / unit) + 1 : i + 1}));
    return {lines: list, text: list.map(line => line.el.textContent.replace(/\u00a0/g, ' ')).join('\n')};
  }
  // Text nodes of the code element with their offsets in textContent; highlighted spans may hold several lines each.
  function texts(root) {
    const list = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let start = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (n.data.length) { list.push({node: n, start}); start += n.data.length; } }
    return list;
  }
  function locate(list, offset, forward) {
    let low = 0, high = list.length - 1;
    if (high < 0) return null;
    while (low < high) { const mid = (low + high + 1) >> 1; if (list[mid].start <= offset) low = mid; else high = mid - 1; }
    let item = list[low];
    if (forward && offset >= item.start + item.node.data.length && list[low + 1]) item = list[low + 1];
    const at = offset - item.start;
    return at >= 0 && at <= item.node.data.length ? {node: item.node, offset: at} : null;
  }
  function nearest(tops, y) { let low = 0, high = tops.length - 1; while (low < high) { const mid = (low + high + 1) >> 1; if (tops[mid] <= y) low = mid; else high = mid - 1; } return low; }

  function create({t = key => key, adapter} = {}) {
    let settings = {}, on = false, dead = false, mo = null, io = null, ro = null, timer = 0, frame = 0, poll = 0, watched = null, highlight = null, skipped = new WeakSet();
    const blocks = new Map(), owners = new WeakMap(), dirty = new Set(), queue = new Set(), timers = new Set();
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const themed = () => { for (const b of blocks.values()) b.stale = true; schedule(); };
    const schedule = (delay = 160) => { if (on && !timer) timer = setTimeout(tick, delay); };
    let sticky = 0;
    const scrolled = () => { if (!sticky) sticky = requestAnimationFrame(() => { sticky = 0; for (const b of blocks.values()) if (b.ui && b.visible && b.stickies?.length) trim(b); }); };
    const kick = () => { if (on && queue.size && !frame) frame = requestAnimationFrame(flush); };

    function start() {
      if (on) return;
      on = true;
      mo = new MutationObserver(observe);
      if (globalThis.IntersectionObserver) io = new IntersectionObserver(entries => {
        for (const entry of entries) { const b = blocks.get(entry.target); if (!b) continue; b.visible = entry.isIntersecting; if (b.visible && b.stale) queue.add(b); }
        kick();
      }, {rootMargin: '800px 0px'});
      // Size changes (wrapping, streaming growth, window resizes) re-measure on the same coalesced tick as mutations.
      if (globalThis.ResizeObserver) ro = new ResizeObserver(entries => {
        for (const entry of entries) for (const b of blocks.values()) if (b.clip === entry.target || b.host === entry.target) b.stale = true;
        schedule();
      });
      document.addEventListener('scroll', scrolled, {capture: true, passive: true});
      poll = setInterval(() => { if (watched && !watched.isConnected) schedule(); }, 1500);
      media?.addEventListener?.('change', themed);
    }
    function watch(thread) {
      mo.disconnect();
      watched = thread;
      if (thread) mo.observe(thread, {childList: true, subtree: true, characterData: true});
      for (const b of blocks.values()) follow(b);
      // Theme switches repaint code blocks; their colors are read again on the next layout.
      if (thread !== document.documentElement) mo.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'data-color-mode', 'data-cs-theme', 'theme']});
    }
    function observe(records) {
      let any = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          if (record.target === document.documentElement) { for (const b of blocks.values()) b.stale = true; any = true; continue; }
          // Monaco recycles .view-line nodes by rewriting their top offsets.
          const b = blocks.get(record.target.closest?.('.monaco-editor'));
          if (b) { dirty.add(b); any = true; }
          continue;
        }
        const el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!el || el.closest('[data-cs-owned]')) continue;
        if (record.type === 'childList') {
          let foreign = false;
          for (const n of record.removedNodes) { if (n.nodeType === 1 && n.hasAttribute('data-cs-owned')) { const b = owners.get(n); if (b) { b.stale = true; any = true; } } else foreign = true; }
          for (const n of record.addedNodes) if (!(n.nodeType === 1 && n.hasAttribute('data-cs-owned'))) foreign = true;
          if (!foreign) continue;
        }
        const pre = el.closest('.monaco-editor,.cm-editor,pre'), b = pre && blocks.get(pre);
        if (b) dirty.add(b);
        any = true;
      }
      if (any) schedule();
    }
    function follow(b) { if (b.monaco && mo && b.code.isConnected) mo.observe(b.code, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style']}); }
    function userMessages(thread) { try { return adapter.messages(thread, {text: false}).filter(item => item.role === 'user').map(item => item.el); } catch { return []; } }
    function tick() {
      timer = 0;
      if (!on) return;
      const thread = adapter.thread();
      if (thread !== watched) watch(thread);
      let found = [];
      try { found = adapter.codeBlocks(thread) || []; } catch { found = []; }
      let users = null;
      for (const item of found) {
        const known = blocks.get(item.pre);
        if (known) { if (known.lang !== item.lang || known.code !== item.code) { known.lang = item.lang; known.code = item.code; dirty.add(known); } continue; }
        if (skipped.has(item.pre)) continue;
        // Answers only: code the user pasted and the composer are left alone.
        users ??= userMessages(thread);
        if (item.pre.closest('form,[contenteditable="true"],textarea') || users.some(el => el.contains(item.pre))) { skipped.add(item.pre); continue; }
        adopt(item);
      }
      for (const b of [...blocks.values()]) { if (!b.pre.isConnected) drop(b); else if (b.ui && !b.ui.isConnected) b.stale = true; }
      for (const b of dirty) if (blocks.get(b.pre) === b) refresh(b);
      dirty.clear();
      for (const b of blocks.values()) if (b.stale && b.visible) queue.add(b);
      kick();
    }
    function adopt(item) {
      // Editor kinds: 'codemirror' (Z.ai) or 'monaco' (Qwen chat). Monaco re-renders its own nodes, so even the processed
      // marker goes on the site's pre around it; numbered editors already draw line numbers.
      const kind = item.editor === 'monaco' ? 'monaco' : item.editor ? 'codemirror' : null, marker = kind === 'monaco' ? item.pre.closest('pre') : item.pre;
      const b = {pre: item.pre, code: item.code, lang: item.lang, editor: kind, monaco: kind === 'monaco', numbered: !!item.numbered, marker, text: null, fold: null, count: 0, groups: [], lineGroup: [], flags: [], visible: !io, stale: true, list: false, ranges: [], tops: [], heights: [], nums: [], buttons: [], marks: [], focus: 0, hovered: -1};
      blocks.set(item.pre, b);
      marker?.setAttribute('data-cs-code', '');
      io?.observe(item.pre);
      follow(b);
      refresh(b);
    }
    function refresh(b) {
      const unit = b.editor ? parseFloat(getComputedStyle(b.code).lineHeight) || 0 : 0, doc = b.monaco ? monacoLines(b.code) : b.editor ? editorLines(b.code, unit) : null, text = doc ? doc.text : b.code.textContent || '';
      const numbers = doc ? doc.lines.map(line => line.n).join() : '';
      if (text === b.text && b.seenLang === b.lang && numbers === b.numbers) return;
      const first = b.text === null;
      b.text = text; b.seenLang = b.lang; b.numbers = numbers; b.stale = true;
      b.rows = doc ? doc.lines : null;
      b.count = text.trim() ? lines(text).length : 0;
      b.groups = b.count && isShell(b.lang, text) ? commands(text, b.lang) : [];
      b.lineGroup = new Array(b.count).fill(-1);
      b.groups.forEach((group, i) => { for (let line = group.start; line <= group.through; line++) b.lineGroup[line] = i; });
      b.flags = b.count ? scan(text, b.lang) : [];
      // History opens folded; a block that grows past the limit while streaming stays open under the reader.
      // Editors size and virtualize their own content, so they are never folded from outside.
      if (b.count <= FOLD_AT || b.editor) b.fold = null; else if (!b.fold) b.fold = first ? 'folded' : 'open';
    }
    const lineNumber = (b, line) => b.rows?.[line]?.n ?? line + 1;
    function flush() {
      frame = 0;
      if (!on) return;
      const list = [...queue];
      queue.clear();
      for (const b of list) if (blocks.get(b.pre) === b) { try { layout(b); } catch { b.stale = false; } }
    }
    function shape(b) {
      const {pre, code} = b;
      if (b.shaped === code && b.host?.isConnected && b.clip.contains(code) && (b.monaco ? b.host.contains(pre) : (b.editor ? pre.parentElement : b.clip.parentElement) === b.host)) return;
      if (b.monaco) {
        // Nothing is written into Monaco: no padding, no attributes. The overlay hangs off the top of the single-child chain of
        // site wrappers around the editor (Qwen's code body) and copy buttons sit in that wrapper's padding left of the editor.
        let host = pre.parentElement;
        const single = n => [...n.children].filter(child => !child.hasAttribute('data-cs-owned')).length === 1;
        while (host.parentElement && host.parentElement !== document.body && !host.parentElement.matches('pre') && single(host.parentElement)) host = host.parentElement;
        if (b.clip !== pre) { bare(b); b.left0 = b.bottom0 = b.start0 = 0; }
        Object.assign(b, {shaped: code, pad: null, mark: null, clip: pre, host});
        surroundings(b, pre);
        return;
      }
      if (b.editor) {
        // Nothing goes inside .cm-editor: the overlay hangs off its parent, padding reaches .cm-content through a CSS rule keyed
        // on an attribute of the editor, and the gutter tracks .cm-scroller, the editor's own horizontal scroller.
        const clip = pre.querySelector(':scope > .cm-scroller') || pre;
        if (b.pad !== code) {
          bare(b);
          const style = getComputedStyle(code), clipRect = clip.getBoundingClientRect(), padRect = code.getBoundingClientRect();
          b.left0 = parseFloat(style.paddingLeft) || 0; b.bottom0 = parseFloat(style.paddingBottom) || 0;
          b.start0 = Math.max(0, padRect.left + b.left0 - clipRect.left - clip.clientLeft + clip.scrollLeft);
        }
        Object.assign(b, {shaped: code, pad: code, mark: pre, clip, host: pre.parentElement});
        b.round = null; b.stickies = [];
        surroundings(b, pre);
        return;
      }
      let pad = code;
      while (pad !== pre && pad.parentElement && /^(?:inline|contents)/.test(getComputedStyle(pad).display)) pad = pad.parentElement;
      // The nearest horizontal scroller holds the code. It may sit inside pre (Gemini's code), be pre itself (Kimi) or wrap it
      // (ChatGPT's scrollport), so the search continues a few levels above pre while the element still holds only this code.
      // Wrappers that merely clip rounded corners are not scrollers: they also hold the site header.
      const own = (code.textContent || '').length + 400, alone = n => n.querySelectorAll('pre').length <= 1 && (n.textContent || '').length <= own;
      let clip = pad;
      for (let n = pad, above = -1; n && n !== document.body; n = n.parentElement) {
        if (above >= 0 && !alone(n)) break;
        if (/^(?:auto|scroll|overlay)$/.test(getComputedStyle(n).overflowX)) { clip = n; break; }
        if (n === pre) above = 0; else if (above >= 0 && ++above >= 3) break;
      }
      if (b.pad !== pad) {
        bare(b);
        const style = getComputedStyle(pad), clipRect = clip.getBoundingClientRect(), padRect = pad.getBoundingClientRect();
        b.left0 = parseFloat(style.paddingLeft) || 0; b.bottom0 = parseFloat(style.paddingBottom) || 0;
        // Where the code text starts inside the scroller: the numbers take that place and the text moves right of them.
        b.start0 = Math.max(0, padRect.left + pad.clientLeft + b.left0 - clipRect.left - clip.clientLeft + clip.scrollLeft);
      }
      Object.assign(b, {shaped: code, pad, mark: pad, clip, host: clip.parentElement});
      surroundings(b, clip);
    }
    // Rounded corners and sticky headers around the block, so the overlay can be trimmed to match them.
    function surroundings(b, clip) {
      const own = (b.code.textContent || '').length + 600, alone = n => n.querySelectorAll('pre,.cm-editor,.monaco-editor').length <= 1 && (n.textContent || '').length <= own;
      let round = null;
      const stickies = [];
      for (let n = clip, i = 0; n && n !== document.body && i < 7 && (n === clip || alone(n)); n = n.parentElement, i++) {
        const cs = getComputedStyle(n);
        if (!round && ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].some(key => parseFloat(cs[key]) > 0)) round = n;
        const parent = n.parentElement;
        if (!parent || !alone(parent)) continue;
        for (const sibling of parent.children) {
          if (sibling === n || sibling.hasAttribute('data-cs-owned')) continue;
          for (const el of [sibling, ...sibling.querySelectorAll('*')].slice(0, 60)) if (/^(?:sticky|fixed)$/.test(getComputedStyle(el).position)) stickies.push(el);
        }
      }
      Object.assign(b, {round, stickies});
    }
    function bind(b) {
      if (b.bound?.host === b.host && b.bound.clip === b.clip) return;
      unbind(b);
      const move = event => hover(b, event), leave = () => hover(b, null);
      const scroll = () => { if (b.layer) b.layer.style.transform = b.clip.scrollTop ? `translateY(${-b.clip.scrollTop}px)` : ''; };
      b.host.addEventListener('pointermove', move, {passive: true});
      b.host.addEventListener('pointerleave', leave);
      b.clip.addEventListener('scroll', scroll, {passive: true});
      b.bound = {host: b.host, clip: b.clip, move, leave, scroll};
      ro?.observe(b.clip); ro?.observe(b.host);
    }
    function unbind(b) {
      const bound = b.bound;
      if (!bound) return;
      b.bound = null;
      bound.host.removeEventListener('pointermove', bound.move);
      bound.host.removeEventListener('pointerleave', bound.leave);
      bound.clip.removeEventListener('scroll', bound.scroll);
      ro?.unobserve(bound.clip);
      if (![...blocks.values()].some(other => other.bound?.host === bound.host)) ro?.unobserve(bound.host);
    }
    function mount(b) {
      if (b.root?.parentNode === b.host && b.ui) return b.ui;
      b.root?.remove();
      // An owned, zero-size, absolutely positioned anchor appended last: site children keep their order and
      // :first-child styling, and no site element is re-positioned to contain the overlay.
      const root = node('div', 'cs-code-anchor'), ui = node('div', 'cs-code-ui'), gutter = node('div', 'cs-code-gutter'), layer = node('div', 'cs-code-layer'), probe = node('span', 'cs-code-probe');
      const fade = node('div', 'cs-code-fade'), foot = node('div', 'cs-code-foot'), list = node('div', 'cs-code-list'), row = node('div', 'cs-code-row');
      const fold = node('button', 'cs-code-pill cs-code-fold'), chip = node('button', 'cs-code-pill cs-code-chip');
      root.setAttribute('data-cs-owned', 'true'); probe.setAttribute('aria-hidden', 'true'); fold.type = chip.type = 'button';
      list.setAttribute('role', 'list');
      gutter.append(probe, layer); row.append(fold, chip); foot.append(list, row); ui.append(gutter, fade, foot); root.append(ui);
      for (const type of ['keydown', 'keyup', 'keypress']) ui.addEventListener(type, event => { if (event.key !== 'Escape') event.stopPropagation(); });
      ui.addEventListener('keydown', event => rove(b, event));
      ui.addEventListener('click', event => act(b, event));
      Object.assign(b, {root, ui, gutter, layer, probe, fade, foot, listBox: list, foldButton: fold, chip, nums: [], buttons: [], marks: [], hovered: -1});
      owners.set(root, b);
      b.host.append(root);
      return ui;
    }
    function layout(b) {
      b.stale = false;
      if (!b.pre.isConnected || !b.code.isConnected) return;
      shape(b);
      const nums = settings.codeLineNumbers !== false && !b.numbered, copy = b.groups.length > 0, flags = settings.codeDanger !== false ? b.flags : [];
      // A gutter of our own (with padding) only where we may pad the code; Monaco keeps its own margin untouched.
      const fold = settings.codeFold !== false ? b.fold : null, folded = fold === 'folded', wide = !b.monaco && (nums || copy);
      if (!b.count || !nums && !copy && !fold && !flags.length) { bare(b); return; }
      bind(b);
      const ui = mount(b), {clip, mark} = b, style = getComputedStyle(b.code);
      // Colors and font follow the block itself, so the chrome reads as part of it on every site and theme.
      const bg = backdrop(clip), size = Math.round((parseFloat(style.fontSize) || 14) * 8.8) / 10;
      ui.style.setProperty('--cs-fg', style.color);
      if (bg) { ui.style.setProperty('--cs-bg', `rgb(${bg.join(' ')})`); ui.dataset.csCodeTone = (.2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2]) / 255 < .5 ? 'dark' : 'light'; }
      else { ui.style.removeProperty('--cs-bg'); delete ui.dataset.csCodeTone; }
      ui.style.setProperty('--cs-mono', style.fontFamily);
      ui.style.setProperty('--cs-gfs', size + 'px');
      const lineCount = new Set(flags.map(flag => flag.line)).size;
      b.foldButton.hidden = !fold;
      if (fold) {
        const text = folded ? t('expandCode', {n: b.count}) : t('collapseCode');
        b.foldButton.replaceChildren(icon(folded ? 'down' : 'up'), label(text));
        b.foldButton.setAttribute('aria-label', text);
        b.foldButton.setAttribute('aria-expanded', String(!folded));
        b.foldButton.toggleAttribute('data-cs-code-quiet', !folded);
      }
      b.chip.hidden = !flags.length;
      if (flags.length) {
        const text = t('dangerCount', {n: lineCount});
        b.chip.replaceChildren(icon('warn'), label(text));
        b.chip.setAttribute('aria-label', text);
        b.chip.title = flags.map(flag => `${lineNumber(b, flag.line)}  ${t(flag.rule)}`).join('\n');
        b.chip.setAttribute('aria-expanded', String(b.list && !folded));
      }
      const listed = !!flags.length && b.list && !folded;
      b.listBox.hidden = !listed;
      b.listBox.replaceChildren(...(listed ? flags.map(flag => { const item = node('div', 'cs-code-risk'); item.setAttribute('role', 'listitem'); item.setAttribute('aria-label', `${lineNumber(b, flag.line)}: ${t(flag.rule)}`); item.append(label(String(lineNumber(b, flag.line)), 'cs-code-risk-line'), label(t(flag.rule))); return item; }) : []));
      b.fade.hidden = !folded;
      b.foot.hidden = !fold && !flags.length;
      const digit = b.probe.getBoundingClientRect().width / 10 || size * .6, footer = b.foot.hidden ? 0 : b.foot.offsetHeight;
      const lead = Math.max(Math.round(b.start0), 8), column = Math.ceil(Math.max(nums ? String(lineNumber(b, b.count - 1)).length * digit : 0, copy ? 20 : 0)), gap = Math.round(Math.max(12, digit * 1.8));
      const tokens = [];
      if (!mark) {
        // Monaco: room left of the editor inside its wrapper's padding holds the copy buttons; otherwise they go to the right edge.
        const hostBox = b.host.getBoundingClientRect(), own = clip.getBoundingClientRect();
        b.extLeft = Math.max(0, Math.min(28, Math.floor(own.left - hostBox.left - b.host.clientLeft)));
        b.extBottom = Math.max(0, Math.min(24, Math.floor(hostBox.top + b.host.clientTop + b.host.clientHeight - own.bottom)));
        ui.style.setProperty('--cs-lead', Math.max(0, Math.floor((b.extLeft - 16) / 2)) + 'px'); ui.style.setProperty('--cs-col', '20px'); ui.style.setProperty('--cs-gw', '0px');
      } else if (wide) { tokens.push('l'); mark.style.setProperty('--cs-pad-l', Math.round(b.left0 + lead + column + gap - b.start0) + 'px'); } else mark.style.removeProperty('--cs-pad-l');
      // Expanded blocks reserve room under the last line for the pills; folded ones lay them over the fade.
      if (!mark) { /* Monaco: nothing to pad */ } else if (footer && !folded) { tokens.push('b'); mark.style.setProperty('--cs-pad-b', Math.ceil(b.bottom0 + footer) + 'px'); } else mark.style.removeProperty('--cs-pad-b');
      if (mark) {
      if (tokens.length) mark.setAttribute('data-cs-code-pad', tokens.join(' ')); else mark.removeAttribute('data-cs-code-pad');
      ui.style.setProperty('--cs-lead', lead + 'px'); ui.style.setProperty('--cs-col', column + 'px'); ui.style.setProperty('--cs-gw', wide ? lead + column + Math.round(gap / 2) + 'px' : '0px');
      }
      b.gutter.toggleAttribute('data-cs-code-bare', !wide);
      ui.toggleAttribute('data-cs-code-monaco', b.monaco);

      const clipRect = clip.getBoundingClientRect(), scrollY = clip.scrollTop;
      const originTop = clipRect.top + clip.clientTop - scrollY, fallback = parseFloat(style.lineHeight) || size / .88 * 1.5;
      const list = b.editor ? null : texts(b.code), starts = lineStarts(b.text), range = document.createRange(), tops = [], heights = [];
      for (let i = 0; i < b.count; i++) {
        let rect = null;
        if (b.editor) {
          // Each .cm-line holds one line: its first character, or the line box itself when it is empty.
          const el = b.rows[i]?.el, first = el && texts(el)[0];
          if (first) { range.setStart(first.node, 0); range.setEnd(first.node, 1); rect = [...(range.getClientRects?.() || [])].find(item => item.height > 0); }
          if (!rect && el?.isConnected) { const box = el.getBoundingClientRect(); if (box.height) rect = {top: box.top, height: Math.min(box.height, fallback)}; }
        } else {
          const from = locate(list, starts[i], true), to = locate(list, Math.min(starts[i] + 1, b.text.length), false);
          if (from && to && starts[i] < b.text.length) { range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset); rect = [...(range.getClientRects?.() || [])].find(item => item.height > 0); }
        }
        if (rect) { tops.push(rect.top - originTop); heights.push(rect.height); }
        else { tops.push(i ? tops[i - 1] + heights[i - 1] : 0); heights.push(i ? heights[i - 1] : fallback); }
      }
      b.tops = tops; b.heights = heights;
      const marked = new Set();
      for (const flag of flags) for (let line = flag.line; line <= flag.end && line < b.count; line++) marked.add(line);
      const shown = nums ? b.count : 0;
      while (b.nums.length > shown) b.nums.pop().remove();
      while (b.nums.length < shown) b.nums.push(b.layer.appendChild(node('span', 'cs-code-num')));
      b.nums.forEach((num, i) => { num.dataset.csCodeN = lineNumber(b, i); num.style.cssText = `top:${tops[i]}px;height:${heights[i]}px;line-height:${heights[i]}px`; num.toggleAttribute('data-cs-code-danger', marked.has(i)); });
      const runs = [];
      for (const line of [...marked].sort((x, y) => x - y)) { const last = runs.at(-1); if (last && last[1] === line - 1) last[1] = line; else runs.push([line, line]); }
      b.marks.forEach(mark => mark.remove());
      b.marks = runs.map(([from, to]) => { const mark = node('span', 'cs-code-mark'); mark.style.cssText = `top:${tops[from] + 2}px;height:${Math.max(4, tops[to] + heights[to] - tops[from] - 4)}px`; return b.layer.appendChild(mark); });
      const cut = folded && b.count > FOLD_SHOW ? tops[FOLD_SHOW] + heights[FOLD_SHOW] * .5 : Infinity;
      while (b.buttons.length > b.groups.length) b.buttons.pop().remove();
      while (b.buttons.length < b.groups.length) { const button = node('button', 'cs-code-copy'); button.type = 'button'; button.append(icon('copy')); b.buttons.push(b.layer.appendChild(button)); }
      if (b.focus >= b.buttons.length) b.focus = 0;
      b.groups.forEach((group, i) => {
        const button = b.buttons[i];
        button.dataset.csCodeIndex = i;
        button.hidden = tops[group.start] > cut;
        button.style.top = tops[group.start] + (heights[group.start] - 20) / 2 + 'px';
        // Monaco without room on the left: the right edge, clear of its scrollbar.
        button.style.left = b.monaco && b.extLeft < 16 ? `${clip.clientWidth + b.extLeft - 34}px` : '';
        if (!button.hasAttribute('data-cs-code-copied')) button.title = t('copyLine');
        button.setAttribute('aria-label', `${t('copyLine')} ${group.start + 1}`);
        button.tabIndex = i === b.focus ? 0 : -1;
      });
      b.buttons.forEach((button, i) => button.toggleAttribute('data-cs-code-hover', i === b.hovered));
      b.layer.style.transform = scrollY ? `translateY(${-scrollY}px)` : '';
      paint(b, marked, list, starts);
      if (b.monaco) { /* never touch Monaco nodes */ } else if (folded && cut !== Infinity) {
        const cs = getComputedStyle(clip), extra = cs.boxSizing === 'border-box' ? 0 : ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, key) => sum + (parseFloat(cs[key]) || 0), 0);
        clip.style.setProperty('--cs-fold-h', Math.max(0, Math.round(clip.clientTop + cut - extra)) + 'px');
        clip.setAttribute('data-cs-code-fold', 'folded');
      } else { clip.removeAttribute('data-cs-code-fold'); clip.style.removeProperty('--cs-fold-h'); }
      // The anchor sits at its static position after the code, so it moves with folding: place the overlay last.
      const box = clip.getBoundingClientRect(), anchor = b.root.getBoundingClientRect(), extLeft = b.monaco ? b.extLeft : 0, extBottom = b.monaco ? b.extBottom : 0;
      ui.style.top = Math.round((box.top + clip.clientTop - anchor.top) * 100) / 100 + 'px';
      ui.style.left = Math.round((box.left + clip.clientLeft - anchor.left - extLeft) * 100) / 100 + 'px';
      ui.style.width = clip.clientWidth + extLeft + 'px';
      ui.style.height = clip.clientHeight + extBottom + 'px';
      trim(b);
    }
    // Clips the overlay to the block's rounded corners and below a site header that sticks over the code while scrolling,
    // so the site's chrome always stays on top without changing its stacking.
    function trim(b) {
      const u = b.ui.getBoundingClientRect();
      if (!u.width) return;
      let top = 0, right = 0, bottom = 0, left = 0, radii = [0, 0, 0, 0];
      if (b.round?.isConnected) {
        const o = b.round.getBoundingClientRect(), cs = getComputedStyle(b.round), near = (x, y) => Math.abs(x - y) < 1.5;
        top = Math.max(0, o.top - u.top); right = Math.max(0, u.right - o.right); bottom = Math.max(0, u.bottom - o.bottom); left = Math.max(0, u.left - o.left);
        const r = key => parseFloat(cs[key]) || 0, t = near(u.top, o.top), bm = near(u.bottom, o.bottom), l = near(u.left, o.left), rt = near(u.right, o.right);
        radii = [t && l ? r('borderTopLeftRadius') : 0, t && rt ? r('borderTopRightRadius') : 0, bm && rt ? r('borderBottomRightRadius') : 0, bm && l ? r('borderBottomLeftRadius') : 0];
      }
      for (const el of b.stickies) {
        const s = el.getBoundingClientRect();
        if (el.isConnected && s.width >= u.width * .6 && s.bottom > u.top + top && s.top < u.bottom && s.right > u.left && s.left < u.right) { top = s.bottom - u.top; radii[0] = radii[1] = 0; }
      }
      const value = top || right || bottom || left || radii.some(Boolean) ? `inset(${top}px ${right}px ${bottom}px ${left}px round ${radii.map(x => x + 'px').join(' ')})` : '';
      if (b.ui.style.clipPath !== value) b.ui.style.clipPath = value;
    }
    function registry() {
      if (!globalThis.CSS?.highlights || typeof globalThis.Highlight !== 'function') return null;
      highlight ??= new Highlight();
      if (CSS.highlights.get('cs-danger') !== highlight) CSS.highlights.set('cs-danger', highlight);
      return highlight;
    }
    function unpaint(b) { if (highlight) for (const range of b.ranges) highlight.delete(range); b.ranges = []; }
    // Flagged lines are tinted with the Custom Highlight API from their first visible character, without touching the DOM.
    function paint(b, marked, list, starts) {
      unpaint(b);
      const set = marked.size ? registry() : null;
      if (!set) return;
      for (const line of marked) {
        if (b.editor) {
          const el = b.rows[line]?.el, nodes = el ? texts(el) : [], value = el?.textContent || '', first = value.search(/\S/);
          const a = first >= 0 && locate(nodes, first, true), z = first >= 0 && locate(nodes, value.length, false);
          if (a && z) { const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(z.node, z.offset); set.add(range); b.ranges.push(range); }
          continue;
        }
        const from = starts[line], to = (starts[line + 1] ?? b.text.length + 1) - 1, first = b.text.slice(from, to).search(/\S/);
        if (first < 0) continue;
        const a = locate(list, from + first, true), z = locate(list, to, false);
        if (!a || !z) continue;
        const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(z.node, z.offset);
        set.add(range); b.ranges.push(range);
      }
    }
    function hover(b, event) {
      if (!b.ui?.isConnected) return;
      let line = -1, inside = false;
      if (event) {
        const rect = b.ui.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
        const last = b.tops.length - 1, at = y + b.clip.scrollTop;
        if (inside && last >= 0 && at <= b.tops[last] + b.heights[last] + 2) line = nearest(b.tops, at);
      }
      b.ui.toggleAttribute('data-cs-code-hover', inside);
      const group = line >= 0 ? b.lineGroup[line] ?? -1 : -1;
      if (group === b.hovered) return;
      b.buttons[b.hovered]?.removeAttribute('data-cs-code-hover');
      b.buttons[group]?.setAttribute('data-cs-code-hover', '');
      b.hovered = group;
    }
    function rove(b, event) {
      const i = b.buttons.indexOf(event.target);
      const visible = b.buttons.filter(button => !button.hidden), at = visible.indexOf(event.target);
      if (i < 0 || at < 0) return;
      const next = {ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: visible.length - 1}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
      for (const button of b.buttons) button.tabIndex = -1;
      target.tabIndex = 0; b.focus = b.buttons.indexOf(target); target.focus();
    }
    function act(b, event) {
      const button = event.target.closest?.('button');
      if (!button || !b.ui.contains(button)) return;
      if (button === b.foldButton) {
        b.fold = b.fold === 'folded' ? 'open' : 'folded';
        layout(b);
        if (b.fold === 'folded' && b.pre.getBoundingClientRect().top < 0) b.foldButton.scrollIntoView?.({block: 'nearest', behavior: reduced() ? 'auto' : 'smooth'});
      } else if (button === b.chip) {
        if (b.fold === 'folded' && settings.codeFold !== false) { b.fold = 'open'; b.list = true; } else b.list = !b.list;
        layout(b);
      } else if (button.classList.contains('cs-code-copy')) { b.focus = b.buttons.indexOf(button); void copy(b, Number(button.dataset.csCodeIndex), button); }
    }
    async function write(text) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* Clipboard API blocked: fall back below. */ }
      const area = node('textarea'), active = document.activeElement;
      area.setAttribute('data-cs-owned', 'true'); area.setAttribute('readonly', ''); area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(area); area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove(); active?.focus?.({preventScroll: true});
      return ok;
    }
    async function copy(b, index, button) {
      const group = b.groups[index];
      if (!group || !await write(group.text) || !button.isConnected) return;
      button.replaceChildren(icon('check'));
      button.setAttribute('data-cs-code-copied', '');
      button.dataset.csCodeTip = button.title = t('copied');
      const id = setTimeout(() => { timers.delete(id); button.replaceChildren(icon('copy')); button.removeAttribute('data-cs-code-copied'); button.title = t('copyLine'); }, 1200);
      timers.add(id);
    }
    function clean(el, ...names) { if (!el) return; for (const name of names) name.startsWith('--') ? el.style.removeProperty(name) : el.removeAttribute(name); if (el.getAttribute('style') === '') el.removeAttribute('style'); }
    // Removes the block's UI and layout attributes; the data-cs-code marker stays while the block is tracked.
    function bare(b) {
      unbind(b);
      b.root?.remove();
      b.root = b.ui = null; b.nums = []; b.buttons = []; b.marks = []; b.hovered = -1;
      clean(b.mark, 'data-cs-code-pad', '--cs-pad-l', '--cs-pad-b');
      clean(b.clip, 'data-cs-code-fold', '--cs-fold-h');
      unpaint(b);
    }
    function drop(b) {
      bare(b);
      b.marker?.removeAttribute('data-cs-code');
      io?.unobserve(b.pre);
      blocks.delete(b.pre);
      dirty.delete(b); queue.delete(b);
    }
    function stop() {
      if (!on) return;
      on = false;
      clearTimeout(timer); cancelAnimationFrame(frame); clearInterval(poll); timer = frame = poll = 0;
      media?.removeEventListener?.('change', themed);
      document.removeEventListener('scroll', scrolled, {capture: true});
      cancelAnimationFrame(sticky); sticky = 0;
      mo?.disconnect();
      for (const b of [...blocks.values()]) drop(b);
      io?.disconnect(); ro?.disconnect(); mo = io = ro = watched = null;
      for (const id of timers) clearTimeout(id);
      timers.clear(); dirty.clear(); queue.clear(); skipped = new WeakSet();
      if (highlight && globalThis.CSS?.highlights?.get('cs-danger') === highlight) CSS.highlights.delete('cs-danger');
      highlight = null;
    }
    return {
      update(next = {}) {
        if (dead) return;
        settings = {...next};
        if (!(settings.enabled && settings.codeTools && adapter)) { stop(); return; }
        start();
        // Settings, language and cleanup() of owned nodes all land here: rebuild every block on the next tick.
        for (const b of blocks.values()) b.stale = true;
        clearTimeout(timer); timer = setTimeout(tick, 0);
      },
      destroy() { stop(); dead = true; }
    };
  }
  return {create, scan, isShell, commands, stripPrompt, lines, editorLines, monacoLines, FOLD_AT, FOLD_SHOW};
})();
