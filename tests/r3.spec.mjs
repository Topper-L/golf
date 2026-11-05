import { test, expect } from '@playwright/test';
import fs from 'fs';
import zlib from 'zlib';

const shotDir = '/workspace/2026-10-29-build';
const artDir = '/opt/cursor/artifacts';
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artDir, { recursive: true });

async function shot(page, name, opts) {
  const file = name + '.png';
  const fullPage = !!(opts && opts.fullPage);
  await page.screenshot({ path: shotDir + '/' + file, fullPage });
  await page.screenshot({ path: artDir + '/' + file, fullPage });
}

async function stitchShots(name, buffers) {
  const pngs = buffers.map(decodePng);
  const gap = 16;
  const width = Math.max(...pngs.map(p => p.width));
  const height = pngs.reduce((n, p) => n + p.height, 0) + gap * (pngs.length - 1);
  const canvas = Buffer.alloc(width * height * 4, 0);
  canvas.fill(231); // #e7efe6 page background, filled per channel below
  for (let i = 0; i < canvas.length; i += 4) {
    canvas[i] = 231; canvas[i + 1] = 239; canvas[i + 2] = 230; canvas[i + 3] = 255;
  }
  let y = 0;
  pngs.forEach(p => {
    const x0 = Math.floor((width - p.width) / 2);
    for (let row = 0; row < p.height; row++) {
      const src = p.rgba.subarray(row * p.width * 4, (row + 1) * p.width * 4);
      src.copy(canvas, ((y + row) * width + x0) * 4);
    }
    y += p.height + gap;
  });
  const file = encodePng(width, height, canvas);
  fs.writeFileSync(shotDir + '/' + name + '.png', file);
  fs.writeFileSync(artDir + '/' + name + '.png', file);
}

function decodePng(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error('not a png');
  let width = 0, height = 0, bitDepth = 8, colorType = 6;
  const idat = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error('unsupported png');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + left) & 255;
      else if (filter === 2) row[i] = (row[i] + up) & 255;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, ul)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp;
      const d = (y * width + x) * 4;
      rgba[d] = row[s];
      rgba[d + 1] = row[s + 1];
      rgba[d + 2] = row[s + 2];
      rgba[d + 3] = bpp === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }
  return { width, height, rgba };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))];
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]);
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])) >>> 0, 0);
  crc.copy(out, 8 + data.length);
  return out;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

function parOf() {
  return [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
}

async function blankRound(page) {
  await page.evaluate(() => {
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    amounts = {};
    holePlayers = [];
    holeScores = [];
    holeMarks = [];
    roundStop = null;
    quitChoice = '';
    holeNo = 0;
    startAt = 0;
    playedThru = -1;
    ninesPlayed = null;
    playoffs = {};
    applyJunkTypes(null);
    quickScores = false;
    roundId = '';
    try { localStorage.removeItem('golf-card'); localStorage.removeItem('round-setup'); localStorage.removeItem('golf-rounds'); } catch (e) {}
    draw();
  });
}

async function twoPlayer(page, opts) {
  const o = opts || {};
  await page.evaluate((o) => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    const tl = { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: o.tlHcp || '0', box: false };
    const ns = { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: o.nsHcp || '0', box: false };
    players = [tl, ns];
    holePlayers = [
      { id: 'TL', name: tl.name, tee: 'Blue', hcp: tl.hcp, box: false },
      { id: 'NS', name: ns.name, tee: 'Blue', hcp: ns.hcp, box: false }
    ];
    const fill = (fn) => pars.map((p, h) => fn(p, h));
    holeScores = [
      fill((p, h) => (o.tl && o.tl[h] != null ? o.tl[h] : p)),
      fill((p, h) => (o.ns && o.ns[h] != null ? o.ns[h] : p))
    ];
    (o.tlBlank || []).forEach(h => { holeScores[0][h] = null; });
    (o.nsBlank || []).forEach(h => { holeScores[1][h] = null; });
    if (o.nsAllBlankNine === 0 || o.nsAllBlankNine === 1) {
      const holes = o.nsAllBlankNine === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [9, 10, 11, 12, 13, 14, 15, 16, 17];
      holes.forEach(h => { holeScores[1][h] = null; });
    }
    if (o.tlAllBlankNine === 0 || o.tlAllBlankNine === 1) {
      const holes = o.tlAllBlankNine === 0 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [9, 10, 11, 12, 13, 14, 15, 16, 17];
      holes.forEach(h => { holeScores[0][h] = null; });
    }
    holeMarks = holePlayers.map(() => freshMarks());
    if (o.mark) {
      o.mark.forEach(m => {
        const i = holePlayers.findIndex(p => p.id === m.id);
        if (i < 0) return;
        holeMarks[i][m.h] = Object.assign(blankMark(), m.fields || {});
      });
    }
    const bet = {
      on: true, first: o.first == null ? 10 : o.first, second: o.second == null ? 10 : o.second,
      overall: o.overall == null ? 10 : o.overall, press: o.press == null ? 0 : o.press,
      pressFront: o.press == null ? 0 : o.press, pressBack: o.press == null ? 0 : o.press,
      pressDown: o.pressDown == null ? 2 : o.pressDown, autoPress: o.autoPress !== false,
      maxPresses: null, player: { TL: o.junk == null ? 5 : o.junk, NS: o.junk == null ? 5 : o.junk },
      offers: [], mp18: false, mp: 0
    };
    amounts = { 'TL vs NS': bet };
    applyJunkTypes(o.junkTypes || null);
    quickScores = false;
    roundStop = null;
    quitChoice = '';
    holeNo = o.hole == null ? 0 : o.hole;
    startAt = 0;
    playedThru = 17;
    ninesPlayed = null;
    playoffs = {};
    roundId = 't-' + Math.random().toString(36).slice(2);
    syncPlayedNines();
    draw();
    showScreen(o.screen || 'score');
    drawHole();
  }, o);
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  page._pageErrors = errors;
  await page.goto('/');
  await page.waitForSelector('#newRound');
});

test.afterEach(async ({ page }) => {
  expect(page._pageErrors, page._pageErrors.join('\n')).toEqual([]);
});

test('setup junk defaults, plus handicap, and score dots stay aligned', async ({ page }) => {
  await page.getByRole('button', { name: 'New Round' }).click();
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(page.locator('#junkSetup')).toBeVisible();
  await expect(page.locator('button[data-junk-toggle="birdie"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-junk-toggle="eagle"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[data-junk-amt="birdie"]')).toHaveValue('3');
  await expect(page.locator('input[data-junk-amt="eagle"]')).toHaveValue('6');
  await expect(page.locator('button[data-junk-step="1"][data-junk-amt="eagle"]')).toBeVisible();
  await expect(page.locator('button[data-junk-toggle="sandy"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-junk-toggle="greenie"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('button[data-junk-toggle="chip"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('button[data-junk-toggle="poley"]')).toContainText('Off');
  await expect(page.locator('#junkSetup')).toContainText('Putt > flagstick');
  await expect(page.locator('#junkSetup')).not.toContainText('Polie');
  await expect(page.locator('#junkSetup')).not.toContainText('Barkie');
  await expect(page.locator('#quickScores')).not.toBeChecked();
  await expect(page.locator('button[data-plus]')).toHaveCount(0);
  const hcp = page.locator('.hcpval').first();
  await expect(hcp).toHaveText('—');
  await page.locator('button[data-hcp-step="-1"]').first().click();
  await expect(hcp).toHaveText('+1');
  await page.locator('button[data-hcp-step="-1"]').first().click();
  await expect(hcp).toHaveText('+2');
  await page.locator('button[data-hcp-step="1"]').first().click();
  await expect(hcp).toHaveText('+1');
  const scroll = await page.locator('#players').evaluate(el => {
    const scroller = el.parentElement;
    return { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth };
  });
  await page.evaluate(m => { window.__setupScroll = m; }, scroll);
  await page.locator('#junkSetup').scrollIntoViewIfNeeded();
  await shot(page, 'setup-junk-plus');
  await page.locator('button[data-junk-step="1"][data-junk-amt="birdie"]').click();
  await expect(page.locator('input[data-junk-amt="birdie"]')).toHaveValue('4');
  await expect(page.locator('input[data-junk-amt="eagle"]')).toHaveValue('8');
  expect(await page.evaluate(() => junkTypes.eagle.amt)).toBeNull();
  await page.locator('button[data-junk-step="1"][data-junk-amt="eagle"]').click();
  await expect(page.locator('input[data-junk-amt="eagle"]')).toHaveValue('9');
  expect(await page.evaluate(() => junkTypes.eagle.amt)).toBe(9);
  await twoPlayer(page, { tlHcp: '+2', nsHcp: '14', hole: 7, tl: { 7: 5 }, ns: { 7: 5 }, screen: 'score' });
  await expect(page.locator('#holeTitle')).toContainText('SI 11');
  await expect(page.locator('.sname .meta').first()).toHaveText('HCP +2 · Blue');
  await expect(page.locator('.sname .meta').nth(1)).toHaveText('HCP 14 · Blue');
  const dots = await page.locator('.teedot').evaluateAll(els => els.map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width })));
  expect(dots[0].text).toBe('');
  expect(dots[1].text).toContain('•');
  expect(dots[0].width).toBe(dots[1].width);
  const align = await page.locator('.srow').evaluateAll(rows => rows.slice(0, 2).map(row => {
    const score = row.querySelector('.score').getBoundingClientRect();
    const dot = row.querySelector('.teedot').getBoundingClientRect();
    return Math.abs((score.top + score.bottom) / 2 - (dot.top + dot.bottom) / 2);
  }));
  expect(align[0]).toBeLessThan(2);
  expect(align[1]).toBeLessThan(2);
  console.log('setup player scroller', scroll);
  await expect(page.locator('.grid.on')).toHaveCount(0);
  await expect(page.locator('.srels')).toHaveCount(0);
  await page.locator('.sname').first().evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo(0, Math.max(0, y));
  });
  for (const dir of [shotDir, artDir]) {
    await page.screenshot({ path: dir + '/score-dots.png', clip: { x: 0, y: 56, width: 390, height: 280 } });
  }
});

