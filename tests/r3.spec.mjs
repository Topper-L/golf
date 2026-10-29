import { test, expect } from '@playwright/test';
import fs from 'fs';

const shotDir = '/workspace/2026-10-29-build';
const artDir = '/opt/cursor/artifacts';
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(artDir, { recursive: true });

async function shot(page, name) {
  const file = name + '.png';
  await page.screenshot({ path: shotDir + '/' + file });
  await page.screenshot({ path: artDir + '/' + file });
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
  await twoPlayer(page, { tlHcp: '+2', nsHcp: '14', hole: 7, tl: { 7: 5 }, ns: { 7: 5 }, screen: 'score' });
  await expect(page.locator('#holeTitle')).toContainText('SI 11');
  await expect(page.locator('.sname').first()).toContainText('HCP +2');
  await expect(page.locator('.sname').nth(1)).toContainText('HCP 14');
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
  await expect(page.locator('.b-primary').first()).toContainText('Thru');
  const primarySize = await page.locator('.b-primary').first().evaluate(el => getComputedStyle(el).fontSize);
  await page.locator('#fontUp').click();
  const bigger = await page.locator('.b-primary').first().evaluate(el => getComputedStyle(el).fontSize);
  expect(parseFloat(bigger)).toBeGreaterThan(parseFloat(primarySize));
  await page.locator('#fontDown').click();
  await page.locator('.junkbtn').first().click();
  await expect(page.locator('#junkSheet')).toBeVisible();
  await expect(page.locator('#junkSheetTitle')).toContainText('TL');
  await expect(page.locator('#junkSheet')).toContainText('Birdie/Eagle auto from gross score');
  const chip = page.locator('button[data-sheet-type="chip"]');
  const sandy = page.locator('button[data-sheet-type="sandy"]');
  await expect(chip).toBeEnabled();
  await sandy.click();
  await chip.click();
  await expect(sandy).toHaveClass(/on/);
  await expect(chip).toHaveClass(/on/);
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
  expect(headers).toContain('Orig');
  expect(headers).toContain('P1');
  expect(headers).toContain('P2');
  expect(headers.some(t => /^P\d{2}$/.test(t.trim()) || /^P[3-9]$/.test(t.trim()))).toBeFalsy();
  await expect(page.locator('#cardStanding .pstart').nth(0)).toHaveText('P1');
  await expect(page.locator('#cardStanding .pstart').nth(1)).toHaveText('P2');
  await shot(page, 'press-rows');
  await page.getByRole('button', { name: 'Score', exact: true }).click();
  await expect(page.locator('.banner.dn, .banner.up, .banner.as').first()).toBeVisible();
  await expect(page.locator('.b-primary').first()).toContainText(/up|dn|AS/);
  await expect(page.locator('.b-sub').first()).toContainText('Press from');
  await shot(page, 'banner-press');
});

test('banner colors for up, down, and all square', async ({ page }) => {
  await twoPlayer(page, { tl: { 0: 3 }, ns: { 0: 5 }, junk: 0, first: 10, second: 0, overall: 0 });
  await expect(page.locator('.banner')).toHaveClass(/up/);
  await expect(page.locator('.b-primary')).toContainText('1 up');
  await expect(page.locator('.b-primary')).toContainText('Thru');
  await shot(page, 'banner-up');
  await twoPlayer(page, { tl: { 0: 6 }, ns: { 0: 4 }, junk: 0, first: 10, second: 0, overall: 0 });
  await expect(page.locator('.banner')).toHaveClass(/dn/);
  await expect(page.locator('.b-primary')).toContainText('1 dn');
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
