// Writes the article's diagrams as SVG. render.mjs turns them into PNGs for Medium.
// In any label, `backticks` mark code, set in a monospace font.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'svg');
mkdirSync(OUT, { recursive: true });

const C = {
    ink: '#1A1F29',
    muted: '#5B6474',
    line: '#C9D0DA',
    panel: '#F4F6F9',
    white: '#FFFFFF',
    lds: ['#0F766E', '#E2F2EF'],
    page: ['#2457C5', '#E7EEFB'],
    tabs: ['#9A5300', '#FBEEDC'],
    server: ['#6B3FB0', '#EFE8F8'],
    std: ['#B83256', '#FBE7EE'],
    stale: ['#B4342A', '#FBE6E3'],
    fresh: ['#1E7B34', '#E3F3E6'],
    plain: ['#1A1F29', '#FFFFFF']
};
const SANS = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
const MONO = `Menlo, 'SF Mono', Consolas, monospace`;
const MONO_SCALE = 0.92;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const segments = (s) => String(s).split('`').map((part, i) => ({ part, code: i % 2 === 1 })).filter((r) => r.part);
const width = (s, size) => segments(s).reduce((w, r) => w + r.part.length * size * (r.code ? 0.602 * MONO_SCALE : 0.55), 0);

function t(x, y, s, { size = 16, weight = 400, color = C.ink, anchor = 'start', caps = false } = {}) {
    // A zero-width non-joiner breaks fi/fl ligatures: resvg drops a whole line that has one next to a tspan.
    const inner = segments(s)
        .map((r) =>
            r.code
                ? `<tspan font-family="${MONO}" font-size="${size * MONO_SCALE}">${esc(r.part)}</tspan>`
                : esc((caps ? r.part.toUpperCase() : r.part).replace(/f(?=[fil])/g, 'f‌'))
        )
        .join('');
    const spacing = caps ? ' letter-spacing="1.3"' : '';
    return `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}"${spacing}>${inner}</text>`;
}

function rect(x, y, w, h, { rx = 10, fill = C.white, stroke = C.line, sw = 1.5, dash } = {}) {
    const d = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${d}/>`;
}

// Rows of text, vertically centred in a band of height h starting at y.
function lines(x, y, h, rows, anchor = 'start') {
    const heights = rows.map((r) => (r.size ?? 16) * 1.32);
    let top = y + (h - heights.reduce((a, b) => a + b, 0)) / 2;
    return rows
        .map((r, i) => {
            const size = r.size ?? 16;
            const out = t(x, top + size * 0.96, r.s, { ...r, size, anchor });
            top += heights[i];
            return out;
        })
        .join('');
}

function card(x, y, w, h, title, subs = [], { stroke = C.line, titleColor = C.ink, center = false } = {}) {
    const rows = [{ s: title, size: 18, weight: 600, color: titleColor }, ...subs.map((s) => ({ s, size: 15, color: C.muted }))];
    return rect(x, y, w, h, { stroke }) + lines(center ? x + w / 2 : x + 16, y, h, rows, center ? 'middle' : 'start');
}

function pill(x, y, w, h, name, sub, [fg, bg]) {
    const rows = [{ s: name, size: 16, weight: 600, color: fg }];
    if (sub) rows.push({ s: sub, size: 13.5, color: fg });
    return rect(x, y, w, h, { rx: h / 2, fill: bg, stroke: fg, sw: 1.6 }) + lines(x + w / 2, y, h, rows, 'middle');
}

function chip(x, y, s, [fg, bg], { size = 15, h = 30 } = {}) {
    const w = width(s, size) + 30;
    return { w, svg: rect(x, y, w, h, { rx: h / 2, fill: bg, stroke: fg, sw: 1.3 }) + t(x + w / 2, y + h / 2 + size * 0.36, s, { size, weight: 600, color: fg, anchor: 'middle' }) };
}

const markerId = (color) => `head${color.slice(1)}`;
function arrow(d, color, { width: sw = 2, dash } = {}) {
    const ds = dash ? ` stroke-dasharray="${dash}"` : '';
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}"${ds} marker-end="url(#${markerId(color)})"/>`;
}
const curve = (x1, y1, x2, y2) => {
    const dx = (x2 - x1) / 2;
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
};
const head = (color) =>
    `<marker id="${markerId(color)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
const line = (x1, y1, x2, y2, color = C.line, sw = 1) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}"/>`;
const colHead = (x, y, s, anchor = 'start') => t(x, y, s, { size: 13, weight: 700, color: C.muted, caps: true, anchor });
const note = (y, s) => t(20, y, s, { size: 15.5, color: C.muted });