test('junk sheet multi-select, 5-some box, and settle sums to zero', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    const raw = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '5', box: true },
      { name: 'Ned Green', initials: 'NG', tee: 'Blue', hcp: '8', box: true },
      { name: 'Larry Brown', initials: 'LB', tee: 'Blue', hcp: '10', box: false },
      { name: 'Amy Chen', initials: 'AC', tee: 'Blue', hcp: '12', box: false },
      { name: 'Dana Kim', initials: 'DK', tee: 'Blue', hcp: '14', box: false }
    ];
    players = raw;
    holePlayers = raw.map(p => ({ id: p.initials, name: p.name, tee: p.tee, hcp: p.hcp, box: p.box }));
    holeScores = holePlayers.map(() => pars.slice());
    holeScores[0][0] = 3;
    holeMarks = holePlayers.map(() => freshMarks());
    draw();
    const names = matchNames();
    amounts = {};
    names.team.forEach(name => {
      const player = {};
      holePlayers.forEach(p => { player[p.id] = 3; });
      amounts[name] = { on: true, first: 10, second: 10, overall: 20, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: true, player: player, offers: [], mp18: false, mp: 0 };
    });
    names.side.forEach(name => {
      amounts[name] = { on: false, first: 0, second: 0, overall: 0, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: false, player: {}, offers: [] };
    });
    junkTypes.chip.on = true;
    roundStop = null;
    holeNo = 2;
    startAt = 0;
    playedThru = 17;
    ninesPlayed = null;
    roundId = 'five';
    syncPlayedNines();
    showScreen('score');
    drawHole();
  });
  await expect(page.locator('.banner')).toHaveCount(3);
  await expect(page.locator('.b-primary').first()).toContainText(/thru/i);
  const primarySize = await page.locator('.b-primary').first().evaluate(el => getComputedStyle(el).fontSize);
  await page.locator('#fontUp').click();
  const bigger = await page.locator('.b-primary').first().evaluate(el => getComputedStyle(el).fontSize);
  expect(parseFloat(bigger)).toBeGreaterThan(parseFloat(primarySize));
  await page.locator('#fontDown').click();
  await page.locator('.junkbtn').first().click();
  await expect(page.locator('#junkSheet')).toBeVisible();
  await expect(page.locator('#junkSheetTitle')).toContainText('TL');
  await expect(page.locator('#junkSheet')).toContainText('Birdie/Eagle auto from gross score');
  const chip = page.locator('button[data-count-type="chip"][data-count-step="1"]');
  const sandyUp = page.locator('button[data-count-type="sandy"][data-count-step="1"]');
  await expect(chip).toBeEnabled();
  await sandyUp.click();
  await chip.click();
  await expect(page.locator('button[data-sheet-type="greenie"]')).toBeVisible();
  await shot(page, 'junk-sheet');
  await page.locator('#junkSheetDone').click();
  await expect(page.locator('#junkSheet')).toBeHidden();
  await expect(page.locator('.jbadge').first()).toHaveText('2');
  await expect(page.locator('.schips').first()).toContainText('Sandy');
  await expect(page.locator('.schips').first()).toContainText('Chip-in');
  const holeBefore = await page.locator('#holeTitle').innerText();
  await page.locator('.sline .step').first().click();
  await expect(page.locator('#holeTitle')).toHaveText(holeBefore);
  await page.locator('#tabbar button[data-screen="junk"]').click();
  await expect(page.locator('#junkSummary')).toContainText('$0');
  await expect(page.locator('#junkSummary')).not.toContainText('No junk yet');
  await page.locator('#tabbar button[data-screen="settle"]').click();
  await expect(page.locator('button[data-settle-view="both"]')).toHaveClass(/on/);
  await expect(page.locator('.settle-pot')).toContainText('puts in');
  await expect(page.locator('.settle-pot')).toContainText('takes');
  await expect(page.locator('.settle-why')).toBeVisible();
  await expect(page.locator('.whyline').first()).toContainText('pay');
  const balance = await page.locator('.potbal').getAttribute('data-pot-in');
  const out = await page.locator('.potbal').getAttribute('data-pot-out');
  expect(balance).toBe(out);
  const nets = await page.locator('[data-net]').evaluateAll(els => els.map(el => Number(el.getAttribute('data-net'))));
  const sum = Math.round(nets.reduce((n, v) => n + v, 0) * 100) / 100;
  expect(Math.abs(sum)).toBeLessThan(0.02);
  const lines = await page.locator('.whyline').allInnerTexts();
  lines.forEach(line => {
    const parts = line.split(' pay ');
    expect(parts.length).toBe(2);
    const left = parts[0].replace(/^\d+\s·\s/, '').split('+');
    const right = parts[1].split(' ')[0].split('+');
    left.forEach(id => expect(right).not.toContain(id));
    const box = ['TL', 'NG'];
    const leftBox = left.filter(id => box.indexOf(id) >= 0).length;
    const rightBox = right.filter(id => box.indexOf(id) >= 0).length;
    expect(leftBox === 0 || rightBox === 0).toBeTruthy();
  });
  await expect(page.locator('.settleup')).toHaveCount(0);
  await shot(page, 'settle-both');
  await page.locator('button[data-player-fold="TL"]').click();
  await expect(page.locator('#fold-TL')).toBeVisible();
  await expect(page.locator('#fold-TL')).toContainText('Junk');
});

test('press rows use P1 and P2', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: false }));
    holeScores = [pars.slice(), pars.slice()];
    for (let h = 0; h < 4; h++) holeScores[0][h] = pars[h] + 1;
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = {
      'TL vs NS': { on: true, first: 10, second: 10, overall: 10, press: 5, pressFront: 5, pressBack: 5, pressDown: 2, autoPress: true, player: { TL: 0, NS: 0 }, offers: [], mp18: false, mp: 0 }
    };
    applyJunkTypes(null);
    roundStop = null;
    holeNo = 3;
    startAt = 0;
    playedThru = 3;
    ninesPlayed = null;
    roundId = 'press';
    syncPlayedNines();
    showScreen('standing');
    drawHole();
  });
  const headers = await page.locator('#cardStanding .pressgrid th').allInnerTexts();
  expect(headers).toContain('Match');
  expect(headers).toContain('1st');
  expect(headers).toContain('2nd');
  expect(headers).toContain('P1');
  expect(headers).toContain('P2');
  expect(headers.some(t => /^P\d{2}$/.test(t.trim()) || /^P[3-9]$/.test(t.trim()))).toBeFalsy();
  await expect(page.locator('#cardStanding .pstart').nth(0)).toHaveText('P1');
  await expect(page.locator('#cardStanding .pstart').nth(1)).toHaveText('P2');
  await shot(page, 'press-rows');
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await expect(page.locator('.banner.dn, .banner.up, .banner.as').first()).toBeVisible();
  await expect(page.locator('.b-primary').first()).toContainText(/↑|↓|AS/);
  await expect(page.locator('#presses')).toHaveCount(0);
  await page.locator('.banner').first().click();
  await expect(page.locator('.b-full').first()).toContainText('P1 from');
  await shot(page, 'banner-press');
});

test('banner colors for up, down, and all square', async ({ page }) => {
  await twoPlayer(page, { tl: { 0: 3 }, ns: { 0: 5 }, junk: 0, first: 10, second: 0, overall: 0 });
  await expect(page.locator('.banner')).toHaveClass(/up/);
  await expect(page.locator('.b-primary')).toContainText('1↑');
  await expect(page.locator('.b-primary')).toContainText(/thru/i);
  await shot(page, 'banner-up');
  await twoPlayer(page, { tl: { 0: 6 }, ns: { 0: 4 }, junk: 0, first: 10, second: 0, overall: 0 });
  await expect(page.locator('.banner')).toHaveClass(/dn/);
  await expect(page.locator('.b-primary')).toContainText('1↓');
  await shot(page, 'banner-dn');
  await twoPlayer(page, { junk: 0, first: 10, second: 0, overall: 0 });
  await expect(page.locator('.banner')).toHaveClass(/as/);
  await expect(page.locator('.b-primary')).toContainText('AS');
  await shot(page, 'banner-as');
});

test('did not play a whole nine voids that nine and overall', async ({ page }) => {
  await twoPlayer(page, {
    junk: 0,
    first: 10,
    second: 10,
    overall: 10,
    tlAllBlankNine: 0,
    tl: {},
    ns: {}
  });
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    for (let h = 0; h < 9; h++) holeScores[0][h] = null;
    for (let h = 0; h < 18; h++) holeScores[1][h] = pars[h];
    for (let h = 9; h < 18; h++) holeScores[0][h] = pars[h] + 1;
    drawHole();
  });
  const state = await page.evaluate(() => {
    const ids = ['TL', 'NS'];
    return {
      front: segmentVoid(ids, 0),
      back: segmentVoid(ids, 1),
      roll: lastSettle.roll,
      warn: missedEntryWarnings()
    };
  });
  expect(state.front).toBeTruthy();
  expect(state.back).toBeFalsy();
  expect(state.warn).toEqual([]);
  expect(state.roll.TL).toBe(-10);
  expect(state.roll.NS).toBe(10);
  expect(Math.abs(state.roll.TL + state.roll.NS)).toBeLessThan(0.001);
  await page.getByRole('button', { name: 'Settle', exact: true }).click();
  await expect(page.locator('.settle-why')).toContainText('pay');
  await expect(page.locator('#settle .miss-warn')).toHaveCount(0);
  await shot(page, 'na-void-nine');
});

test('a missed hole warns and does not void', async ({ page }) => {
  await twoPlayer(page, { junk: 0, first: 10, second: 10, overall: 10, tl: { 0: 3 } });
  await page.evaluate(() => {
    holeScores[1][5] = null;
    holeNo = 5;
    drawHole();
  });
  const state = await page.evaluate(() => ({
    front: segmentVoid(['TL', 'NS'], 0),
    warn: missedEntryWarnings(),
    roll: lastSettle.roll
  }));
  expect(state.front).toBeFalsy();
  expect(state.warn.join(' ')).toContain('NS missing hole 6');
  expect(state.roll.TL).toBe(20);
  expect(state.roll.NS).toBe(-20);
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('#cardWarn')).toContainText('NS missing hole 6');
  await shot(page, 'missed-hole-card');
  await page.getByRole('button', { name: 'Settle', exact: true }).click();
  await expect(page.locator('#settle .miss-warn')).toContainText('NS missing hole 6');
  await shot(page, 'missed-hole-settle');
});

test('undo and clear hole return a score to blank', async ({ page }) => {
  await twoPlayer(page, { junk: 0, tlBlank: [0], nsBlank: [0], hole: 0, first: 0, second: 0, overall: 0 });
  await page.locator('.sline .score').first().click();
  await expect(page.locator('.sline .score').first()).toHaveText('4');
  await expect(page.locator('#holeTitle')).toContainText('Hole 1');
  await page.locator('#undoScore').click();
  await expect(page.locator('.sline .score').first()).toHaveText('');
  await page.locator('.sline .score').first().click();
  await page.locator('#clearHole').click();
  await expect(page.locator('.sline .score').first()).toHaveText('');
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    for (let h = 0; h < 18; h++) {
      holeScores[0][h] = pars[h];
      holeScores[1][h] = pars[h];
    }
    for (let h = 9; h < 18; h++) holeScores[1][h] = null;
    amounts['TL vs NS'].first = 10;
    amounts['TL vs NS'].second = 10;
    amounts['TL vs NS'].overall = 10;
    for (let h = 0; h < 9; h++) holeScores[0][h] = pars[h] - (h === 0 ? 1 : 0);
    drawHole();
  });
  let roll = await page.evaluate(() => lastSettle.roll.TL);
  expect(roll).toBe(10);
  await page.evaluate(() => {
    for (let h = 9; h < 18; h++) holeScores[0][h] = null;
    drawHole();
  });
  const after = await page.evaluate(() => ({ tl: lastSettle.roll.TL, ns: lastSettle.roll.NS, front: segmentVoid(['TL', 'NS'], 0), back: segmentVoid(['TL', 'NS'], 1) }));
  expect(after.front).toBeFalsy();
  expect(after.back).toBeFalsy();
  expect(after.tl).toBe(10);
  expect(after.ns).toBe(-10);
});

