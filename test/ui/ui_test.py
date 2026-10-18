"""AI Forecast Atlas browser test (Playwright, Chromium): public site, embed, admin release builder and the single-file preview.
   python3 test/ui/ui_test.py            (after: node web/build.mjs)
   Starts PHP's built-in server for the site and for mocked external services; screenshots go to test/ui/out/."""
import base64, json, os, re, shutil, subprocess, sys, tempfile, time
import requests
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'test', 'ui', 'out')
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix='aim-ui-')
WEB = os.path.join(TMP, 'aimonitor')
shutil.copytree(os.path.join(ROOT, 'dist', 'homepl', 'aimonitor'), WEB)
SITE, MOCK = 'http://127.0.0.1:18180/', 'http://127.0.0.1:18190'
env = dict(os.environ, MOCK_LOG=os.path.join(TMP, 'mock.jsonl'), PHP_CLI_SERVER_WORKERS='4')
procs = [subprocess.Popen(['php', '-S', '127.0.0.1:18190', os.path.join(ROOT, 'test', 'mock', 'mock.php')], env=env, stderr=subprocess.DEVNULL),
         subprocess.Popen(['php', '-S', '127.0.0.1:18180', '-t', WEB], env=env, stderr=subprocess.DEVNULL)]
time.sleep(1.0)
results, problems = [], []

# ---------- fixtures for 1.1: an X watch list and one value found by the AI research panel ----------
def xw_items():
    """Nine X watch items X20 … X12 (newest first); X15 carries planted script links and markup in its title."""
    items = []
    for n, i in enumerate(range(20, 11, -1)):
        it = {'id': 'X%d' % i, 'date': '2026-10-%02d' % (19 - n),
              'title': 'Microsoft says 2027 capex will grow faster than 2026' if i == 20 else 'Signal %d about AI compute and prices' % i,
              'summary': 'The CFO said on X that capital spending next year will grow faster than this year, mainly for AI data centres.',
              'why': 'Big-4 capex is the largest driver of the scenarios; faster growth points to the upper paths.',
              'topics': ['markets', 'compute'], 'metrics': ['K'], 'anchors': ['AN1'], 'direction': 'up',
              'credibility': ['high', 'medium', 'low', 'unverified'][n % 4], 'credNote': 'Official company account and CFO',
              'impact': ['high', 'medium', 'low'][n % 3], 'impactNote': 'Widely shared',
              'posts': [{'url': 'https://x.com/Microsoft/status/18500000000000000%02d' % i, 'handle': 'Microsoft', 'name': 'Microsoft', 'kind': 'official', 'posted': '2026-10-18'},
                        {'url': 'https://x.com/somecfo/status/18500000000000001%02d' % i, 'handle': '@somecfo', 'name': 'A. Example', 'kind': 'executive', 'posted': '2026-10-18'}],
              'refs': [{'title': 'Reuters: Microsoft capex outlook', 'url': 'https://www.reuters.com/technology/example-%d' % i}],
              'via': {'type': 'x', 'name': 'Grok X search, reviewed by the editor', 'model': 'xAI grok-4.3'}, 'reviewed': '2026-10-19'}
        if i == 15:
            it['posts'].append({'url': 'javascript:alert(1)', 'handle': 'evil', 'kind': 'other'})
            it['refs'].append({'title': 'bad', 'url': ' java\tscript:alert(2)'})
            it['title'] = '<img src=x onerror=alert(3)> Script test'
        items.append(it)
    return items
PANEL_VIA = {'type': 'ai', 'name': 'AI research panel (4 of 5 agents answered)', 'model': 'OpenAI gpt-6.1-sol',
    'panel': {'rule': 'weighted median', 'asked': 5, 'answered': 4, 'agree': 0.82, 'tol': 0.1, 'lo': 5.38, 'hi': 5.6, 'members': [
        {'agent': 'OpenAI', 'model': 'gpt-6.1-sol', 'w': 3, 'v': '$5.42T', 'value': 5.42, 'basis': 'source', 'url': 'https://example.com/nvda', 'title': 'Example Markets', 'agrees': True, 'lead': True},
        {'agent': 'Anthropic', 'model': 'claude-sonnet-5-5', 'w': 3, 'v': '$5.40T', 'value': 5.4, 'basis': 'source', 'url': 'https://example.org/nvda', 'title': 'Second outlet', 'agrees': True},
        {'agent': 'Google Gemini', 'model': 'gemini-3.8-flash', 'w': 2, 'v': '$6.10T', 'value': 6.1, 'basis': 'source', 'url': 'javascript:alert(4)', 'title': 'Planted link', 'agrees': False},
        {'agent': 'DeepSeek', 'model': 'deepseek-v4-pro', 'w': 1, 'v': '', 'value': None, 'basis': 'knowledge', 'note': 'Knows market caps to mid-2026 only.', 'none': 'No newer figure known'}]}}
def write_fixture(web):
    items = xw_items()
    with open(os.path.join(web, 'data', 'xwatch.json'), 'w') as f:
        json.dump({'schema': 'aimonitor.xwatch/1', 'updated': '2026-10-19T09:12:00+02:00', 'about': 'test', 'items': items}, f)
    p = os.path.join(web, 'data', 'latest', 'release.js')
    s = open(p).read(); pre = 'window.AIMONITOR_DATA = '
    d = json.loads(s[len(pre):].rstrip().rstrip(';'))
    d['dataset']['anchors']['AN4']['via'] = PANEL_VIA
    d['release']['xwatch'] = [items[0], items[-1]]
    with open(p, 'w') as f: f.write(pre + json.dumps(d) + ';\n')

def check(name, cond, info=''):
    results.append((name, bool(cond)))
    print(('  ✓ ' if cond else '  ✗ ') + name + ('' if cond else '  — ' + str(info)))
    if not cond: problems.append(name)