const sizes = [];
function svg(name, w, h, body) {
    const colors = [...new Set([...body.matchAll(/url\(#head([0-9A-F]{6})\)/gi)].map((m) => `#${m[1]}`))];
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${colors.map(head).join('')}</defs><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>\n`;
    writeFileSync(join(OUT, `${name}.svg`), doc);
    sizes.push(`${name} ${w} ${h}`);
}

// 1. Hero: one save, without and with the mixin.
{
    const panel = (x, heading, color, outcomes) => {
        const rows = [
            ['Contacts to call', 'where you clicked', 'Jo Sample'],
            ['Account summary', 'same page', 'Contacts to call'],
            ['Call list', 'another workspace tab', 'Jo Sample']
        ];
        let out = rect(x, 66, 410, 384, { rx: 14, fill: C.panel, stroke: C.panel });
        out += `<circle cx="${x + 26}" cy="96" r="6" fill="${color}"/>` + t(x + 40, 103, heading, { size: 19, weight: 700, color });
        rows.forEach(([label, where, item], i) => {
            const y = 122 + i * 108;
            out += rect(x + 18, y, 374, 94);
            out += t(x + 36, y + 30, label, { size: 13, weight: 700, color: C.muted, caps: true });
            out += t(x + 374, y + 30, where, { size: 13.5, color: C.muted, anchor: 'end' });
            out += t(x + 36, y + 70, item, { size: 19 });
            const w = chip(0, 0, outcomes[i][0], outcomes[i][1]).w;
            out += chip(x + 374 - w, y + 49, outcomes[i][0], outcomes[i][1]).svg;
        });
        return out;
    };
    svg(
        '01-one-save',
        880,
        470,
        t(440, 40, 'You mark Jo Sample “Do not call”.', { size: 21, weight: 600, anchor: 'middle' }) +
            panel(20, 'Without', C.stale[0], [
                ['still listed', C.stale],
                ['2 · stale', C.stale],
                ['still listed', C.stale]
            ]) +
            panel(450, 'With the mixin', C.fresh[0], [
                ['gone', C.fresh],
                ['1', C.fresh],
                ['gone', C.fresh]
            ])
    );
}

// 2. Overview: where a refresh starts, how it travels, what re-reads.
{
    let b = colHead(24, 26, 'Where it starts') + colHead(300, 26, 'How it travels') + colHead(642, 26, 'What re-reads');
    b += rect(10, 42, 604, 318, { rx: 14, fill: 'none', stroke: C.line, dash: '6 5' }) + t(26, 66, 'In the browser · free', { size: 12, weight: 700, color: C.muted, caps: true });
    b += rect(10, 376, 604, 150, { rx: 14, fill: 'none', stroke: C.server[0], dash: '6 5' }) + t(26, 400, 'Server to browser · each delivery counts', { size: 12, weight: 700, color: C.server[0], caps: true });
    b += card(26, 166, 230, 92, 'A card saves', ['then calls `refreshView()`']);
    b += card(26, 416, 230, 92, 'A server-side change', ['Apex publishes', '`RecordRefresh__e`']);
    b += pill(300, 82, 296, 58, 'LDS record notice', 'records already cached', C.lds);
    b += pill(300, 172, 296, 58, '`RefreshEvent`', 'this record page', C.page);
    b += pill(300, 262, 296, 58, '`RecordRefresh__c`', 'Lightning message · every tab', C.tabs);
    b += pill(300, 434, 296, 58, '`RecordRefresh__e`', 'one filtered channel per domain', C.server);
    b += arrow(curve(256, 196, 296, 111), C.lds[0]) + arrow(curve(256, 212, 296, 201), C.page[0]) + arrow(curve(256, 228, 296, 291), C.tabs[0]);
    b += arrow(curve(256, 462, 296, 463), C.server[0]);
    b += card(642, 118, 228, 112, 'Custom cards', ['re-read through', 'the mixin']);
    b += card(642, 334, 228, 112, 'Standard components', ['re-read when the Aura', 'bridge fires a refresh']);
    b += arrow(curve(596, 111, 638, 146), C.lds[0]) + arrow(curve(596, 201, 638, 168), C.page[0]) + arrow(curve(596, 291, 638, 190), C.tabs[0]);
    b += arrow(curve(596, 297, 638, 368), C.tabs[0]) + arrow(curve(596, 457, 638, 210), C.server[0]) + arrow(curve(596, 469, 638, 414), C.server[0]);
    svg('02-signals', 880, 540, b);
}

// 3. Which signal when.
{
    const rows = [
        ['An LDS write', '`updateRecord`, a record form', null, ['Nothing: record wires update themselves.', 'Lists still need `refresh()`.']],
        ['An Apex write', '', ['LDS record notice', C.lds], 'then `refresh()`'],
        ['A change cards beside it show', '', ['`RefreshEvent`', C.page], ''],
        ['A change cards in other tabs show', '', ['`RecordRefresh__c`', C.tabs], ''],
        ['A change made on the server', '', ['`RecordRefresh__e`', C.server], ''],
        ['…that a standard component shows', '', ['Aura bridge', C.std], 'fires `force:refreshView`']
    ];
    const top = 52;
    const rowH = 66;
    let b = colHead(24, 34, 'After…') + colHead(440, 34, 'Send');
    rows.forEach(([what, detail, chipSpec, after], i) => {
        const y = top + i * rowH;
        b += line(16, y, 864, y);
        b += detail ? t(24, y + 29, what, { size: 18, weight: 600 }) + t(24, y + 52, detail, { size: 14.5, color: C.muted }) : t(24, y + 40, what, { size: 18, weight: 600 });
        if (Array.isArray(after)) {
            b += t(440, y + 29, after[0], { size: 16 }) + t(440, y + 52, after[1], { size: 16, color: C.muted });
            return;
        }
        const c = chip(440, y + 18, chipSpec[0], chipSpec[1]);
        b += c.svg;
        if (after) b += t(440 + c.w + 12, y + 39, after, { size: 16, color: C.muted });
    });
    const end = top + rows.length * rowH;
    b += line(16, end, 864, end);
    b += note(end + 34, '`refreshView()` sends the record notice, the `RefreshEvent` and the message.');
    svg('03-which-signal', 880, end + 52, b);
}

// 4. The mixin: listens, filters, re-reads, sends.
{
    let b = colHead(20, 26, 'It listens for') + colHead(322, 26, 'It re-reads') + colHead(656, 26, 'After its own save');
    b += pill(20, 44, 262, 58, '`RefreshEvent`', 'a save on this page', C.page);
    b += pill(20, 114, 262, 58, '`RecordRefresh__c`', 'a save in another tab', C.tabs);
    b += pill(20, 184, 262, 58, '`RecordRefresh__e`', 'a change on the server', C.server);
    b += pill(20, 254, 262, 58, '`refreshData()`', 'the component itself', C.plain);
    b += card(322, 52, 288, 118, 'Is it mine?', ['names a record it shows, or none', 'typed event: the hook only', 'its own message: ignored'], { stroke: C.ink });
    b += card(322, 206, 288, 118, 'Re-read', ['one at a time, one queued', 'LDS notice for `shownRecordIds`', 'then every refresher'], { stroke: C.ink });
    b += arrow(curve(282, 73, 318, 96), C.page[0]) + arrow(curve(282, 143, 318, 112), C.tabs[0]) + arrow(curve(282, 213, 318, 128), C.server[0]);
    b += arrow(curve(282, 283, 318, 283), C.ink);
    b += arrow('M466,170 L466,202', C.ink);
    b += t(656, 66, '`refreshView()`', { size: 18, weight: 600 });
    b += `<path d="M640,78 L640,267" fill="none" stroke="${C.ink}" stroke-width="2"/>` + line(632, 78, 640, 78, C.ink, 2);
    const outs = [
        ['LDS record notice', 'cached records refetch', C.lds],
        ['`RefreshEvent`', 'cards on this page', C.page],
        ['`RecordRefresh__c`', 'cards in other tabs', C.tabs]
    ];
    outs.forEach(([name, sub, color], i) => {
        const y = 98 + i * 70;
        b += pill(656, y, 214, 58, name, sub, color) + arrow(`M640,${y + 29} L652,${y + 29}`, C.ink);
    });
    svg('04-mixin', 880, 340, b);
}

// 5. Refreshes don't chain.
{
    let b = card(20, 112, 204, 84, 'Card A saves', ['calls `refreshView()` once']);
    b += pill(262, 120, 236, 68, '`RefreshEvent` · message', 'sent once, by the saving card', C.plain);
    b += card(540, 26, 240, 66, 'Card B re-reads', ['sends nothing on']);
    b += card(540, 121, 240, 66, 'Card C re-reads', ['sends nothing on']);
    b += card(540, 216, 240, 66, 'Page bridge re-reads', ['`force:refreshView`']);
    b += arrow(curve(224, 154, 258, 154), C.ink);
    b += arrow(curve(498, 146, 536, 59), C.ink) + arrow(curve(498, 154, 536, 154), C.ink) + arrow(curve(498, 162, 536, 249), C.ink);
    b += arrow('M780,59 C824,59 824,154 784,154', C.stale[0], { dash: '5 5' });
    b += t(832, 112, 'never', { size: 14, weight: 700, color: C.stale[0] });
    b += note(320, 'A re-read changes no data, so it has nothing to announce.');
    svg('05-no-chains', 880, 340, b);
}

// 6. Across console workspace tabs.
{
    let b = rect(20, 30, 400, 266, { rx: 14, fill: C.panel, stroke: C.line, dash: '6 5' }) + colHead(38, 58, 'Tab A · account · selected');
    b += rect(460, 30, 400, 266, { rx: 14, fill: C.panel, stroke: C.line, dash: '6 5' }) + colHead(478, 58, 'Tab B · contact');
    b += card(44, 76, 356, 70, 'Contacts to call', ['saves, then calls `refreshView()`']);
    b += card(44, 196, 356, 70, 'Account summary', ['re-reads: `RefreshEvent`']);
    b += arrow('M222,146 L222,192', C.page[0], { width: 2.4 });
    b += t(234, 168, '`RefreshEvent`', { size: 14, weight: 600, color: C.page[0] });
    b += t(234, 186, 'stops at this tab’s page', { size: 13, color: C.page[0] });
    b += card(484, 76, 352, 70, 'Contact card', ['re-reads: it shows Jo Sample']);
    b += card(484, 196, 352, 70, 'Cases card', ['ignores: other records'], { titleColor: C.muted });
    b += rect(20, 326, 840, 50, { rx: 25, fill: C.tabs[1], stroke: C.tabs[0], sw: 1.6 });
    b += t(440, 357, '`RecordRefresh__c` · Lightning message · application scope', { size: 16, weight: 600, color: C.tabs[0], anchor: 'middle' });
    b += arrow('M44,111 C30,111 31,130 31,150 L31,322', C.tabs[0]);
    b += arrow('M849,326 L849,135 C849,116 849,111 840,111', C.tabs[0]);
    b += note(412, 'In the browser only: no server round trip, no event deliveries.');
    svg('06-across-tabs', 880, 430, b);
}

// 7. One event, a filtered channel per domain.
{
    let b = colHead(20, 26, 'Publishers set `Domain__c`') + colHead(256, 26, 'One event') + colHead(470, 26, 'Filtered channels') + colHead(726, 26, 'Listeners');
    const rows = [
        ['Opportunity trigger', "`Domain__c = 'SALES'`", '`SalesRefresh__chn`', "`Domain__c = 'SALES'`", 'Sales pages'],
        ['Case batch job', "`Domain__c = 'SERVICE'`", '`ServiceRefresh__chn`', "`Domain__c = 'SERVICE'`", 'Service pages'],
        ['Anything else', 'no domain', '`DefaultRefresh__chn`', '`Domain__c = null`', 'Other pages']
    ];
    rows.forEach(([who, sets, channel, filter, listener], i) => {
        const y = 44 + i * 84;
        b += card(20, y, 214, 66, who, [sets]);
        b += pill(470, y, 226, 66, channel, filter, C.server);
        b += card(726, y, 144, 66, listener, [], { center: true });
        b += arrow(curve(234, y + 33, 252, 160), C.server[0]);
        b += arrow(curve(436, 160, 466, y + 33), C.server[0]);
        b += arrow(curve(696, y + 33, 722, y + 33), C.server[0]);
    });
    b += pill(256, 126, 180, 68, '`RecordRefresh__e`', '+ `Domain__c`', C.server);
    b += note(322, 'Filtered on the server: a session receives only its channel’s events, and only those count.');
    svg('07-channels', 880, 340, b);
}

// 8. The bridge merges a burst into one force:refreshView.
{
    const x0 = 90;
    const axis = 120;
    const px = 1.15; // pixels per millisecond
    const at = (ms) => x0 + ms * px;
    const events = [
        [0, '`RecordRefresh__e`', C.server, 'above'],
        [90, '`RecordRefresh__c`', C.tabs, 'below'],
        [190, '`RecordRefresh__e`', C.server, 'above']
    ];
    let b = t(20, axis + 5, 'Bridge', { size: 15, weight: 700, color: C.muted });
    b += line(x0, axis, 860, axis, C.line, 2);
    events.forEach(([ms, name, [fg], where]) => {
        const x = at(ms);
        const [y1, y2, labelY] = where === 'above' ? [78, axis, 70] : [axis, 158, 176];
        b += line(x, y1, x, y2, fg, 1.5) + `<circle cx="${x}" cy="${axis}" r="7" fill="${fg}"/>` + t(x - 6, labelY, name, { size: 14, weight: 600, color: fg });
    });
    const last = at(190);
    const fire = at(490);
    b += `<rect x="${fire - 9}" y="${axis - 9}" width="18" height="18" transform="rotate(45 ${fire} ${axis})" fill="${C.std[0]}"/>`;
    b += t(fire - 6, 70, '`force:refreshView`, once', { size: 15, weight: 700, color: C.std[0] });
    b += line(fire, 78, fire, axis - 12, C.std[0], 1.5);
    b += `<path d="M${last},196 L${last},206 L${fire},206 L${fire},196" fill="none" stroke="${C.muted}" stroke-width="1.5"/>`;
    b += t((last + fire) / 2, 230, '300 ms after the last event', { size: 14.5, color: C.muted, anchor: 'middle' });
    b += t(x0 - 6, 230, 'each event restarts the timer', { size: 14.5, color: C.muted });
    svg('08-bridge-burst', 880, 250, b);
}

writeFileSync(join(OUT, 'sizes.txt'), sizes.join('\n') + '\n');