test('quit round save and discard', async ({ page }) => {
  await twoPlayer(page, { junk: 0, tl: { 0: 3 }, first: 10, second: 10, overall: 10 });
  await page.locator('#quitRound').click();
  await expect(page.locator('#quitPanel')).toContainText('Save & quit');
  await expect(page.locator('#quitPanel')).toContainText('Discard');
  await shot(page, 'quit-choices');
  await page.locator('button[data-quit="asis"]').click();
  await page.locator('button[data-quit="apply"]').click();
  await expect(page.locator('#scoreStop')).toContainText('as they stand');
  await page.getByRole('button', { name: 'Settle', exact: true }).click();
  let nets = await page.locator('[data-net]').evaluateAll(els => els.map(el => Number(el.getAttribute('data-net'))));
  expect(nets.some(n => n !== 0)).toBeTruthy();
  expect(Math.abs(nets.reduce((a, b) => a + b, 0))).toBeLessThan(0.02);
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await page.locator('#resumeRound').click();
  await expect(page.locator('#quitRound')).toBeVisible();
  await page.locator('#quitRound').click();
  await page.locator('button[data-quit="cancel"]').click();
  await page.locator('button[data-quit="apply"]').click();
  await page.getByRole('button', { name: 'Settle', exact: true }).click();
  nets = await page.locator('[data-net]').evaluateAll(els => els.map(el => Number(el.getAttribute('data-net'))));
  expect(nets.length === 0 || nets.every(n => n === 0)).toBeTruthy();
  await expect(page.locator('#settle')).toContainText('cancelled');
});

test('payout regression stays zero-sum and matches the old unit math', async ({ page }) => {
  await twoPlayer(page, {
    junk: 5,
    first: 10,
    second: 10,
    overall: 10,
    tl: { 0: 3 },
    ns: { 0: 4 }
  });
  let roll = await page.evaluate(() => lastSettle.roll);
  expect(roll.TL).toBe(25);
  expect(roll.NS).toBe(-25);
  await page.evaluate(() => {
    holeScores[0][0] = 2;
    drawHole();
  });
  roll = await page.evaluate(() => lastSettle.roll);
  expect(await page.evaluate(() => junkTypes.eagle.amt)).toBeNull();
  expect(roll.TL).toBe(30);
  expect(roll.NS).toBe(-30);
  await page.evaluate(() => {
    holeScores[0][0] = 4;
    holeMarks[0][1] = { KP: 0, Birdie: 0, Junk: 2 };
    drawHole();
  });
  const migrated = await page.evaluate(() => ({ other: holeMarks[0][1].other, on: junkTypes.other.on, roll: lastSettle.roll }));
  expect(migrated.other).toBe(2);
  expect(migrated.on).toBeTruthy();
  expect(migrated.roll.TL).toBe(10);
  expect(migrated.roll.NS).toBe(-10);
  const odd = await page.evaluate(() => paySentence(['LB', 'AC'], ['TL', 'NG'], -0.5));
  expect(odd).toContain('total');
  expect(odd).not.toContain('each');
  const even = await page.evaluate(() => paySentence(['LB', 'AC'], ['TL', 'NG'], -10));
  expect(even).toContain('each');
  const one = await page.evaluate(() => paySentence(['TL'], ['NS'], -20));
  expect(one).toBe('NS pay TL $20');
});

test('legacy saved round maps generic junk to Other', async ({ page }) => {
  await page.evaluate(() => {
    const pars = courses['Wood Ranch'].par.slice();
    const marks = [0, 1].map(() => Array.from({ length: 18 }, () => ({ KP: 0, Birdie: 0, Junk: 0 })));
    marks[0][0].Junk = 2;
    const round = {
      id: 'legacy-1',
      auto: false,
      course: 'Wood Ranch',
      when: '2024-06-01T12:00:00',
      name: 'Legacy junk',
      players: [
        { id: 'TL', name: 'Topper Larsen', tee: 'Blue', hcp: '0', box: false },
        { id: 'NS', name: 'Ned S', tee: 'Blue', hcp: '0', box: false }
      ],
      scores: [pars.slice(), pars.slice()],
      marks: marks,
      amounts: {
        'TL vs NS': { on: true, first: 0, second: 0, overall: 0, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: true, player: { TL: 5, NS: 5 }, offers: [] }
      },
      hole: 0,
      startAt: 0,
      playedThru: 17
    };
    localStorage.setItem('golf-rounds', JSON.stringify([round]));
    localStorage.removeItem('golf-card');
    localStorage.removeItem('round-setup');
  });
  await page.reload();
  await page.waitForSelector('button.round-open');
  await page.locator('button.round-open').click();
  await expect(page.locator('#holeTitle')).toBeVisible();
  const loaded = await page.evaluate(() => ({
    other: holeMarks[0][0].other,
    junk: holeMarks[0][0].Junk,
    on: junkTypes.other.on,
    roll: lastSettle.roll
  }));
  expect(loaded.other).toBe(2);
  expect(loaded.junk == null).toBeTruthy();
  expect(loaded.on).toBeTruthy();
  expect(loaded.roll.TL).toBe(10);
  expect(loaded.roll.NS).toBe(-10);
  await page.locator('#tabbar button[data-screen="junk"]').click();
  await expect(page.locator('#junkSummary')).toContainText('Other');
  await shot(page, 'legacy-junk');
});

test('stacked setup players fit five across without sideways scroll', async ({ page }) => {
  await page.evaluate(() => {
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '5', box: true, junk: 3 },
      { name: 'Ned Green', initials: 'NG', tee: 'White', hcp: '+2', box: false, junk: 3 },
      { name: 'Amy Chen', initials: 'AC', tee: 'Gold', hcp: '12', box: false, junk: 5 },
      { name: 'Larry Brown', initials: 'LB', tee: 'Blue', hcp: '10', box: false, junk: 3 },
      { name: 'Dana Kim', initials: 'DK', tee: 'Red', hcp: '14', box: false, junk: 3 }
    ];
    amounts = {};
    draw();
    showScreen('setup');
  });
  await expect(page.locator('.pcard')).toHaveCount(5);
  await expect(page.locator('.hcpval').nth(1)).toHaveText('+2');
  const fits = () => page.evaluate(() => {
    const el = document.getElementById('players');
    const pageWider = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const cardWider = [...el.querySelectorAll('.pcard')].some(row => row.scrollWidth > row.clientWidth + 1);
    return { pageWider: pageWider, cardWider: cardWider, listWider: el.scrollWidth > el.clientWidth + 1 };
  });
  const columns = () => page.locator('.pcard').first().evaluate(card => {
    const box = sel => {
      const n = card.querySelector(sel);
      const r = n.getBoundingClientRect();
      const style = getComputedStyle(n);
      return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height, border: style.borderTopWidth, background: style.backgroundColor };
    };
    const name = box('.name');
    const init = box('.initials');
    const hcp = box('.hcpstep');
    const tee = box('.tee');
    const x = box('.remove');
    const flag = box('.box');
    const junk = box('.pjunk');
    const num = box('.hcpval');
    const junkNum = box('.pjunk input');
    const betNum = document.querySelector('#bets .amt input');
    const betBorder = betNum ? getComputedStyle(betNum).borderTopWidth : '0px';
    return { name, init, hcp, tee, x, flag, junk, num, junkNum, betBorder };
  });
  let fit = await fits();
  expect(fit).toEqual({ pageWider: false, cardWider: false, listWider: false });
  let col = await columns();
  expect(Math.abs(col.flag.left - col.init.left)).toBeLessThan(2);
  expect(Math.abs(col.flag.width - col.init.width)).toBeLessThan(2);
  expect(Math.abs(col.junk.left - col.hcp.left)).toBeLessThan(2);
  expect(Math.abs(col.junk.width - col.hcp.width)).toBeLessThan(2);
  expect(Math.abs(col.x.right - col.name.right)).toBeLessThan(2);
  expect(col.tee.right).toBeLessThanOrEqual(col.x.left + 1);
  expect(col.num.border).toBe('0px');
  expect(col.junkNum.border).toBe('0px');
  expect(col.betBorder).toBe('0px');
  [col.name, col.init, col.tee, col.x, col.flag].forEach(item => {
    expect(item.height).toBeGreaterThanOrEqual(44);
  });
  expect(Math.abs(col.name.top - col.init.top)).toBeLessThan(2);
  expect(Math.abs(col.tee.top - col.flag.top)).toBeLessThan(2);
  expect(Math.abs(col.tee.top - col.x.top)).toBeLessThan(2);
  const hcpMid = await page.locator('.pcard').nth(1).evaluate(card => {
    const num = card.querySelector('.hcpval').getBoundingClientRect();
    const btn = card.querySelector('.hcpstep button').getBoundingClientRect();
    return {
      delta: Math.abs((num.top + num.bottom) / 2 - (btn.top + btn.bottom) / 2),
      inset: num.top - btn.top
    };
  });
  expect(hcpMid.delta).toBeLessThan(2);
  expect(hcpMid.inset).toBeGreaterThan(4);
  await page.evaluate(() => { document.documentElement.setAttribute('data-font', '3'); });
  fit = await fits();
  expect(fit).toEqual({ pageWider: false, cardWider: false, listWider: false });
  col = await columns();
  expect(Math.abs(col.flag.left - col.init.left)).toBeLessThan(2);
  expect(Math.abs(col.junk.left - col.hcp.left)).toBeLessThan(2);
  expect(Math.abs(col.x.right - col.name.right)).toBeLessThan(2);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-font', '1');
    const tabs = document.getElementById('tabbar');
    if (tabs) tabs.style.visibility = 'hidden';
  });
  await page.locator('#players').screenshot({ path: shotDir + '/setup-stacked-v2.png' });
  await page.locator('#players').screenshot({ path: artDir + '/setup-stacked-v2.png' });
  await page.locator('#players').screenshot({ path: shotDir + '/setup-hcp.png' });
  await page.locator('#players').screenshot({ path: artDir + '/setup-hcp.png' });
  await page.locator('.pcard').nth(4).locator('button[data-pjunk-step="1"]').click();
  const after = await page.evaluate(() => {
    const name = Object.keys(amounts).find(n => amounts[n] && amounts[n].player && amounts[n].player.DK != null);
    return { junk: players[4].junk, match: name ? amounts[name].player.DK : null };
  });
  expect(after.junk).toBe(4);
  expect(after.match).toBe(4);
  await page.locator('.pcard').nth(4).locator('button.remove').click();
  await expect(page.locator('.pcard')).toHaveCount(4);
});