def check_reading_size(browser):
    """Exercise the actual control and rendered text in isolated browser profiles."""
    print('Remembered text size')
    storage_key = 'aimonitor.text-size.v1'
    seen_guide = 'localStorage.setItem("aimonitor.guide.v1", JSON.stringify({ seen: true }));'

    def ready(page):
        page.wait_for_function('() => window.AICX_UI && document.querySelector("#briefThesis").textContent.trim()')

    def text_px(page):
        return page.eval_on_selector('#briefThesis', 'e => parseFloat(getComputedStyle(e).fontSize)')

    def near(actual, expected):
        return abs(actual - expected) < 0.1

    def fits(page):
        return page.evaluate('''() => {
          const root = document.documentElement, box = document.querySelector('#textSize').getBoundingClientRect();
          return { overflow: root.scrollWidth - root.clientWidth,
            controlFits: box.left >= -1 && box.right <= root.clientWidth + 1 && box.width > 0 };
        }''')

    def chat_geometry(page):
        return page.evaluate('''() => {
          const box = document.querySelector('#chat'), log = document.querySelector('#chatLog'),
            sugg = document.querySelector('#chatSugg');
          return { height: box.clientHeight, log: log.clientHeight, suggestions: sugg.clientHeight,
            suggestionCount: sugg.querySelectorAll('button').length,
            suggestionOverflow: sugg.scrollHeight - sugg.clientHeight,
            suggestionScroll: getComputedStyle(sugg).overflowY,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        }''')

    def reachable_in_chat(page, selector, parent='#chat'):
        target = page.locator(selector)
        target.scroll_into_view_if_needed()
        return target.evaluate('''(e, parent) => {
          const b = e.getBoundingClientRect(), p = document.querySelector(parent).getBoundingClientRect(),
            chat = document.querySelector('#chat').getBoundingClientRect();
          return b.width > 0 && b.height > 0 && b.top >= Math.max(0, p.top, chat.top) - 1 &&
            b.bottom <= Math.min(innerHeight, p.bottom, chat.bottom) + 1 &&
            b.left >= Math.max(0, p.left, chat.left) - 1 &&
            b.right <= Math.min(innerWidth, p.right, chat.right) + 1 &&
            e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1;
        }''', parent)

    def enlarged_chat(page, label):
        # Opening chat needs only the suite's mock-provider configuration; no question is sent.
        page.click('#chatFab')
        page.wait_for_selector('#chatSugg button')
        geometry = chat_geometry(page)
        check('150% chat keeps readable conversation space and capped suggestions on ' + label,
              geometry['log'] >= 120 and geometry['suggestionCount'] >= 3 and
              geometry['suggestions'] <= geometry['height'] * 0.25 and geometry['overflow'] <= 1 and
              (geometry['suggestionOverflow'] <= 1 or geometry['suggestionScroll'] in ['auto', 'scroll']), geometry)
        check('150% chat can scroll to its last initial suggestion on ' + label,
              reachable_in_chat(page, '#chatSugg button:last-child', '#chatSugg'))
        reachable = {selector: reachable_in_chat(page, selector) for selector in ['#chatIn', '#chatSend', '#chatFoot']}
        # A trial click verifies the controls are not covered; it never submits a message.
        page.locator('#chatIn').click(trial=True)
        page.locator('#chatSend').click(trial=True)
        check('150% chat input, Send and complete privacy footer remain reachable on ' + label,
              all(reachable.values()) and 'Please do not enter personal data.' in page.inner_text('#chatFoot'), reachable)
        page.keyboard.press('Escape')

    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    ctx.add_init_script(seen_guide)
    errors = []
    try:
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(SITE, wait_until='networkidle'); ready(page)
        size = page.get_by_label('Text size', exact=True)
        normal = text_px(page)
        check('Text size is a labelled native control, initially 100%', size.is_visible() and size.input_value() == '100' and normal > 0)
        size.select_option('125')
        check('125% visibly enlarges the scenario explanation', near(text_px(page), normal * 1.25), (normal, text_px(page)))
        size.select_option('150')
        check('150% visibly enlarges the scenario explanation', near(text_px(page), normal * 1.5), (normal, text_px(page)))
        dimensions = fits(page)
        check('150% fits the desktop viewport and keeps the control reachable', dimensions['overflow'] <= 1 and dimensions['controlFits'], dimensions)
        page.reload(wait_until='networkidle'); ready(page)
        check('text size survives reload with the same rendered size', size.input_value() == '150' and near(text_px(page), normal * 1.5))
        other = ctx.new_page()
        other.goto(SITE + '?s=PWR', wait_until='networkidle'); ready(other)
        check('a new page on the site remembers text size independently of its scenario', other.get_by_label('Text size', exact=True).input_value() == '150' and near(text_px(other), normal * 1.5) and 'PWR' in other.inner_text('#briefCode'))
        other.close()

        page.click('#bTheme')
        chosen_theme = page.get_attribute('html', 'data-theme')
        page.click('#bLayout'); page.click('#lmenu >> text=Big charts')
        check('theme and layout changes leave text size at 150%', size.input_value() == '150' and near(text_px(page), normal * 1.5) and page.eval_on_selector('#phasePanel', 'e => e.parentElement.id') == 'stage')
        size.select_option('100')
        check('returning to 100% changes only text size', near(text_px(page), normal) and page.get_attribute('html', 'data-theme') == chosen_theme and page.eval_on_selector('#phasePanel', 'e => e.parentElement.id') == 'stage')
        size.select_option('150')
        page.click('#bLayout'); page.click('#lmenu .reset'); page.keyboard.press('Escape')
        check('Reset layout preserves the text-size and theme choices', size.input_value() == '150' and near(text_px(page), normal * 1.5) and page.get_attribute('html', 'data-theme') == chosen_theme and page.eval_on_selector('#phasePanel', 'e => e.parentElement.id') == 'colRight')

        size.select_option('100'); size.focus()
        before = page.evaluate('() => [AICX_UI.state.key, AICX_UI.state.t, AICX_UI.state.playing]')
        page.keyboard.press('ArrowDown'); page.keyboard.press('Enter')
        check('keyboard selects 125% without moving or playing the timeline', size.input_value() == '125' and near(text_px(page), normal * 1.25) and page.evaluate('() => [AICX_UI.state.key, AICX_UI.state.t, AICX_UI.state.playing]') == before)
        size.select_option('100'); page.click('#chatFab')
        normal_chat = chat_geometry(page)
        page.keyboard.press('Escape'); size.select_option('150')
        enlarged_chat(page, 'desktop')
        size.select_option('100'); page.click('#chatFab')
        restored_chat = chat_geometry(page)
        check('returning chat to 100% restores its original dimensions',
              all(abs(normal_chat[k] - restored_chat[k]) <= 1 for k in ['height', 'log', 'suggestions']))
        page.keyboard.press('Escape')
        check('text-size controls produce no script errors', not errors, errors[:3])
    finally:
        ctx.close()

    # Bad JSON, a valid but unsupported size, and a numeric-looking string all fall back safely.
    for label, stored in [('malformed JSON', '{broken'), ('unsupported size', '175'), ('wrong value type', '"150"')]:
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
        ctx.add_init_script(seen_guide + 'localStorage.setItem(' + json.dumps(storage_key) + ', ' + json.dumps(stored) + ');')
        errors = []
        try:
            page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(SITE, wait_until='networkidle'); ready(page)
            size = page.get_by_label('Text size', exact=True)
            fallback = size.input_value() == '100' and near(text_px(page), normal)
            size.select_option('125')
            saved = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', storage_key)
            check(label + ' falls back to 100% and can be replaced by a valid choice', fallback and saved == 125 and near(text_px(page), normal * 1.25) and not errors, errors[:3])
        finally:
            ctx.close()

    # A browser can deny even access to localStorage, not just setItem().
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    ctx.add_init_script('''Object.defineProperty(window, 'localStorage', { configurable: true,
      get() { throw new DOMException('Storage is blocked for this test', 'SecurityError'); } });''')
    errors = []
    try:
        page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(SITE, wait_until='networkidle'); ready(page)
        size = page.get_by_label('Text size', exact=True)
        check('blocked storage defaults to readable 100% without breaking startup', size.input_value() == '100' and near(text_px(page), normal) and not errors, errors[:3])
        size.select_option('150')
        check('text size still works for this page when storage writes are denied', size.input_value() == '150' and near(text_px(page), normal * 1.5) and not errors, errors[:3])
        page.reload(wait_until='networkidle'); ready(page)
        check('blocked storage reload falls back to 100% without errors', size.input_value() == '100' and near(text_px(page), normal) and not errors, errors[:3])
    finally:
        ctx.close()

    for width in [390, 320]:
        ctx = browser.new_context(viewport={'width': width, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, reduced_motion='reduce')
        ctx.add_init_script(seen_guide)
        try:
            page = ctx.new_page(); page.goto(SITE, wait_until='networkidle'); ready(page)
            mobile_normal = text_px(page)
            page.get_by_label('Text size', exact=True).select_option('150')
            dimensions = fits(page)
            check('150% text fits a %d px phone without horizontal scrolling' % width, near(text_px(page), mobile_normal * 1.5) and dimensions['overflow'] <= 1 and dimensions['controlFits'], dimensions)
            enlarged_chat(page, '%d px phone' % width)
        finally:
            ctx.close()

    ctx = browser.new_context(viewport={'width': 390, 'height': 480}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    ctx.add_init_script(seen_guide)
    try:
        page = ctx.new_page(); page.goto(SITE, wait_until='networkidle'); ready(page)
        page.get_by_label('Text size', exact=True).select_option('150')
        enlarged_chat(page, 'a short 390 × 480 viewport')
    finally:
        ctx.close()

s = requests.Session()
def admin(a, body=None):
    if body is None: return s.get(SITE + 'api/admin.php?a=' + a).json()
    return s.post(SITE + 'api/admin.php?a=' + a, json={'p': base64.b64encode(json.dumps(body).encode()).decode()}, headers={'X-AIM-CSRF': CSRF}).json()
def cli(php):
    r = subprocess.run(['php', '-r', 'define("AIM_ROOT", ' + json.dumps(WEB) + '); define("AIM_PRIVATE", AIM_ROOT . "/_private"); require AIM_PRIVATE . "/lib/bootstrap.php"; ' + php], capture_output=True, text=True, env=env)
    if r.returncode: print(r.stderr)
    return r.stdout
try:
    s.get(SITE + 'admin/')
    key = open(os.path.join(WEB, '_private/storage/setup-key.php')).read().strip().split('\n')[-1]
    CSRF = ''
    PW = 'ui-test-password-123'
    assert admin('setup', {'setupKey': key, 'password': PW, 'email': 'admin@example.com', 'siteUrl': SITE})['ok']
    CSRF = re.search(r'name="aim-csrf" content="([a-f0-9]+)"', s.get(SITE + 'admin/').text).group(1)
    assert admin('settings', {'settings': {
        'ai': {'providers': {'openai': {'key': 'sk-test', 'base': MOCK + '/openai/v1'}}},
        'mailjet': {'public_key': 'mjpub', 'private_key': 'mjpriv', 'list_id': '77', 'from_email': 'news@aiforecastatlas.com', 'base': MOCK + '/mj'},
        'sources': {'research_enabled': False, 'bases': {'openrouter': MOCK + '/or/api/v1', 'epoch': MOCK + '/epoch', 'sec': MOCK + '/sec', 'eia': MOCK + '/eia'}}}})['ok']
    with sync_playwright() as p:
        br = p.chromium.launch()
        # ---------- public site, desktop ----------
        print('Public site (desktop)')
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
        pg.goto(SITE, wait_until='networkidle')
        pg.wait_for_timeout(1200)
        check('no script errors on load', not errors, errors[:3])
        check('release bar shows the base release', 'BASE RELEASE' in pg.inner_text('#relbar') and '2026-W42' in pg.inner_text('#relbar'))
        check('brand line shows data date and release', 'release 2026-w42' in pg.inner_text('#brandSub').lower())
        check('credits name Creoox and xeokit', 'xeokit SDK' in pg.inner_text('#credits') and 'Creoox AG' in pg.inner_text('#credits'))
        check('X watch panel shows its empty state before anything is approved', pg.is_visible('#xwatchPanel') and 'Every weekday Grok' in pg.inner_text('#xwlist .xw-empty') and pg.eval_on_selector_all('#xwlist .xw', 'e => e.length') == 0)
        # ---------- guidance: first-visit hint and the guided tour ----------
        print('Guidance and provenance')
        pg.wait_for_selector('.tour-hint', timeout=5000)
        check('first-visit hint offers the tour', 'tour' in pg.inner_text('.tour-hint').lower())
        pg.click('.tour-hint >> text=Take the tour'); pg.wait_for_timeout(600)
        check('tour opens with a spotlight and step card', pg.is_visible('.tour-card') and pg.is_visible('.tour-hole') and 'step 1 of' in pg.inner_text('.tour-card').lower())
        n_steps = int(re.search(r'of (\d+)', pg.inner_text('.tour-card .kick'), re.I).group(1))
        check('tour has 8–12 steps', 8 <= n_steps <= 12, n_steps)
        pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(500)
        check('arrow key moves to the next step', 'step 2 of' in pg.inner_text('.tour-card .kick').lower())
        pg.click('.tour-card >> text=Back'); pg.wait_for_timeout(400)
        check('back button returns', 'step 1 of' in pg.inner_text('.tour-card .kick').lower())
        pg.screenshot(path=os.path.join(OUT, 'tour.png'))
        for _ in range(4): pg.keyboard.press('Shift+Tab')
        check('focus stays inside the tour card (Shift+Tab)', pg.evaluate('() => !!document.activeElement.closest(".tour-card")'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Escape ends the tour and it is remembered', not pg.is_visible('.tour-card') and pg.evaluate('() => localStorage.getItem("aimonitor.guide.v1")') is not None)
        # ---------- explainer for every panel ----------
        M = pg.evaluate('() => window.AIMONITOR_METHODS')
        bad = []
        for pid in pg.evaluate('() => AICX_UI.panels()'):
            pg.click('[data-panel="%s"] > .ph .pc [data-act="info"]' % pid); pg.wait_for_timeout(120)
            ok = pg.is_visible('#xpl') and pg.inner_text('#xplT') == M['panels'][pid]['title'] and pg.eval_on_selector_all('#xpl .gsec', 'e => e.length') >= 3
            if not ok: bad.append(pid)
            if pid == 'phase': pg.screenshot(path=os.path.join(OUT, 'explainer_dark.png'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(80)
            if pg.is_visible('#xpl'): bad.append(pid + ':esc')
        check('every panel has an explainer (overview, how to read, method, sources, caveats)', not bad and len(M['panels']) >= 25, bad)
        pg.click('#lanesPanel > .ph .pc [data-act="info"]'); pg.wait_for_timeout(150)
        check('explainer shows formulas of its measures', pg.eval_on_selector_all('#xpl pre.fx', 'e => e.length') >= 1)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        check('focus returns to the ⓘ button after Escape', pg.evaluate('() => document.activeElement && document.activeElement.dataset.act') == 'info')
        # ---------- provenance on numbers ----------
        pg.click('#kpis .kpi >> nth=0'); pg.wait_for_timeout(250)
        txt = pg.inner_text('#prov')
        check('KPI opens provenance with a type badge and the formula', pg.is_visible('#prov') and 'MODEL OUTPUT' in txt.upper() and pg.eval_on_selector_all('#prov pre.fx', 'e => e.length') >= 1, txt[:120])
        pg.screenshot(path=os.path.join(OUT, 'provenance_kpi.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.click('#bNow'); pg.wait_for_timeout(200)
        pg.click('#kpis .kpi >> nth=0'); pg.wait_for_timeout(250)
        check('at Q4 2026 the KPI shows its source', 'platformonomics' in pg.inner_text('#prov').lower() and pg.eval_on_selector_all('#prov a[href^="https://"]', 'e => e.length') >= 1)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.click('#ledger tbody tr[data-an="AN1"] .prov-id'); pg.wait_for_timeout(250)
        check('ledger row opens full provenance with links', 'Platformonomics' in pg.inner_text('#prov') and pg.eval_on_selector_all('#prov a[href*="platformonomics.com"]', 'e => e.length') == 1 and 'Obtained' in pg.inner_text('#prov'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.click('#signs tbody tr >> nth=0 >> .lnk'); pg.wait_for_timeout(200)
        check('signpost opens its rule', pg.is_visible('#prov') and 'rule' in pg.inner_text('#prov').lower())
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.goto(SITE + '?t=2030Q4', wait_until='networkidle'); pg.wait_for_timeout(800)
        pg.eval_on_selector('#heat', 'e => e.scrollIntoView({block: "center"})'); pg.wait_for_timeout(200)
        hw = pg.eval_on_selector('#heat', 'e => e.clientWidth')
        pg.click('#heat', position={'x': hw * 0.6, 'y': 60}); pg.wait_for_timeout(300)
        check('impact cell opens the score calculation', pg.is_visible('#prov') and 'tanh' in pg.inner_text('#prov'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        # ---------- Sources & methods ----------
        pg.click('#bSources'); pg.wait_for_timeout(400)
        anchors = pg.evaluate('() => AICX_UI.engine.ANCHORS.map(a => [a.id, a.url || ""])')
        rows = pg.eval_on_selector_all('.overlay[data-dlg="sources"] .anrow', 'e => e.map(x => x.dataset.an)')
        missing = [a for a, u in anchors if u and not pg.query_selector('.anrow[data-an="%s"] a[href="%s"]' % (a, u))]
        check('Sources & methods lists all 26 anchors with their links', len(rows) == 26 and len(anchors) == 26 and not missing, (len(rows), missing))
        pg.fill('.overlay[data-dlg="sources"] input[type=search]', 'trendforce'); pg.wait_for_timeout(200)
        vis = pg.eval_on_selector_all('.anrow:not([hidden])', 'e => e.map(x => x.dataset.an)')
        check('source search filters', vis == ['AN11'], vis)
        pg.fill('.overlay[data-dlg="sources"] input[type=search]', '')
        pg.screenshot(path=os.path.join(OUT, 'sources_methods.png'))
        pg.click('#stab-methods'); pg.wait_for_timeout(200); pg.click('#method-K summary'); pg.wait_for_timeout(200)
        check('methods tab shows the capex formula', 'K_floor' in pg.inner_text('#method-K'))
        pg.click('#stab-verify'); pg.wait_for_timeout(150)
        check('verification process and labels are explained', 'Human review' in pg.inner_text('#spane-verify') and pg.eval_on_selector_all('#spane-verify .bdg', 'e => e.length') >= 8)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.goto(SITE + '#src-AN12', wait_until='networkidle'); pg.wait_for_timeout(900)
        check('deep link #src-AN12 opens that anchor', pg.is_visible('.overlay[data-dlg="sources"]') and pg.eval_on_selector('#src-row-AN12 details', 'e => e.open'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        # ---------- keyboard: shortcuts never hijack buttons or dialogs ----------
        pg.focus('#bSub'); pg.keyboard.press('Space'); pg.wait_for_timeout(300)
        check('Space presses the focused button (Subscribe opens, playback does not start)', pg.is_visible('.overlay[data-dlg="subscribe"]') and pg.inner_text('#playTxt').strip().lower() == 'play')
        t0 = pg.evaluate('() => AICX_UI.state.t')
        pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
        check('arrow keys do not move the timeline behind a dialog', pg.evaluate('() => AICX_UI.state.t') == t0)
        pg.focus('.overlay[data-dlg="subscribe"] button:has-text("Select all")'); pg.keyboard.press('Space'); pg.wait_for_timeout(150)
        check('Space activates “Select all” in the dialog', pg.eval_on_selector_all('.overlay[data-dlg="subscribe"] input[name=categories]', 'e => e.every(x => x.checked)') and pg.inner_text('#playTxt').strip().lower() == 'play')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.evaluate('() => document.activeElement && document.activeElement.blur()')
        pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150)
        check('arrow keys still move the timeline when nothing is focused', pg.evaluate('() => AICX_UI.state.t') != t0)
        pg.goto(SITE, wait_until='networkidle'); pg.wait_for_timeout(800)
        pg.screenshot(path=os.path.join(OUT, 'site_desktop_dark.png'))
        pg.click('#bTheme'); pg.wait_for_timeout(500)
        check('theme switch to light', pg.get_attribute('html', 'data-theme') == 'light')
        pg.screenshot(path=os.path.join(OUT, 'site_desktop_light.png'))
        pg.click('#phasePanel > .ph .pc [data-act="info"]'); pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(OUT, 'explainer_light.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        pg.click('#kpis .kpi >> nth=2'); pg.wait_for_timeout(200)
        pg.screenshot(path=os.path.join(OUT, 'provenance_light.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        pg.click('#bTheme'); pg.wait_for_timeout(300)
        check('theme back to dark', pg.get_attribute('html', 'data-theme') == 'dark')
        # layout: expand the phase portrait
        pg.click('#phasePanel .pc [data-act="focus"]'); pg.wait_for_timeout(500)
        box = pg.eval_on_selector('#phase', 'e => [e.clientWidth, e.clientHeight]')
        check('phase portrait expands to a large view', box[0] > 1000 and box[1] > 500, box)
        pg.screenshot(path=os.path.join(OUT, 'phase_expanded.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Escape closes the expanded view', pg.eval_on_selector('#phasePanel', 'e => !e.classList.contains("is-focus")'))
        h0 = pg.eval_on_selector('#phase', 'e => e.clientHeight')
        pg.click('#phasePanel .pc [data-act="size"]'); pg.wait_for_timeout(400)
        h1 = pg.eval_on_selector('#phase', 'e => e.clientHeight')
        check('size button makes the chart taller', h1 > h0 + 50 and pg.get_attribute('#phasePanel', 'data-size') == 'l', (h0, h1))
        pg.click('#bLayout'); pg.wait_for_timeout(300)
        check('layout menu opens', pg.is_visible('#lmenu'))
        pg.click('#lmenu >> text=Big charts'); pg.wait_for_timeout(500)
        check('preset pins the phase portrait full width', pg.eval_on_selector('#phasePanel', 'e => e.parentElement.id') == 'stage')
        pg.screenshot(path=os.path.join(OUT, 'preset_big_charts.png'))
        pg.click('#bLayout'); pg.wait_for_timeout(200)
        pg.click('#lmenu .reset'); pg.wait_for_timeout(400)
        check('reset to default', pg.eval_on_selector('#phasePanel', 'e => e.parentElement.id') == 'colRight' and pg.get_attribute('#phasePanel', 'data-size') is None)
        pg.keyboard.press('Escape')
        pg.click('#bLayout'); pg.click('#lmenu >> text=Customize panels…'); pg.wait_for_timeout(300)
        pg.click('#netPanel .pc [data-act="hide"]'); pg.wait_for_timeout(300)
        check('hide a panel', pg.eval_on_selector('#netPanel', 'e => e.hidden'))
        pg.click('#bLayout'); pg.click('#lmenu >> text=Show Causal map'); pg.wait_for_timeout(300)
        check('show it again from the menu', pg.eval_on_selector('#netPanel', 'e => !e.hidden'))
        pg.keyboard.press('Escape'); pg.keyboard.press('Escape')
        n0 = pg.eval_on_selector_all('#kpis .kpi', 'e => e.length')
        pg.click('#bLayout'); pg.click('#lmenu .checks label:has-text("Big-4 capex") input'); pg.wait_for_timeout(300)
        n1 = pg.eval_on_selector_all('#kpis .kpi', 'e => e.length')
        check('KPI picker removes a tile', n1 == n0 - 1, (n0, n1))
        pg.click('#lmenu .reset'); pg.keyboard.press('Escape')
        saved = pg.evaluate('() => localStorage.getItem("aimonitor.layout.v1")')
        check('layout is remembered in the browser', saved is not None)
        # chat
        print('Chat and dialogs')
        pg.click('#chatFab'); pg.wait_for_timeout(300)
        pg.click('#chatSugg button >> nth=0')
        pg.wait_for_selector('#chatLog .m.a b', timeout=15000)
        pg.wait_for_function("document.querySelector('#chatSend').textContent === 'Send'", timeout=20000)
        txt = pg.inner_text('#chatLog')
        check('chat answers with formatting', 'Great Commoditization' in txt and pg.eval_on_selector_all('#chatLog .m.a li', 'e => e.length') >= 2)
        pg.screenshot(path=os.path.join(OUT, 'chat.png'))
        pg.click('#chat .chat-tabs >> text=Suggest an improvement'); pg.fill('#chatIn', 'Add GPU rents by region'); pg.keyboard.press('Enter')
        pg.wait_for_selector('#chat >> text=Send this to the AI Forecast Atlas team', timeout=15000)
        pg.click('#chat >> text=Send this to the AI Forecast Atlas team'); pg.wait_for_selector('#chat >> text=Sent. Thank you!', timeout=10000)
        check('suggestion sent from the chat', True)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check('Escape closes the chat', pg.is_hidden('#chat'))
        pg.click('#bSub'); pg.wait_for_timeout(300)
        pg.fill('.dialog input[type=email]', 'reader@example.com'); pg.check('.dialog .consent input'); pg.click('.dialog button[type=submit]')
        pg.wait_for_selector('.dialog .msg-ok', timeout=10000)
        check('newsletter sign-up from the dialog', 'confirmation link' in pg.inner_text('.dialog .msg-ok'))
        pg.screenshot(path=os.path.join(OUT, 'subscribe.png'))
        pg.keyboard.press('Escape')
        pg.click('#bShare'); pg.wait_for_timeout(300)
        link = pg.inner_text('.dialog .codebox >> nth=0')
        check('share link carries scenario and quarter', '?s=COMM' in link and 't=' in link, link)
        with pg.expect_download() as dl:
            pg.click('.dialog button:has-text("Phase portrait")')
        check('save the phase portrait as PNG', dl.value.suggested_filename.endswith('.png'))
        pg.keyboard.press('Escape')
        pg.click('#bData'); pg.wait_for_timeout(300)
        check('data dialog lists the MCP server', 'api/mcp.php' in pg.inner_text('.overlay[data-dlg="data"] .dialog'))
        pg.keyboard.press('Escape')
        # deep link
        pg.goto(SITE + '?s=PWR&t=2029Q2&lens=sw&focus=pools', wait_until='networkidle'); pg.wait_for_timeout(800)
        check('deep link opens scenario, quarter and panel', 'PWR' in pg.inner_text('#briefCode') and pg.eval_on_selector('#poolsPanel', 'e => e.classList.contains("is-focus")'))
        ctx.close()
        # ---------- 1.1: X watch list and a value found by the AI research panel ----------
        print('X watch and the AI research panel')
        write_fixture(WEB)
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'fonts.g' not in m.text and 'ERR_' not in m.text else None)
        ctx.add_init_script('localStorage.setItem("aimonitor.guide.v1", JSON.stringify({ seen: true }));')
        pg.goto(SITE, wait_until='networkidle'); pg.wait_for_timeout(1000)
        ids = pg.eval_on_selector_all('#xwlist .xw', 'e => e.map(x => x.id)')
        check('X watch shows the newest six items first', ids == ['x-X%d' % i for i in range(20, 14, -1)], ids)
        first = pg.inner_text('#x-X20')
        check('an item carries credibility and impact labels, why it matters and the review line', 'HIGH CREDIBILITY' in first.upper() and 'HIGH IMPACT' in first.upper() and 'Why it matters' in first and 'reviewed 19 Oct 2026' in first)
        posts = pg.eval_on_selector_all('#x-X20 .xw-posts a', 'e => e.map(a => [a.href, a.target, a.rel])')
        check('post links open x.com in a new tab', len(posts) == 2 and all(h.startswith('https://x.com/') and t == '_blank' and 'noopener' in r for h, t, r in posts), posts)
        check('X watch never renders script links or markup from the data', pg.evaluate('() => [...document.querySelectorAll("a")].filter(a => a.protocol === "javascript:").length') == 0 and pg.eval_on_selector_all('#xwlist img', 'e => e.length') == 0 and '<img' in pg.inner_text('#x-X15 .xw-t'))
        pg.click('#xwlist .xw-more'); pg.wait_for_timeout(200)
        check('“Show all” lists every item', pg.eval_on_selector_all('#xwlist .xw', 'e => e.length') == 9)
        pg.click('#x-X20 .achip[data-prov^="m:K"]'); pg.wait_for_timeout(300)
        check('a measure chip opens its value and source at Q4 2026', pg.is_visible('#prov') and 'Q4 2026' in pg.inner_text('#prov'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.eval_on_selector('#xwatchPanel', 'e => e.scrollIntoView({block: "start"})'); pg.wait_for_timeout(200)
        pg.locator('#xwatchPanel').screenshot(path=os.path.join(OUT, 'xwatch_dark.png'))
        pg.goto(SITE + '#x-X12', wait_until='networkidle'); pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1200)
        hit = pg.evaluate('() => { const n = document.querySelector(".xw.hit"); if (!n) return null; const r = n.getBoundingClientRect(); return [n.id, r.top >= 0 && r.bottom <= innerHeight]; }')
        check('deep link #x-X12 opens the list, scrolls to the item and highlights it', hit == ['x-X12', True], hit)
        # panel provenance
        pg.click('#ledger tbody tr[data-an="AN4"] .prov-id'); pg.wait_for_timeout(300)
        ap = pg.inner_text('#prov .apanel') if pg.is_visible('#prov .apanel') else ''
        check('panel provenance: summary, every agent, weights, lead answer and AI knowledge', '4 of 5 agents answered' in ap and '2 of 3 agree within ±10%' in ap and 'range 5.38–5.6' in ap and 'weight 3' in ap and 'LEAD ANSWER' in ap.upper() and 'AI KNOWLEDGE' in ap.upper() and 'No newer figure known' in ap, ap[:200])
        check('panel member links are web links only', pg.eval_on_selector_all('#prov .apanel a', 'e => e.map(a => a.href)') == ['https://example.com/nvda', 'https://example.org/nvda'] and 'Planted link' in ap)
        check('obtained line names the panel and the lead answer', 'AI research panel' in pg.inner_text('#prov .via') and 'lead answer: OpenAI gpt-6.1-sol' in pg.inner_text('#prov .via'))
        pg.screenshot(path=os.path.join(OUT, 'provenance_panel.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        check('ledger row labels a panel value', 'AI research panel' in pg.inner_text('#ledger tbody tr[data-an="AN4"] .via-s') and '2 of 3 agree' in pg.inner_text('#ledger tbody tr[data-an="AN4"] .via-s'))
        # release dialog lists the week's X watch items
        pg.click('#relbar a:has-text("what changed")'); pg.wait_for_timeout(300)
        dlg = pg.inner_text('.overlay[data-dlg="changes"] .dialog')
        check('release dialog lists “X watch this week”', 'x watch this week' in dlg.lower() and 'Microsoft says 2027 capex' in dlg and 'signals, not data' in dlg.lower() and pg.eval_on_selector_all('.overlay[data-dlg="changes"] .xw-mini li', 'e => e.length') == 2, dlg[-400:])
        pg.click('.overlay[data-dlg="changes"] .xw-mini li:last-child button:has-text("Show")'); pg.wait_for_timeout(700)
        check('“Show” closes the dialog and highlights the item', not pg.is_visible('.overlay[data-dlg="changes"]') and pg.evaluate('() => (document.querySelector(".xw.hit") || {}).id') == 'x-X12')
        # chat citations [X12]
        pg.evaluate('() => { const d = document.createElement("div"); d.id = "xwTest"; d.className = "m a"; d.innerHTML = AICX_SITE.renderMarkdown("Microsoft hinted at faster capex growth [X20]; older: [X12]; unknown: [X999]."); document.querySelector("main, .frame, body").append(d); }')
        check('[X20] in an answer becomes an X watch chip; an unknown id links to the list file', pg.query_selector('#xwTest .cite.x[data-xw="X20"]') is not None and pg.query_selector('#xwTest a.cite.x[href$="data/xwatch.json"]') is not None and '[X999]' not in pg.inner_text('#xwTest'))
        pg.click('#xwTest .cite.x[data-xw="X12"]'); pg.wait_for_timeout(700)
        check('an X watch chip scrolls to the item and highlights it', pg.evaluate('() => (document.querySelector(".xw.hit") || {}).id') == 'x-X12')
        # light theme
        pg.click('#bTheme'); pg.wait_for_timeout(400)
        col = pg.evaluate('() => { const t = getComputedStyle(document.querySelector("#x-X20 .xw-t")).color, b = getComputedStyle(document.querySelector("#xwatchPanel")).backgroundColor; return [t, b]; }')
        check('X watch reads in the light theme', pg.get_attribute('html', 'data-theme') == 'light' and col[0] != col[1], col)
        pg.eval_on_selector('#xwatchPanel', 'e => e.scrollIntoView({block: "start"})'); pg.wait_for_timeout(200)
        pg.locator('#xwatchPanel').screenshot(path=os.path.join(OUT, 'xwatch_light.png'))
        pg.click('#bTheme'); pg.wait_for_timeout(200)
        check('no script errors with X watch items and panel provenance', not errs, errs[:3])
        ctx.close()
        check_reading_size(br)
        # ---------- embed ----------
        print('Embed')
        ctx = br.new_context(viewport={'width': 680, 'height': 400}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + 'embed/?m=Pf', wait_until='networkidle'); pg.wait_for_timeout(600)
        check('embed chart renders', not errs and pg.inner_text('h1') == 'Frontier-tier price', errs)
        pg.screenshot(path=os.path.join(OUT, 'embed.png'))
        ctx.close()
        # ---------- mobile ----------
        print('Mobile')
        ctx = br.new_context(viewport={'width': 400, 'height': 860}, device_scale_factor=2, is_mobile=True, has_touch=True); pg = ctx.new_page()
        pg.goto(SITE, wait_until='networkidle'); pg.wait_for_timeout(1000)
        over = pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
        check('no sideways scrolling at 400 px', over <= 0, over)
        pg.wait_for_timeout(1200)  # let the first-visit card finish its entrance
        pg.screenshot(path=os.path.join(OUT, 'mobile_top.png'))
        pg.click('#lanesPanel > .ph .pc [data-act="info"]'); pg.wait_for_timeout(300)
        r = pg.eval_on_selector('#xpl', 'e => { const r = e.getBoundingClientRect(); return [r.width, r.bottom, innerHeight]; }')
        check('explainer is a bottom sheet on phones', r[0] >= 399 and abs(r[1] - r[2]) < 2, r)
        pg.screenshot(path=os.path.join(OUT, 'mobile_explainer.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.tap('#kpis .kpi >> nth=1'); pg.wait_for_timeout(300)
        r = pg.eval_on_selector('#prov', 'e => { const r = e.getBoundingClientRect(); return [r.width, r.bottom, innerHeight]; }')
        check('number provenance is a bottom sheet on phones', r[0] >= 399 and abs(r[1] - r[2]) < 2, r)
        pg.screenshot(path=os.path.join(OUT, 'mobile_provenance.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        over = pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
        check('still no sideways scrolling with the guidance layer', over <= 0, over)
        pg.click('#chatFab'); pg.wait_for_timeout(300)
        w = pg.eval_on_selector('#chat', 'e => e.getBoundingClientRect().width')
        check('chat uses the full phone width', w >= 399, w)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.set_viewport_size({'width': 390, 'height': 844})
        pg.goto(SITE + '#x-X15', wait_until='networkidle'); pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500)
        over = pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
        check('390 px: X watch items, badges and post links fit without sideways scrolling', over <= 0 and pg.evaluate('() => (document.querySelector(".xw.hit") || {}).id') == 'x-X15' and pg.eval_on_selector_all('#xwlist .xw', 'e => e.length') >= 6, over)
        pg.screenshot(path=os.path.join(OUT, 'mobile_xwatch.png'))
        ctx.close()
        # ---------- the admin's default theme reaches new visitors ----------
        admin('settings', {'settings': {'site': {'default_theme': 'light'}}})
        ctx = br.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
        pg.goto(SITE, wait_until='networkidle'); pg.wait_for_timeout(600)
        check('admin default theme (light) applies to a new visitor', pg.get_attribute('html', 'data-theme') == 'light' and pg.evaluate('() => (window.AIMONITOR_SITE || {}).defaultTheme') == 'light')
        pg.evaluate('() => localStorage.setItem("aimonitor.theme", JSON.stringify("dark"))'); pg.reload(wait_until='networkidle'); pg.wait_for_timeout(500)
        check("a visitor's own choice still wins", pg.get_attribute('html', 'data-theme') == 'dark')
        ctx.close()
        admin('settings', {'settings': {'site': {'default_theme': 'dark'}}})
        # ---------- admin: build and stage a release in the browser ----------
        print('Admin')
        ctx = br.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + 'admin/'); pg.fill('input[type=password]', PW); pg.click('button[type=submit]')
        pg.wait_for_selector('text=Overview', timeout=10000); pg.wait_for_timeout(500)
        check('admin overview', 'next release' in pg.inner_text('main').lower())
        pg.screenshot(path=os.path.join(OUT, 'admin_overview.png'))
        pg.click('button:has-text("Run the daily data check now")'); pg.wait_for_timeout(4000)
        pg.click('nav.tabs >> text=Review'); pg.wait_for_selector('.cand', timeout=10000)
        check('review queue shows candidates', pg.eval_on_selector_all('.cand', 'e => e.length') >= 3)
        pg.screenshot(path=os.path.join(OUT, 'admin_review.png'), full_page=True)
        pg.click('.cand >> nth=0 >> button:has-text("Approve")'); pg.wait_for_timeout(1200)
        pg.click('nav.tabs >> text=Release'); pg.wait_for_timeout(500)
        pg.click('button:has-text("Build the release")'); pg.wait_for_selector('text=computed in', timeout=20000)
        check('release built in the browser', 'files' in pg.inner_text('main'))
        pg.click('button:has-text("Stage for")'); pg.wait_for_timeout(2500)
        st = admin('state')
        check('release staged on the server', len(st['staged']) == 1, st.get('staged'))
        pg.screenshot(path=os.path.join(OUT, 'admin_release.png'), full_page=True)
        pg.click('nav.tabs >> text=Newsletter'); pg.click('button:has-text("Show preview")'); pg.wait_for_timeout(1500)
        check('newsletter preview', len(pg.eval_on_selector('iframe.preview', 'e => e.srcdoc')) > 2000)
        pg.screenshot(path=os.path.join(OUT, 'admin_newsletter.png'), full_page=True)
        pg.click('nav.tabs >> text=Settings'); pg.wait_for_timeout(400)
        check('settings show the imprint data of Creoox AG', 'FL-0002.524.394-4' in pg.input_value('[data-path="site.register"]') and 'Datenschutzstelle Liechtenstein' in pg.input_value('[data-path="site.authority"]'))
        pg.screenshot(path=os.path.join(OUT, 'admin_settings.png'), full_page=True)
        # ---------- AI agents: keys, models, weights, tasks ----------
        pg.click('nav.tabs >> text=AI agents'); pg.wait_for_timeout(500)
        main = pg.inner_text('main')
        check('AI agents: five agents with keys, weights and tasks', all(n in main for n in ['OpenAI', 'Anthropic', 'Google Gemini', 'xAI', 'DeepSeek']) and '••••test' in pg.inner_html('main') and pg.eval_on_selector_all('main input[type=range]', 'e => e.length') == 5 and 'X watch (Grok scans X)' in main, main[:300])
        check('DeepSeek is not offered for the visitor chat', pg.eval_on_selector('select[data-path="ai.roles.chat.provider"]', 'e => [...e.options].map(o => o.value).join()').find('deepseek') < 0)
        pg.fill('[data-path="ai.agents.gemini.weight"]', '4')
        sec = pg.locator('.card', has=pg.locator('[data-path="ai.agents.gemini.weight"]'))
        sec.locator('button:has-text("Save")').click(); pg.wait_for_timeout(1200)
        check('a weight is saved from the slider', admin('state')['settings']['ai']['agents']['gemini']['weight'] == 4)
        pg.screenshot(path=os.path.join(OUT, 'admin_agents.png'), full_page=True)
        # ---------- review card of the research panel: every answer, "Use this answer" ----------
        cli('$t = aim_research_target("AN4"); $ds = aim_working_dataset();'
            '$mk = fn($p, $v, $url, $basis = "source") => ["ok" => true, "found" => true, "value" => $v, "display" => "$" . $v . "T", "period" => "Oct 2026", "published" => "", "title" => "Example " . $p, "publisher" => "", "url" => $url, "quote" => "quote " . $v, "method" => "", "components" => [], "refs" => [], "basis" => $basis, "note" => $basis === "knowledge" ? "from training data" : "", "as_of" => "", "confidence" => "medium", "flags" => [], "searchSources" => [], "provider" => $p, "model" => "m-" . $p, "cost" => 0.01];'
            '$ans = ["openai" => $mk("openai", 5.42, "https://example.com/a") + ["w" => 3], "anthropic" => $mk("anthropic", 5.40, "https://example.com/b") + ["w" => 3], "deepseek" => $mk("deepseek", 5.30, "", "knowledge") + ["w" => 1], "gemini" => ["ok" => false, "error" => "timed out", "found" => false, "provider" => "gemini", "model" => "g", "cost" => 0, "w" => 2]];'
            '$r = aim_panel_merge($t, $ds, $ans, 4); echo aim_candidates_add($r["candidates"]);')
        pg.goto(SITE + 'admin/#review'); pg.reload(wait_until='networkidle'); pg.wait_for_selector('text=Answers of the AI agents', timeout=10000)
        card = pg.locator('.cand', has=pg.locator('text=Answers of the AI agents'))
        check('panel card lists every agent with its answer, source or error', card.locator('tbody tr').count() == 4 and 'timed out' in card.inner_text() and 'AI knowledge' in card.inner_text() and 'lead' in card.inner_text().lower())
        check('the weighted median picks the lead (Anthropic: 3 + 0.5 of 6.5 weight reached at 5.40)', card.locator('label:has-text("New value") input').input_value() == '5.4' and card.locator('tr', has=pg.locator('text=Anthropic')).locator('span.badge').inner_text().lower() == 'lead')
        card.locator('tr', has=pg.locator('text=OpenAI')).locator('button:has-text("Use this answer")').click(); pg.wait_for_timeout(200)
        check('"Use this answer" fills the form with that agent\'s answer', card.locator('label:has-text("New value") input').input_value() == '5.42' and card.locator('label:has-text("Source link") input').input_value() == 'https://example.com/a' and 'Using the answer of OpenAI' in card.inner_text())
        pg.screenshot(path=os.path.join(OUT, 'admin_review_panel.png'), full_page=True)
        card.locator('button:has-text("Approve")').click(); pg.wait_for_timeout(1200)
        an4 = admin('working')['working']['anchors']['AN4']
        check('approved with the chosen agent\'s source and the panel record', an4['url'] == 'https://example.com/a' and 'OpenAI' in an4['via']['model'] and 'chose the answer of OpenAI' in an4['via'].get('edited', '') and len(an4['via']['panel']['members']) == 3, json.dumps(an4)[:400])
        # ---------- X watch review ----------
        cli('aim_xwatch_add([["id" => "p1", "created" => aim_iso(), "date" => aim_now()->format("Y-m-d"), "title" => "Test post title", "summary" => "What was said.", "why" => "Why it matters.", "topics" => ["markets"], "anchors" => [], "metrics" => [], "direction" => "up", "posts" => [["url" => "https://x.com/Reuters/status/1850000000000000009", "handle" => "Reuters", "name" => "Reuters", "kind" => "media", "posted" => "2026-10-18"]], "refs" => [], "credibility" => "high", "credNote" => "", "impact" => "medium", "impactNote" => "", "flags" => ["a post link was not among the posts the search returned — open it before approving"], "via" => ["type" => "x", "name" => "Grok X search, reviewed by the editor", "model" => "xAI grok-4.3"], "ai" => ["provider" => "xai", "model" => "grok-4.3", "cost" => 0.3]]]);')
        pg.goto(SITE + 'admin/#xwatch'); pg.reload(wait_until='networkidle'); pg.wait_for_selector('text=Waiting for review (1)', timeout=10000)
        check('X watch tab: waiting item with post link, labels and flag', '@Reuters' in pg.inner_text('main') and 'credibility high' in pg.inner_text('main').lower() and 'not among the posts' in pg.inner_text('main'))
        pg.fill('main .cand input[type=text]', 'Reuters: a test headline')
        pg.click('button:has-text("Approve and publish")'); pg.wait_for_timeout(1500)
        xw = json.load(open(os.path.join(WEB, 'data', 'xwatch.json')))
        check('X watch approval publishes the edited item', xw['items'][0]['title'] == 'Reuters: a test headline' and xw['items'][0]['id'].startswith('X') and 'On the dashboard (1)' in pg.inner_text('main'), json.dumps(xw)[:300])
        pg.screenshot(path=os.path.join(OUT, 'admin_xwatch.png'), full_page=True)
        check('no admin script errors', not errs, errs[:3])
        ctx.close()
        # ---------- single-file preview (artifact) ----------
        print('Single-file preview')
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        ctx.add_init_script('''(() => {
          const fake = async (input, opts) => { window.__lastInput = input; const text = 'Big-4 capex is about $900B a year [AN1]; by Q4 2030 it follows the scenario path [M:K]. Several labs now sell agent subscriptions [AI]. A post on X hints at more [X12]. Unknown ids stay as text [AN99].';
            if (opts && opts.onText) opts.onText({ text, delta: text }); return { text, truncated: false }; };
          window.claude = { use: async name => (name === 'sample' ? fake : null) };
        })();''')
        pg.goto('file://' + os.path.join(ROOT, 'dist', 'artifact', 'ai-monitor.html')); pg.wait_for_timeout(1500)
        check('preview loads without errors', not errs, errs[:3])
        check('preview bar explains the live site', 'PREVIEW' in pg.inner_text('#relbar'))
        pg.click('#phasePanel .pc [data-act="focus"]'); pg.wait_for_timeout(300)
        check('layout tools work in the preview', pg.eval_on_selector('#phasePanel', 'e => e.classList.contains("is-focus")'))
        pg.screenshot(path=os.path.join(OUT, 'preview.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('#chatFab'); pg.fill('#chatIn', 'What is capex based on?'); pg.keyboard.press('Enter')
        pg.wait_for_selector('#chatLog .cites', timeout=10000)
        check('chat renders [AN1] and [M:K] as citation chips', pg.query_selector('#chatLog .m.a .cite[data-prov="an:AN1"]') is not None and pg.query_selector('#chatLog .m.a .cite[data-prov="meth:K"]') is not None and '[AN99]' in pg.inner_text('#chatLog .m.a'))
        check('“Sources used” lists the cited source with its link', 'sources used' in pg.inner_text('#chatLog .cites').lower() and pg.query_selector('#chatLog .cites a[href*="platformonomics.com"]') is not None)
        check('the assistant\'s own knowledge is marked “AI knowledge”, without a link', pg.query_selector('#chatLog .m.a .cite.ai') is not None and 'not from AI Forecast Atlas' in pg.inner_text('#chatLog .cites'))
        prompt = pg.evaluate('() => JSON.stringify(window.__lastInput || [])')
        check('artifact prompt carries the ledger, measures and the citation rule', 'Evidence ledger (JSON)' in prompt and 'Measures (JSON)' in prompt and '[M:<key>]' in prompt and 'never write URLs' in prompt and '[AI]' in prompt)
        check('the preview has no X watch list: empty state, no list in the prompt, [X12] links to the live list', 'This preview has no watch list' in pg.inner_text('#xwlist') and 'X watch — posts on X' not in prompt and pg.query_selector('#chatLog .m.a a.cite.x[href="https://aiforecastatlas.com/data/xwatch.json"]') is not None)
        pg.click('#chatLog .m.a .cite[data-prov="an:AN1"]'); pg.wait_for_timeout(250)
        check('citation chip opens the source', pg.is_visible('#prov') and 'AN1' in pg.inner_text('#prov'))
        pg.screenshot(path=os.path.join(OUT, 'chat_citations.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.click('#chatLog .m.a .cite[data-prov="meth:K"]'); pg.wait_for_timeout(250)
        check('method chip opens the formula', 'K_floor' in pg.inner_text('#prov'))
        check('preview has no script errors after the guidance checks', not errs, errs[:3])
        # a script link planted in the data is never rendered as a link
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.evaluate('() => { const a = window.AICX.ANCHORS.find(x => x.id === "AN1"); a.url = "java\\tscript:alert(1)"; a.refs = [{ title: "x", url: "\\u0001javascript:alert(2)" }]; }')
        pg.evaluate('() => { location.hash = "#src-AN1"; }'); pg.wait_for_timeout(500)
        bad = pg.evaluate('() => [...document.querySelectorAll("a")].filter(a => a.protocol === "javascript:").length')
        check('script links in the data never become links', bad == 0, bad)
        ctx.close()
        br.close()
finally:
    for pr in procs: pr.kill()
    shutil.rmtree(TMP, ignore_errors=True)
print('\n%d/%d checks passed' % (sum(1 for r in results if r[1]), len(results)))
sys.exit(1 if problems else 0)