test('score tee name stays fully readable at a larger font', async ({ page }) => {
  await twoPlayer(page, { tlHcp: '5', nsHcp: '14', hole: 0, screen: 'score' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-font', '3');
    holePlayers[0].tee = 'White tournament';
    holePlayers[1].tee = 'Blue/White';
    players[0].tee = 'White tournament';
    players[1].tee = 'Blue/White';
    drawHole();
  });
  await expect(page.locator('.sname').first()).toContainText('White tournament');
  await expect(page.locator('.sname').nth(1)).toContainText('Blue/White');
  const fit = await page.locator('.sname').evaluateAll(els => els.slice(0, 2).map(el => ({
    text: el.textContent,
    wider: el.scrollWidth > el.clientWidth + 1,
    pageWider: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  })));
  expect(fit[0].wider).toBeFalsy();
  expect(fit[1].wider).toBeFalsy();
  expect(fit[0].pageWider).toBeFalsy();
});

test('eagle amount is editable and still defaults to twice the birdie', async ({ page }) => {
  await twoPlayer(page, { junk: 4, first: 0, second: 0, overall: 0, tl: { 0: 2 }, ns: { 0: 4 } });
  let roll = await page.evaluate(() => lastSettle.roll);
  expect(roll.TL).toBe(8);
  expect(roll.NS).toBe(-8);
  roll = await page.evaluate(() => {
    junkTypes.eagle.amt = 7;
    drawHole();
    return lastSettle.roll;
  });
  expect(roll.TL).toBe(7);
  expect(roll.NS).toBe(-7);
  const legacy = await page.evaluate(() => {
    applyJunkTypes(null);
    const saved = { birdie: { on: true, amt: null }, sandy: { on: true, amt: null } };
    applyJunkTypes(saved);
    holeScores[0][0] = 2;
    drawHole();
    return { amt: junkTypes.eagle.amt, roll: lastSettle.roll };
  });
  expect(legacy.amt).toBeNull();
  expect(legacy.roll.TL).toBe(8);
  expect(legacy.roll.NS).toBe(-8);
});

test('Greenie/KP on a bogey does not pay and the carry moves on', async ({ page }) => {
  await twoPlayer(page, {
    junk: 5,
    first: 0,
    second: 0,
    overall: 0,
    hole: 2,
    tl: { 2: 4, 6: 3 },
    ns: { 2: 4, 6: 3 },
    mark: [
      { id: 'TL', h: 2, fields: { KP: 1 } },
      { id: 'NS', h: 6, fields: { KP: 1 } }
    ]
  });
  const carried = await page.evaluate(() => ({
    bogey: kpPays(0, 2),
    par: kpPays(1, 6),
    counts: kpForMatch(['TL', 'NS']),
    roll: lastSettle.roll
  }));
  expect(carried.bogey).toBeFalsy();
  expect(carried.par).toBeTruthy();
  expect(carried.counts.TL).toBe(0);
  expect(carried.counts.NS).toBe(2);
  expect(carried.roll.NS).toBe(10);
  expect(carried.roll.TL).toBe(-10);
  await page.locator('.junkbtn').first().click();
  await expect(page.locator('button[data-sheet-type="greenie"]')).toHaveClass(/on/);
  await expect(page.locator('#junkSheetHint')).toBeVisible();
  await expect(page.locator('#junkSheetHint')).toContainText('does not pay');
  const closerBogey = await page.evaluate(() => {
    holeMarks[0][2] = Object.assign(blankMark(), { KP: 1 });
    holeMarks[1][2] = Object.assign(blankMark(), { KP: 2 });
    holeScores[0][2] = 4;
    holeScores[1][2] = 3;
    holeMarks[0][6] = blankMark();
    holeMarks[1][6] = blankMark();
    holeScores[0][6] = 3;
    holeScores[1][6] = 3;
    drawHole();
    return { counts: kpForMatch(['TL', 'NS']), roll: lastSettle.roll };
  });
  expect(closerBogey.counts.TL).toBe(0);
  expect(closerBogey.counts.NS).toBe(1);
  expect(closerBogey.roll.NS).toBe(5);
  expect(closerBogey.roll.TL).toBe(-5);
  await page.evaluate(() => { holeNo = 2; junkSheetPlayer = 1; paintJunkSheet(); });
  await expect(page.locator('#junkSheetHint')).toBeHidden();
});

async function showSetup(page) {
  await page.evaluate(() => showScreen('setup'));
}

test('betting setup is created, renamed, and still last-used after reload', async ({ page }) => {
  await showSetup(page);
  await page.locator('#dFirst').fill('10');
  await page.locator('#dSecond').fill('10');
  await page.locator('#dOverall').fill('10');
  await page.locator('#dPressF').fill('10');
  await page.locator('#dPressB').fill('10');
  await page.locator('#dBox').click();
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill("Andy's setup");
  await page.locator('#setupNotesInput').fill('Wood Ranch Saturday');
  await page.locator('#setupSaveConfirm').click();
  await expect(page.locator('#setupList')).toContainText("Andy's setup");
  await expect(page.locator('#setupList')).toContainText('Last used');
  await expect(page.locator('#setupList')).toContainText('$10 Nassau · auto 2-down presses · $3 junk · box on');
  await expect(page.locator('#setupList')).toContainText('Wood Ranch Saturday');
  await expect(page.locator('#saveDefault')).toHaveCount(0);
  await page.locator('#bettingSetup').evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo(0, Math.max(0, y));
  });
  await shot(page, 'setup-picker');
  await page.locator('#setupManage').click();
  await page.locator('[data-manage-name]').fill("Andy's weekend");
  await page.locator('#setupManageDone').click();
  await expect(page.locator('#setupList')).toContainText("Andy's weekend");
  await page.reload();
  await showSetup(page);
  await expect(page.locator('#setupList')).toContainText("Andy's weekend");
  await expect(page.locator('#setupList .tag')).toContainText('Last used');
  await expect(page.locator('#dFirst')).toHaveValue('10');
  await expect(page.locator('#dBox')).toContainText('Box on');
});

test('deleting the last-used setup falls back, then blanks the amounts', async ({ page }) => {
  await showSetup(page);
  await page.locator('#dFirst').fill('10');
  await page.locator('#dSecond').fill('10');
  await page.locator('#dOverall').fill('10');
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill('Andys');
  await page.locator('#setupSaveConfirm').click();
  await page.locator('#dFirst').fill('5');
  await page.locator('#dSecond').fill('5');
  await page.locator('#dOverall').fill('5');
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill('Neals');
  await page.locator('#setupSaveConfirm').click();
  await page.locator('#setupManage').click();
  await page.locator('button[data-setup-delete]').nth(1).click();
  await expect(page.locator('#setupList')).toContainText('Andys');
  await expect(page.locator('#setupList')).not.toContainText('Neals');
  await expect(page.locator('#dFirst')).toHaveValue('10');
  await expect(page.locator('#setupList .tag')).toContainText('Last used');
  await page.locator('#setupManage').click();
  await page.locator('button[data-setup-delete]').click();
  await expect(page.locator('#setupList')).toContainText('No Betting Setups');
  await expect(page.locator('#dFirst')).toHaveValue('0');
  await expect(page.locator('#dOverall')).toHaveValue('0');
  await expect(page.locator('#dJunk')).toHaveValue('0');
});

test('a picked setup fills every match; changes update or save as without storing player junk', async ({ page }) => {
  await page.evaluate(() => {
    showScreen('setup');
    players = [
      { name: 'Gina Smith', initials: 'GS', tee: 'Blue', hcp: '5', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '8', box: false }
    ];
    amounts = {};
    ['dFirst', 'dSecond'].forEach(id => { document.getElementById(id).value = '10'; });
    document.getElementById('dOverall').value = '20';
    document.getElementById('dPressF').value = '10';
    document.getElementById('dPressB').value = '10';
    document.getElementById('dJunk').value = '3';
    draw();
  });
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill("Andy's setup");
  await page.locator('#setupSaveConfirm').click();
  await page.locator('button.grow').click();
  await expect(page.locator('#bets input[data-f="first"]').first()).toHaveValue('10');
  await expect(page.locator('#bets input[data-f="overall"]').first()).toHaveValue('20');
  const first = page.locator('#bets input[data-f="first"]').first();
  await first.fill('5');
  await first.dispatchEvent('input');
  await expect(page.locator('.hint').first()).toContainText("Changed from Andy's setup");
  await expect(page.locator('#setupUpdate')).toContainText("Update");
  await page.evaluate(() => { setPlayerJunk(0, 0.5); draw(); });
  await expect(page.locator('#players .pov')).toHaveCount(0);
  await expect(page.locator('#players')).not.toContainText('GS $0.50');
  await expect(page.locator('.povchip').first()).toHaveText('GS $0.50');
  await expect(page.locator('.matchcard.changed').first()).toBeVisible();
  await page.locator('#betSetupPanel').evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo(0, Math.max(0, y));
  });
  await shot(page, 'setup-bets');
  const savedBase = await page.evaluate(() => bettingSetups.find(s => s.name === "Andy's setup").first);
  expect(savedBase).toBe(10);
  await page.locator('#setupSaveAs2').click();
  await page.locator('#setupNameInput').fill('Side setup');
  await page.locator('#setupSaveConfirm').click();
  const afterSave = await page.evaluate(() => ({
    count: bettingSetups.length,
    andy: bettingSetups.find(s => s.name === "Andy's setup").first,
    stored: JSON.stringify(bettingSetups)
  }));
  expect(afterSave.count).toBe(2);
  expect(afterSave.andy).toBe(10);
  expect(afterSave.stored).not.toContain('0.5');
  await page.locator('button.grow', { hasText: "Andy's setup" }).click();
  await page.locator('#dFirst').fill('8');
  await page.locator('#dFirst').dispatchEvent('input');
  await page.locator('#setupUpdate').click();
  expect(await page.evaluate(() => bettingSetups.find(s => s.name === "Andy's setup").first)).toBe(8);
});

test('re-apply confirms before a changed match is reset', async ({ page }) => {
  await page.evaluate(() => {
    showScreen('setup');
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '1', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '2', box: false }
    ];
    amounts = {};
    ['dFirst', 'dSecond', 'dOverall'].forEach(id => { document.getElementById(id).value = '10'; });
    draw();
  });
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill('Even');
  await page.locator('#setupSaveConfirm').click();
  const first = page.locator('#bets input[data-f="first"]').first();
  await first.fill('4');
  await first.dispatchEvent('input');
  await expect(page.locator('.hint')).toContainText('Changed from Even');
  await page.evaluate(() => { window.confirm = () => false; });
  await page.locator('button.grow').click();
  await expect(first).toHaveValue('4');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('button.grow').click();
  await expect(first).toHaveValue('10');
});

test('share link adds, replaces, or keeps both, and drops the query', async ({ page }) => {
  await showSetup(page);
  await page.locator('#dFirst').fill('10');
  await page.locator('#dSecond').fill('10');
  await page.locator('#dOverall').fill('10');
  await page.locator('#dJunk').fill('3');
  await page.locator('#dBox').click();
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill("Andy's setup");
  await page.locator('#setupNotesInput').fill('Wood Ranch Saturday');
  await page.locator('#setupSaveConfirm').click();
  await page.locator('#setupShare').click();
  const url = await page.locator('#setupLink').innerText();
  expect(url).toContain('https://topper-l.github.io/golf/?setup=');
  await shot(page, 'setup-share');
  const payload = new URL(url).searchParams.get('setup');
  const decoded = await page.evaluate(raw => JSON.stringify(decodeSetupParam(raw)), payload);
  expect(decoded).toContain("Andy's setup");
  expect(decoded).not.toContain('Topper');
  await page.evaluate(() => { bettingSetups = []; selectedSetupId = ''; lastUsedSetupId = ''; saveBettingSetups(); });
  await page.goto('/?setup=' + encodeURIComponent(payload));
  await expect(page.locator('#setupSheet')).toContainText("Andy's setup");
  await expect(page.locator('#setupSheet')).toContainText('$10 Nassau');
  await expect(page.locator('#setupSheet')).toContainText('Wood Ranch Saturday');
  await page.locator('#setupAdd').click();
  expect(page.url()).not.toContain('setup=');
  await expect(page.locator('#setupList')).toContainText("Andy's setup");
  await page.goto('/?setup=' + encodeURIComponent(payload));
  await expect(page.locator('#setupReplace')).toBeVisible();
  await expect(page.locator('#setupKeep')).toBeVisible();
  const before = await page.evaluate(() => bettingSetups.length);
  await page.locator('#setupSheet').getByRole('button', { name: 'Cancel' }).click();
  expect(page.url()).not.toContain('setup=');
  expect(await page.evaluate(() => bettingSetups.length)).toBe(before);
  await page.goto('/?setup=' + encodeURIComponent(payload));
  await page.locator('#setupKeep').click();
  expect(await page.evaluate(() => bettingSetups.length)).toBe(before + 1);
  await page.goto('/?setup=' + encodeURIComponent(payload));
  await page.locator('#setupReplace').click();
  expect(await page.evaluate(() => bettingSetups.filter(s => s.name === "Andy's setup").length)).toBe(before + 1);
});

test('set to $0 clears the round and leaves the saved setup alone', async ({ page }) => {
  await showSetup(page);
  await page.evaluate(() => {
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '1', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '2', box: false }
    ];
    amounts = {};
    draw();
  });
  await page.locator('#dFirst').fill('9');
  await page.locator('#dSecond').fill('9');
  await page.locator('#dOverall').fill('9');
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill('Nines');
  await page.locator('#setupSaveConfirm').click();
  await page.locator('button.grow').click();
  await page.locator('#noMoney').click();
  await expect(page.locator('#dFirst')).toHaveValue('0');
  await expect(page.locator('#bets input[data-f="first"]').first()).toHaveValue('0');
  expect(await page.evaluate(() => bettingSetups.find(s => s.name === 'Nines').first)).toBe(9);
  await expect(page.locator('#setupUpdate')).toBeVisible();
});

test('an old Set Default blob becomes the last-used Betting Setup', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('bet-default', JSON.stringify({ first: '7', second: '7', overall: '7', press: '0', pressDown: '2', junk: '2', pct: '100' }));
    localStorage.removeItem('golf-setups');
  });
  await page.reload();
  await showSetup(page);
  await expect(page.locator('#setupList')).toContainText('Previous default');
  await expect(page.locator('#setupList')).toContainText('Last used');
  await expect(page.locator('#dFirst')).toHaveValue('7');
  await expect(page.locator('#dJunk')).toHaveValue('2');
  expect(await page.evaluate(() => localStorage.getItem('bet-default'))).toBeNull();
});

test('a player junk override shows on the match and in settle details', async ({ page }) => {
  await twoPlayer(page, { junk: 3, first: 0, second: 0, overall: 0, tl: { 0: 3 }, ns: { 0: 4 } });
  await page.evaluate(() => {
    document.getElementById('dJunk').value = '3';
    players[0].initials = 'GS';
    players[0].junk = 0.5;
    holePlayers[0].id = 'GS';
    const bet = amounts['TL vs NS'];
    bet.player.GS = 0.5;
    draw();
    settle();
  });
  await showSetup(page);
  await expect(page.locator('#players .pov')).toHaveCount(0);
  await expect(page.locator('#players')).not.toContainText('GS $0.50');
  await expect(page.locator('.povchip').first()).toContainText('GS $0.50');
  await expect(page.locator('.matchcard').first()).toContainText('Changed');
  await expect(page.locator('.settle-math')).toContainText('GS $0.50');
  const sum = await page.evaluate(() => {
    const roll = lastSettle.roll;
    return Math.round(Object.keys(roll).reduce((n, id) => n + roll[id], 0) * 100) / 100;
  });
  expect(sum).toBe(0);
});

test('applying a betting setup keeps settle nets at zero', async ({ page }) => {
  await twoPlayer(page, { junk: 5, first: 10, second: 10, overall: 10, tl: { 0: 3 }, ns: { 0: 5 } });
  const sum = await page.evaluate(() => {
    showScreen('setup');
    document.getElementById('dFirst').value = '10';
    document.getElementById('dSecond').value = '10';
    document.getElementById('dOverall').value = '10';
    document.getElementById('dJunk').value = '5';
    const s = addSetupFromForm('Nassau day', '');
    pickSetup(s.id);
    settle();
    const roll = lastSettle.roll;
    return Math.round(((roll.TL || 0) + (roll.NS || 0)) * 100) / 100;
  });
  expect(sum).toBe(0);
  expect(await page.evaluate(() => bettingSetups[0].name)).toBe('Nassau day');
});

test('card dots align, match line is original only, and arrows follow the number', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '18', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: p.hcp, box: false }));
    holeScores = [pars.slice(), pars.slice()];
    for (let h = 0; h < 9; h++) holeScores[1][h] = pars[h] + 1;
    for (let h = 9; h < 18; h++) { holeScores[0][h] = null; holeScores[1][h] = null; }
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = { 'TL vs NS': { on: true, first: 10, second: 10, overall: 10, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: false, player: { TL: 0, NS: 0 }, offers: [], mp18: false, mp: 0 } };
    roundStop = null;
    holeNo = 0;
    startAt = 0;
    playedThru = 8;
    ninesPlayed = null;
    roundId = 'card-line';
    cardPick = 'TL';
    cardMatchName = 'TL vs NS';
    syncPlayedNines();
    showScreen('card');
    drawHole();
  });
  await expect(page.locator('#card table.scorecard .mcell')).toHaveCount(0);
  await expect(page.locator('#cardMatchLine')).toContainText('1st 9');
  await expect(page.locator('#cardMatchLine')).toContainText('Overall');
  await expect(page.locator('#cardMatchLine')).not.toContainText('2nd 9');
  await expect(page.locator('#cardMatchLine')).toContainText('↑');
  const align = await page.locator('#card table.scorecard tr').nth(1).locator('.stack').evaluateAll(stacks => stacks.slice(-2).map(stack => {
    const num = stack.querySelector('.num, .shape');
    const dots = stack.querySelector('.dots');
    const nr = num.getBoundingClientRect();
    const dr = dots.getBoundingClientRect();
    return { bottom: nr.bottom, dots: dr.height, empty: dots.textContent === '' };
  }));
  expect(align[0].dots).toBe(align[1].dots);
  expect(align.some(row => row.empty)).toBeTruthy();
  expect(align.some(row => !row.empty)).toBeTruthy();
  expect(Math.abs(align[0].bottom - align[1].bottom)).toBeLessThan(2);
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    for (let h = 9; h < 18; h++) {
      holeScores[0][h] = pars[h];
      holeScores[1][h] = pars[h] + 1;
    }
    playedThru = 17;
    drawHole();
  });
  const line = await page.locator('#cardMatchLine').innerText();
  expect(line).toContain('1st 9');
  expect(line).toContain('2nd 9');
  expect(line).toContain('Overall');
  expect(line).not.toMatch(/↑\d|↓\d/);
  await shot(page, 'card-matchline');
  await page.evaluate(() => {
    amounts['TL vs NS'].first = 0;
    amounts['TL vs NS'].second = 0;
    amounts['TL vs NS'].overall = 10;
    drawHole();
  });
  const only = await page.locator('#cardMatchLine').innerText();
  expect(only.startsWith('Overall')).toBeTruthy();
  expect(only).not.toContain('1st 9');
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await page.locator('#standing').evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo(0, Math.max(0, y));
  });
  const standing = await page.locator('#standing').innerText();
  expect(standing).not.toMatch(/↑\d|↓\d/);
  expect(standing).toMatch(/\d↑|\d↓|AS/);
  await shot(page, 'standing-arrows');
});

test('score actions keep their size and the press list is gone', async ({ page }) => {
  await twoPlayer(page, { junk: 0, first: 10, second: 0, overall: 0, hole: 0, screen: 'score' });
  await page.evaluate(() => {
    holeScores[0][0] = null;
    holeScores[1][0] = null;
    drawHole();
  });
  await expect(page.locator('#postReady')).toHaveCount(0);
  await expect(page.locator('#presses')).toHaveCount(0);
  const boxes = () => page.locator('#scoreActions button').evaluateAll(els => els.filter(el => !el.hidden).map(el => {
    const parent = el.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { id: el.id, x: Math.round(r.x - parent.x), y: Math.round(r.y - parent.y), w: Math.round(r.width), h: Math.round(r.height) };
  }));
  const before = await boxes();
  expect(before.map(b => b.id)).toEqual(['back', 'post', 'clearHole', 'toSetup', 'quitRound']);
  await page.locator('#scoreActions').evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo(0, Math.max(0, y));
  });
  await shot(page, 'score-actions-before');
  await page.evaluate(() => {
    holeScores[0][0] = 4;
    holeScores[1][0] = 5;
    drawHole();
  });
  const after = await boxes();
  expect(after).toEqual(before);
  await expect(page.locator('#post')).toHaveClass(/ready/);
  const width = await page.locator('#post').evaluate(el => el.getBoundingClientRect().width);
  const row = await page.locator('#scoreActions').evaluate(el => el.getBoundingClientRect().width);
  expect(width).toBeLessThan(row * 0.7);
  await page.locator('#scoreActions').evaluate(el => {
    const y = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo(0, Math.max(0, y));
  });
  await shot(page, 'score-actions-after');
});

test('banner collapses eight presses to plus five and expands in place', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'ZT', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: false }));
    holeScores = [pars.map(p => p + 1), pars.slice()];
    for (let h = 9; h < 18; h++) { holeScores[0][h] = null; holeScores[1][h] = null; }
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = { 'TL vs ZT': { on: true, first: 10, second: 10, overall: 10, press: 5, pressFront: 5, pressBack: 5, pressDown: 1, autoPress: true, pressMode: 'auto', player: { TL: 0, ZT: 0 }, offers: [], mp18: false, mp: 0 } };
    roundStop = null;
    holeNo = 8;
    startAt = 0;
    playedThru = 8;
    ninesPlayed = null;
    roundId = 'eight-press';
    bannerOpen = {};
    syncPlayedNines();
    showScreen('score');
    drawHole();
  });
  const count = await page.evaluate(() => bannerPresses(simulateMatch('TL vs ZT', ['TL'], ['ZT']), 0).length);
  expect(count).toBe(8);
  const collapsed = await page.locator('.banner').first().innerText();
  expect(collapsed).toContain('TL vs ZT · 1 of 1');
  expect(collapsed).toContain('thru 9');
  expect(collapsed).toContain('+5');
  expect(collapsed).toContain('Tap for all 8 presses');
  expect(collapsed).not.toContain('2nd 9');
  expect(collapsed).not.toMatch(/↑\d|↓\d/);
  await shot(page, 'banner-collapsed');
  await page.locator('.banner').first().click();
  const open = await page.locator('.banner').first().innerText();
  expect(open).toContain('Tap to collapse');
  expect(open).toContain('P1 from 2');
  expect(open).toContain('P8 from 9');
  expect(open).toContain('+5');
  await shot(page, 'banner-expanded');
  await page.locator('.banner').first().click();
  await expect(page.locator('.b-full')).toHaveCount(0);
});

test('score page keeps the round box below quit and the rows above the fold', async ({ page }) => {
  const fit = () => page.evaluate(() => {
    window.scrollTo(0, 0);
    const junk = document.querySelector('#scores .srow:last-child .junkbtn');
    const banner = document.querySelector('.banner');
    const bar = document.getElementById('tabbar').getBoundingClientRect();
    const jr = junk.getBoundingClientRect();
    const br = banner.getBoundingClientRect();
    return {
      players: document.querySelectorAll('#scores .srow').length,
      bannerTop: br.top,
      junkBottom: jr.bottom,
      limit: bar.top,
      fits: br.top >= 0 && jr.bottom <= bar.top + 1
    };
  });
  await twoPlayer(page, { junk: 0, first: 10, second: 10, overall: 10, screen: 'score' });
  await expect(page.locator('#scoreHint')).toBeHidden();
  await expect(page.locator('#roundDetail')).toBeVisible();
  const order = await page.evaluate(() => {
    const quit = document.getElementById('quitRound').getBoundingClientRect().top;
    const box = document.getElementById('roundDetail').getBoundingClientRect().top;
    const scores = document.getElementById('scores').getBoundingClientRect().top;
    return { quit, box, scores };
  });
  expect(order.box).toBeGreaterThan(order.quit);
  expect(order.scores).toBeLessThan(order.quit);
  const two = await fit();
  expect(two.fits).toBeTruthy();
  await shot(page, 'score-top-2');
  await page.evaluate(() => {
    holeScores.forEach(row => row.fill(null));
    drawHole();
  });
  await expect(page.locator('#scoreHint')).toBeVisible();
  await expect(page.locator('#scoreHint')).toHaveText('− and + set the score. X is a pickup.');
  await page.evaluate(() => { holeScores[0][0] = 4; holeScores[1][0] = 5; drawHole(); });
  await expect(page.locator('#scoreHint')).toBeHidden();
  const weights = await page.evaluate(() => {
    setFont(0);
    const read = () => parseFloat(getComputedStyle(document.querySelector('.b-primary')).fontSize);
    const small = read();
    setFont(1);
    const mid = read();
    setFont(3);
    const big = read();
    const kicker = parseInt(getComputedStyle(document.querySelector('.b-kicker')).fontWeight, 10);
    const nine = parseInt(getComputedStyle(document.querySelector('.b-line')).fontWeight, 10);
    setFont(0);
    return { small, mid, big, kicker, nine };
  });
  expect(weights.small).toBeLessThan(weights.mid);
  expect(weights.mid).toBeLessThan(weights.big);
  expect(weights.mid).toBe(18);
  expect(weights.nine).toBeGreaterThan(weights.kicker);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'banner-a-minus');
  await page.evaluate(() => { setFont(3); window.scrollTo(0, 0); });
  await shot(page, 'banner-a-plus');
  await page.evaluate(() => setFont(1));
  await page.locator('#roundDetail').evaluate(el => el.scrollIntoView());
  await shot(page, 'score-bottom-round');
  let confirmed = false;
  await page.evaluate(() => { window.confirm = () => false; });
  await page.locator('#deleteRound').click();
  await expect(page.locator('#holeView')).toBeVisible();
  await page.evaluate(() => { window.confirm = (msg) => { window.__deleteAsk = msg; return true; }; });
  await page.locator('#deleteRound').click();
  confirmed = await page.evaluate(() => window.__deleteAsk || '');
  expect(confirmed).toContain('Delete');
  await expect(page.locator('#screen-gate')).toBeVisible();
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    const raw = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '5', box: false },
      { name: 'Ned Green', initials: 'NG', tee: 'White', hcp: '8', box: false },
      { name: 'Amy Chen', initials: 'AC', tee: 'Gold', hcp: '12', box: false },
      { name: 'Dana Kim', initials: 'DK', tee: 'Red', hcp: '14', box: false }
    ];
    players = raw;
    holePlayers = raw.map(p => ({ id: p.initials, name: p.name, tee: p.tee, hcp: p.hcp, box: false }));
    holeScores = raw.map(() => pars.slice());
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = { 'TL vs NG': { on: true, first: 10, second: 10, overall: 10, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: true, player: { TL: 0, NG: 0, AC: 0, DK: 0 }, offers: [], mp18: false, mp: 0 } };
    roundStop = null;
    holeNo = 0;
    startAt = 0;
    playedThru = 17;
    ninesPlayed = null;
    roundId = 'four';
    syncPlayedNines();
    showScreen('score');
    drawHole();
    window.scrollTo(0, 0);
  });
  const four = await fit();
  expect(four.players).toBe(4);
  expect(four.fits).toBeTruthy();
  await shot(page, 'score-top-4');
});

test('card shapes share a center line and the columns fill the card', async ({ page }) => {
  await twoPlayer(page, { tl: { 0: 5, 4: 3 }, ns: { 0: 4, 4: 5 }, junk: 0, first: 10, second: 10, overall: 10, screen: 'card' });
  await page.evaluate(() => { holeScores[0][9] = 'X'; drawHole(); });
  await expect(page.locator('#card .nine-lab').nth(0)).toContainText('1st 9');
  await expect(page.locator('#card .nine-lab').nth(1)).toContainText('2nd 9');
  await expect(page.locator('#card table.grand')).toContainText('Tot');
  await expect(page.locator('#card col.cgap')).toHaveCount(0);
  await expect(page.locator('#card .shape.par').first()).toBeVisible();
  await expect(page.locator('#card .shape.x').first()).toBeVisible();
  const align = await page.locator('#card table.scorecard').first().locator('tr').nth(1).evaluate(row => {
    const shapes = [...row.querySelectorAll('.shape')].map(el => el.getBoundingClientRect());
    const mids = shapes.map(r => (r.top + r.bottom) / 2);
    const table = row.closest('table').getBoundingClientRect();
    const last = row.querySelector('td:last-child').getBoundingClientRect();
    return { spread: Math.max(...mids) - Math.min(...mids), gap: table.right - last.right };
  });
  expect(align.spread).toBeLessThan(2);
  expect(align.gap).toBeLessThan(4);
  const nineWrap = await page.locator('#card .nine-lab').first().evaluate(el => el.scrollWidth - el.clientWidth);
  expect(nineWrap).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    document.getElementById('tabbar').style.visibility = 'hidden';
    document.querySelector('.topbar').style.position = 'relative';
  });
  await shot(page, 'card-both-nines', { fullPage: true });
  await page.evaluate(() => setFont(3));
  const aplus = await page.locator('#card table.scorecard').first().locator('tr').nth(1).evaluate(row => {
    const shapes = [...row.querySelectorAll('.shape')];
    const mids = shapes.map(el => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    const box = shapes[2].getBoundingClientRect();
    const table = row.closest('table').getBoundingClientRect();
    const last = row.querySelector('td:last-child').getBoundingClientRect();
    return { spread: Math.max(...mids) - Math.min(...mids), square: Math.abs(box.width - box.height), gap: table.right - last.right };
  });
  expect(aplus.spread).toBeLessThan(2);
  expect(aplus.square).toBeLessThan(2);
  expect(aplus.gap).toBeLessThan(4);
  await shot(page, 'card-aplus', { fullPage: true });
  await page.evaluate(() => {
    setFont(1);
    document.getElementById('tabbar').style.visibility = '';
    document.querySelector('.topbar').style.position = '';
    showScreen('standing');
    window.scrollTo(0, 0);
  });
  await expect(page.locator('#cardStanding .matchlab').first()).toContainText('Match');
  await expect(page.locator('#cardStanding .ordlab').first()).toContainText('1st');
  await expect(page.locator('#cardStanding .ordlab').nth(1)).toContainText('2nd');
  await shot(page, 'match-table', { fullPage: true });
  await page.evaluate(() => { setFont(3); window.scrollTo(0, 0); });
  await shot(page, 'match-aplus', { fullPage: true });
});

test('junk counts pay per tap and undo restores them', async ({ page }) => {
  await twoPlayer(page, { junk: 3, first: 0, second: 0, overall: 0, tl: { 0: 4 }, ns: { 0: 4 }, screen: 'score' });
  await page.evaluate(() => { junkTypes.chip.on = true; });
  await page.locator('.junkbtn').first().click();
  await page.locator('button[data-count-type="sandy"][data-count-step="1"]').click();
  await page.locator('button[data-count-type="sandy"][data-count-step="1"]').click();
  await page.locator('button[data-count-type="chip"][data-count-step="1"]').click();
  await expect(page.locator('.jcount-val').first()).toHaveText('2');
  await expect(page.locator('.jcount').filter({ hasText: 'Chip-in' }).locator('.jcount-val')).toHaveText('1');
  await shot(page, 'junk-sandy-chip');
  await page.locator('#junkSheetDone').click();
  await expect(page.locator('.schips').first()).toContainText('Sandy ×2');
  await expect(page.locator('.schips').first()).toContainText('Chip-in');
  await expect(page.locator('.schips-pay').first()).toContainText('$3 each · $9');
  const paid = await page.evaluate(() => lastSettle.roll.TL);
  expect(paid).toBe(9);
  await page.locator('#undoScore').click();
  await expect(page.locator('.schips').first()).not.toContainText('Chip-in');
  const afterUndo = await page.evaluate(() => holeMarks[0][0].chip);
  expect(afterUndo).toBe(0);
  await page.evaluate(() => { sandyRule = 'updown'; holeScores[0][0] = 5; holeMarks[0][0].sandy = 2; drawHole(); });
  expect(await page.evaluate(() => lastSettle.roll.TL)).toBe(0);
  await page.evaluate(() => { holeScores[0][0] = 4; drawHole(); });
  expect(await page.evaluate(() => lastSettle.roll.TL)).toBe(3);
});

test('sandy rule is saved on a Betting Setup and in the share link', async ({ page }) => {
  await page.evaluate(() => showScreen('setup'));
  const rule = page.locator('#sandyRule');
  const each = rule.locator('button[data-sandy-rule="each"]');
  const updown = rule.locator('button[data-sandy-rule="updown"]');
  await expect(rule).toBeVisible();
  await expect(rule).toContainText('Sandy rule');
  await expect(each).toHaveClass(/on/);
  await expect(updown).not.toHaveClass(/on/);
  await page.locator('.sandy-block').scrollIntoViewIfNeeded();
  const eachShot = await page.locator('.sandy-block').screenshot();
  await updown.click();
  await expect(updown).toHaveClass(/on/);
  await expect(each).not.toHaveClass(/on/);
  const upShot = await page.locator('.sandy-block').screenshot();
  await stitchShots('setup-sandy-rule', [eachShot, upShot]);
  await page.locator('button[data-junk-toggle="sandy"]').click();
  await expect(rule).toHaveCount(0);
  await page.locator('button[data-junk-toggle="sandy"]').click();
  await expect(updown).toHaveClass(/on/);
  await page.locator('#setupSaveAs').click();
  await page.locator('#setupNameInput').fill('Sandy day');
  await page.locator('#setupSaveConfirm').click();
  const saved = await page.evaluate(() => bettingSetups.find(s => s.name === 'Sandy day').sandyRule);
  expect(saved).toBe('updown');
  await page.locator('#setupShare').click();
  const url = await page.locator('#setupLink').innerText();
  const payload = new URL(url).searchParams.get('setup');
  const decoded = await page.evaluate(raw => decodeSetupParam(raw).sandyRule, payload);
  expect(decoded).toBe('updown');
});

test('a pickup loses the hole unless both sides pick up, and counts as net double bogey', async ({ page }) => {
  await twoPlayer(page, { junk: 0, first: 10, second: 0, overall: 0, tl: { 0: 4 }, ns: { 0: 4 }, screen: 'score' });
  const pickup = await page.evaluate(() => {
    holeScores[0][0] = 'X';
    const ids = ['TL', 'NS'];
    const one = { a: sideNet(['TL'], 0, ids), b: sideNet(['NS'], 0, ids) };
    holeScores[1][0] = 'X';
    const both = { a: sideNet(['TL'], 0, ids), b: sideNet(['NS'], 0, ids) };
    holeScores[0][0] = 'X';
    holeScores[1][0] = 4;
    const ghin = { gross: countedScore(0, 0), net: countedScore(0, 0) - ownStrokes(0, 0), expect: netDoubleBogey(0, 0) };
    return { one, both, ghin };
  });
  expect(pickup.one.a).toBeGreaterThan(pickup.one.b);
  expect(pickup.both.a).toBe(pickup.both.b);
  expect(pickup.ghin.gross).toBe(pickup.ghin.expect);
  expect(pickup.ghin.net).toBe(6);
  const team = await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    players = [
      { name: 'A', initials: 'TL', tee: 'Blue', hcp: '0', box: true },
      { name: 'B', initials: 'NG', tee: 'Blue', hcp: '0', box: true },
      { name: 'C', initials: 'AC', tee: 'Blue', hcp: '0', box: false },
      { name: 'D', initials: 'DK', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: p.box }));
    holeScores = holePlayers.map(() => pars.slice());
    holeScores[0][0] = 'X';
    holeScores[1][0] = 'X';
    holeScores[2][0] = 4;
    holeScores[3][0] = 5;
    const box = ['TL', 'NG'];
    const opp = ['AC', 'DK'];
    const ids = box.concat(opp);
    return { box: sideNet(box, 0, ids), opp: sideNet(opp, 0, ids) };
  });
  expect(team.box).toBeGreaterThan(team.opp);
});

test('start 5 counts thru in play order and holds the open nine until it finishes', async ({ page }) => {
  const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
  await page.evaluate((pars) => {
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: false }));
    holeScores = [pars.map(() => null), pars.map(() => null)];
    for (let h = 4; h <= 17; h++) {
      holeScores[0][h] = pars[h];
      holeScores[1][h] = pars[h];
    }
    holeScores[0][6] = pars[6] + 1;
    holeScores[0][7] = pars[7] + 1;
    holeScores[0][8] = pars[8] + 1;
    holeScores[0][9] = pars[9] - 1;
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = {
      'TL vs NS': {
        on: true, first: 10, second: 10, overall: 10, press: 10, pressFront: 10, pressBack: 10,
        pressDown: 2, autoPress: true, pressMode: 'auto', player: { TL: 0, NS: 0 }, offers: [], mp18: false, mp: 0
      }
    };
    applyJunkTypes(null);
    ['birdie', 'eagle', 'sandy', 'greenie', 'chip', 'poley', 'sharkie', 'other'].forEach(id => { junkTypes[id].on = false; });
    roundStop = null;
    holeNo = 17;
    startAt = 4;
    playedThru = 13;
    ninesPlayed = null;
    roundId = 'shotgun-5';
    bannerOpen = {};
    syncPlayedNines();
    showScreen('score');
    drawHole();
  }, pars);
  const mid = await page.evaluate(() => {
    const sim = simulateMatch('TL vs NS', ['TL'], ['NS']);
    const press = sim.legs.find(l => l.kind === 'press' && l.auto);
    return {
      thru: thruNumber(),
      front: sim.legs.find(l => l.kind === 'nine' && l.seg === 0).score,
      back: sim.legs.find(l => l.kind === 'nine' && l.seg === 1).score,
      from: press && press.from,
      holes: press && press.holes.map(h => h + 1),
      press: press && press.score,
      roll: lastSettle.roll
    };
  });
  expect(mid.thru).toBe(14);
  expect(mid.from).toBe(9);
  expect(mid.holes).toEqual([9, 1, 2, 3, 4]);
  expect(mid.front).toBe(-3);
  expect(mid.press).toBe(-1);
  expect(mid.back).toBe(1);
  expect(mid.roll.TL).toBe(10);
  expect(mid.roll.NS).toBe(-10);
  await expect(page.locator('.b-primary')).toContainText('thru 14');
  await expect(page.locator('.b-primary')).not.toContainText('thru 18');
  await expect(page.locator('.banner')).toContainText('in progress');
  await expect(page.locator('.banner')).toContainText('1st 9');
  await page.locator('.banner').scrollIntoViewIfNeeded();
  await shot(page, 'start5-banner');
  await page.evaluate(() => { showScreen('settle'); });
  await page.locator('button[data-player-fold="TL"]').click();
  await expect(page.locator('#fold-TL')).toContainText('1st 9 in progress');
  await expect(page.locator('#fold-TL')).toContainText('Press from 9 (A) in progress');
  await expect(page.locator('#fold-TL')).toContainText('Overall in progress');
  await expect(page.locator('#fold-TL')).toContainText('2nd 9');
  await expect(page.locator('#fold-TL')).not.toContainText('1st 9 −');
  await expect(page.locator('#fold-TL')).not.toContainText('1st 9 +');
  const standing = await page.evaluate(() => document.getElementById('cardStanding').innerText);
  expect(standing).toContain('in progress');
  expect(standing).toContain('+$10');
  expect(standing).toContain('thru 14');
  const shared = await page.evaluate(() => shareText());
  expect(shared).toContain('thru 14');
  expect(shared).toContain('in progress');
  expect(shared).not.toContain('thru 18');
  await shot(page, 'start5-settle-mid');
  await page.evaluate((pars) => {
    [0, 1, 2, 3].forEach(h => {
      holeScores[0][h] = pars[h] - 1;
      holeScores[1][h] = pars[h];
    });
    settleOpen.TL = true;
    drawHole();
    showScreen('settle');
  }, pars);
  const done = await page.evaluate(() => {
    const sim = simulateMatch('TL vs NS', ['TL'], ['NS']);
    const press = sim.legs.find(l => l.kind === 'press' && l.auto);
    return { thru: thruNumber(), front: sim.legs.find(l => l.kind === 'nine' && l.seg === 0).score, press: press.score, roll: lastSettle.roll };
  });
  expect(done.thru).toBe(18);
  expect(done.front).toBe(1);
  expect(done.press).toBe(3);
  const presses = await page.evaluate(() => simulateMatch('TL vs NS', ['TL'], ['NS']).legs.filter(l => l.kind === 'press').map(l => ({ from: l.from, score: l.score })));
  expect(presses).toEqual([{ from: 9, score: 3 }, { from: 4, score: 1 }]);
  expect(done.roll.TL).toBe(50);
  expect(done.roll.NS).toBe(-50);
  await expect(page.locator('#fold-TL')).not.toContainText('in progress');
  await expect(page.locator('#fold-TL')).toContainText('1st 9');
  await expect(page.locator('#fold-TL')).toContainText('Overall');
  await expect(page.locator('#fold-TL')).toContainText('Press from 9 (A)');
  await shot(page, 'start5-settle-final');
});

test('start 13 does not pay Overall while the 1st 9 is still open', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: false }));
    holeScores = [pars.map(() => null), pars.map(() => null)];
    for (let h = 0; h <= 8; h++) {
      holeScores[0][h] = pars[h];
      holeScores[1][h] = pars[h];
    }
    for (let h = 12; h <= 17; h++) {
      holeScores[0][h] = pars[h];
      holeScores[1][h] = pars[h];
    }
    holeScores[0][0] = pars[0] + 1;
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = { 'TL vs NS': { on: true, first: 10, second: 10, overall: 10, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: false, player: { TL: 0, NS: 0 }, offers: [], mp18: false, mp: 0 } };
    applyJunkTypes(null);
    ['birdie', 'eagle', 'sandy', 'greenie'].forEach(id => { junkTypes[id].on = false; });
    roundStop = null;
    holeNo = 8;
    startAt = 12;
    playedThru = 14;
    ninesPlayed = null;
    roundId = 'shotgun-13';
    syncPlayedNines();
    showScreen('settle');
    drawHole();
  });
  const state = await page.evaluate(() => {
    const holes = holesOfNine(0).map(h => h + 1);
    return { thru: thruNumber(), first: holes, roll: lastSettle.roll, head: nineHead(0).replace(/<[^>]+>/g, '') };
  });
  expect(state.thru).toBe(15);
  expect(state.first).toEqual([13, 14, 15, 16, 17, 18, 10, 11, 12]);
  expect(state.head).toContain('1st 9');
  expect(state.roll.TL).toBe(-10);
  expect(state.roll.NS).toBe(10);
  await page.locator('button[data-player-fold="TL"]').click();
  await expect(page.locator('#fold-TL')).toContainText('1st 9 in progress');
  await expect(page.locator('#fold-TL')).toContainText('Overall in progress');
  await expect(page.locator('#fold-TL')).toContainText('2nd 9');
});

test('start 1 still pays a finished nine and an early closeout', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '0', box: false },
      { name: 'Ned S', initials: 'NS', tee: 'Blue', hcp: '0', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: 'Blue', hcp: '0', box: false }));
    holeScores = [pars.slice(), pars.slice()];
    holeScores[0][0] = 3;
    holeMarks = holePlayers.map(() => freshMarks());
    amounts = { 'TL vs NS': { on: true, first: 10, second: 10, overall: 10, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: false, player: { TL: 0, NS: 0 }, offers: [], mp18: false, mp: 0 } };
    applyJunkTypes(null);
    ['birdie', 'eagle', 'sandy', 'greenie'].forEach(id => { junkTypes[id].on = false; });
    roundStop = null;
    holeNo = 17;
    startAt = 0;
    playedThru = 17;
    ninesPlayed = null;
    roundId = 'start-1';
    syncPlayedNines();
    showScreen('score');
    drawHole();
  });
  const full = await page.evaluate(() => ({ thru: thruNumber(), roll: lastSettle.roll }));
  expect(full.thru).toBe(18);
  expect(full.roll.TL).toBe(20);
  expect(full.roll.NS).toBe(-20);
  await page.evaluate(() => {
    for (let h = 9; h < 18; h++) { holeScores[0][h] = null; holeScores[1][h] = null; }
    drawHole();
  });
  const nine = await page.evaluate(() => ({ thru: thruNumber(), roll: lastSettle.roll }));
  expect(nine.thru).toBe(9);
  expect(nine.roll.TL).toBe(10);
  expect(nine.roll.NS).toBe(-10);
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    holeScores = [pars.slice(), pars.slice()];
    for (let h = 15; h < 18; h++) { holeScores[0][h] = null; holeScores[1][h] = null; }
    [0, 1, 2, 14].forEach(h => { holeScores[0][h] = pars[h] - 1; });
    amounts['TL vs NS'].mp18 = true;
    amounts['TL vs NS'].mp = 20;
    drawHole();
    showScreen('settle');
  });
  const closed = await page.evaluate(() => {
    const mp = matchPlay('TL vs NS', ['TL'], ['NS']);
    return { closed: mp.closed && mp.closed.remain, roll: lastSettle.roll.TL };
  });
  expect(closed.closed).toBe(3);
  expect(closed.roll).toBe(50);
  await page.locator('button[data-player-fold="TL"]').click();
  await expect(page.locator('#fold-TL')).toContainText('Overall');
  await expect(page.locator('#fold-TL')).not.toContainText('Overall in progress');
  await expect(page.locator('#fold-TL')).not.toContainText('2nd 9 in progress');
});

test('a setup handicap change updates the open round without another apply step', async ({ page }) => {
  await page.evaluate(() => {
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    currentCourse = 'Wood Ranch';
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '4', box: false },
      { name: 'Ned Green', initials: 'NG', tee: 'White', hcp: '+1', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: p.tee, hcp: p.hcp, box: false }));
    holeScores = [pars.slice(), pars.slice()];
    holeScores[0][0] = 5;
    holeMarks = holePlayers.map(() => freshMarks());
    holeMarks[0][0] = Object.assign(blankMark(), { sandy: 2 });
    amounts = { 'TL vs NG': { on: true, first: 10, second: 10, overall: 10, press: 0, pressFront: 0, pressBack: 0, pressDown: 2, autoPress: false, player: { TL: 3, NG: 3 }, offers: [], mp18: false, mp: 0 } };
    applyJunkTypes(null);
    ['birdie', 'eagle', 'sandy', 'greenie', 'chip', 'poley', 'sharkie', 'other'].forEach(id => { junkTypes[id].on = false; });
    roundStop = null;
    holeNo = 15;
    startAt = 0;
    playedThru = 17;
    ninesPlayed = null;
    roundId = 'hcp-sync';
    cardPick = 'TL';
    cardMatchName = 'TL vs NG';
    const archive = [{ id: 'old-hcp', auto: false, players: [{ id: 'TL', name: 'Topper Larsen', tee: 'Blue', hcp: '4', box: false }], scores: [pars.slice()], marks: [[]], when: '2020-01-01T12:00:00', course: 'Wood Ranch' }];
    localStorage.setItem('golf-rounds', JSON.stringify(archive));
    syncPlayedNines();
    draw();
    saveCard();
    persistSetup();
    showScreen('card');
    drawHole();
  });
  const before = await page.evaluate(() => ({
    header: document.querySelector('#card th.who').innerText,
    dot: document.querySelector('#card tr[data-hole="15"] td:nth-child(4) .dots').textContent,
    up: (function () {
      let score = 0;
      for (let h = 0; h < 18; h++) {
        const a = sideNet(['TL'], h, ['TL', 'NG']);
        const b = sideNet(['NG'], h, ['TL', 'NG']);
        score += a < b ? 1 : a > b ? -1 : 0;
      }
      return score;
    })(),
    gross: holeScores[0][0],
    sandy: holeMarks[0][0].sandy
  }));
  expect(before.header).toContain('HCP 4');
  expect(before.dot).toBe('');
  expect(before.up).toBe(4);
  await page.locator('#card tr[data-hole="15"]').evaluate(el => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 180)));
  await shot(page, 'hcp-card-before');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.locator('button[data-hcp-step="1"]').first().click();
  await expect(page.locator('.hcpval').first()).toHaveText('5');
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('#card th.who').first()).toContainText('HCP 5');
  const afterStep = await page.evaluate(() => ({
    dot: document.querySelector('#card tr[data-hole="15"] td:nth-child(4) .dots').textContent,
    up: (function () {
      let score = 0;
      for (let h = 0; h < 18; h++) {
        const a = sideNet(['TL'], h, ['TL', 'NG']);
        const b = sideNet(['NG'], h, ['TL', 'NG']);
        score += a < b ? 1 : a > b ? -1 : 0;
      }
      return score;
    })(),
    gross: holeScores[0][0],
    sandy: holeMarks[0][0].sandy,
    bet: amounts['TL vs NG'].first,
    roundHcp: holePlayers[0].hcp,
    setupHcp: players[0].hcp
  }));
  expect(afterStep.dot).toBe('•');
  expect(afterStep.up).toBe(5);
  expect(afterStep.gross).toBe(5);
  expect(afterStep.sandy).toBe(2);
  expect(afterStep.bet).toBe(10);
  expect(afterStep.roundHcp).toBe('5');
  expect(afterStep.setupHcp).toBe('5');
  await page.locator('#card tr[data-hole="15"]').evaluate(el => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 180)));
  await shot(page, 'hcp-card-after');
  await page.getByRole('button', { name: 'Match', exact: true }).click();
  await expect(page.locator('#cardStanding')).toContainText('5↑');
  await expect(page.locator('#cardStanding')).not.toContainText('4↑');
  await shot(page, 'hcp-match-after');
  await page.reload();
  await page.waitForSelector('#newRound');
  const reloaded = await page.evaluate(() => ({ round: holePlayers[0].hcp, setup: players[0].hcp }));
  expect(reloaded.round).toBe('5');
  expect(reloaded.setup).toBe('5');
  await page.locator('#resume').click();
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('#card th.who').first()).toContainText('HCP 5');
  expect(await page.locator('#card tr[data-hole="15"] td:nth-child(4) .dots').innerText()).toBe('•');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.locator('button[data-hcp-step="-1"]').first().click();
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('#card th.who').first()).toContainText('HCP 4');
  expect(await page.locator('#card tr[data-hole="15"] td:nth-child(4) .dots').innerText()).toBe('');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  const typed = page.locator('.hcpval').first();
  await typed.click();
  await typed.fill('5');
  await typed.blur();
  await expect(typed).toHaveText('5');
  await page.getByRole('button', { name: 'Settle', exact: true }).click();
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  await expect(page.locator('#card th.who').first()).toContainText('HCP 5');
  expect(await page.locator('#card tr[data-hole="15"] td:nth-child(4) .dots').innerText()).toBe('•');
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await typed.click();
  await typed.fill('+2');
  await typed.blur();
  await expect(typed).toHaveText('+2');
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await expect(page.locator('.sname .meta').first()).toContainText('HCP +2');
  const kept = await page.evaluate(() => {
    const old = JSON.parse(localStorage.getItem('golf-rounds')).find(r => r.id === 'old-hcp');
    return { oldHcp: old.players[0].hcp, gross: holeScores[0][0], sandy: holeMarks[0][0].sandy, order: holePlayers.map(p => p.id).join() };
  });
  expect(kept.oldHcp).toBe('4');
  expect(kept.gross).toBe(5);
  expect(kept.sandy).toBe(2);
  expect(kept.order).toBe('TL,NG');
  await page.evaluate(() => {
    players = [
      { name: 'Topper Larsen', initials: 'TL', tee: 'Blue', hcp: '4', box: true },
      { name: 'Amy Chen', initials: 'AC', tee: 'Blue', hcp: '10', box: true },
      { name: 'Ned Green', initials: 'NG', tee: 'White', hcp: '+1', box: false },
      { name: 'Dana Kim', initials: 'DK', tee: 'Red', hcp: '12', box: false }
    ];
    holePlayers = players.map(p => ({ id: p.initials, name: p.name, tee: p.tee, hcp: p.hcp, box: !!p.box }));
    const pars = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 4, 4, 3, 4, 5, 4, 3, 5];
    holeScores = holePlayers.map(() => pars.slice());
    holeMarks = holePlayers.map(() => freshMarks());
    const bet = { on: true, first: 10, second: 10, overall: 10, press: 5, pressFront: 5, pressBack: 5, pressDown: 2, autoPress: false, player: { TL: 3, AC: 3, NG: 3, DK: 3 }, offers: [], mp18: false, mp: 0 };
    amounts = { 'TL vs NG': Object.assign({}, bet, { player: Object.assign({}, bet.player) }), 'Box (TL+AC) vs NG+DK': Object.assign({}, bet, { player: Object.assign({}, bet.player) }) };
    roundId = 'hcp-box';
    syncPlayedNines();
    draw();
    drawHole();
  });
  const boxBefore = await page.evaluate(() => ({
    indy: strokesReceived(['TL', 'NG'], 'TL'),
    box: strokesReceived(['TL', 'AC', 'NG', 'DK'], 'TL'),
    flags: holePlayers.map(p => p.box),
    press: amounts['Box (TL+AC) vs NG+DK'].pressFront
  }));
  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.locator('.pcard').first().locator('button[data-hcp-step="1"]').click();
  const boxAfter = await page.evaluate(() => ({
    indy: strokesReceived(['TL', 'NG'], 'TL'),
    box: strokesReceived(['TL', 'AC', 'NG', 'DK'], 'TL'),
    flags: holePlayers.map(p => p.box),
    press: amounts['Box (TL+AC) vs NG+DK'].pressFront,
    ids: holePlayers.map(p => p.id).join()
  }));
  expect(boxAfter.indy).toBe(boxBefore.indy + 1);
  expect(boxAfter.box).toBe(boxBefore.box + 1);
  expect(boxAfter.flags).toEqual(boxBefore.flags);
  expect(boxAfter.press).toBe(boxBefore.press);
  expect(boxAfter.ids).toBe('TL,AC,NG,DK');
});
