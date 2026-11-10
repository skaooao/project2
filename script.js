'use strict';

/* THE LOVE LABORATORY — script.js
   Works with the index.html supplied in this conversation.
   API availability and CORS depend on the providers.
*/

const CONFIG = {
  // Set to your own proxy endpoint that securely attaches X-API-Key.
  // Do not put a private Feng Shui API key in public GitHub Pages JavaScript.
lunarDataUrl: 'https://raw.githubusercontent.com/hungtcs/traditional-chinese-calendar-database/master/database/json/',
  loveUrl: 'https://calculator.free/api/v1/love/',// Unverified: edit after testing provider docs
  tarotUrl: 'https://tarotapi.dev/api/v1/cards/random?n=1',
  adviceUrl: 'https://api.adviceslip.com/advice',
  timeoutMs: 9000
};

const $ = id => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const setText = (id, text) => { if ($(id)) $(id).textContent = text; };
const state = { results: null, tarotRevealed: false, run: 0 };

function dateToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Enter valid birth dates.');
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > new Date()) {
    throw Error('Birth dates must be valid and cannot be in the future.');
  }
  return value;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function getNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*%?\s*$/.test(value)) return Number.parseFloat(value);
  }
  return null;
}

// This provider's exact endpoint and response shape must be verified.
// If it cannot be reached from the browser, the card reports unavailable.
async function getNameCompatibility(name1, name2) {
  const url = new URL(CONFIG.loveUrl);
  url.searchParams.set('name1', name1);
  url.searchParams.set('name2', name2);
  const json = await fetchJson(url.toString());
const score = getNumber(
  json.results?.percentage,
  json.results?.score,
  json.percentage,
  json.score,
  json.result?.percentage,
  json.result?.score
);
  if (score === null || score < 0 || score > 100) throw Error('Unrecognised love API response');
  return { score: Math.round(score), description: String(json.message ?? json.result?.message ?? 'Name compatibility analysis complete.').slice(0, 250) };
}

async function getZodiacCompatibility(date1, date2) {
  const birthdays = [date1, date2].map(date => date.split('-').map(Number));
  const years = [...new Set(birthdays.map(([year]) => year))];

  if (years.some(year => year < 1901 || year > 2100)) {
    throw Error('The lunar calendar dataset covers 1901–2100.');
  }

  const calendars = await Promise.all(
    years.map(year => fetchJson(`${CONFIG.lunarDataUrl}${year}.json`))
  );

  const animals = '鼠牛虎兔龍蛇馬羊猴雞狗豬';
  const english = [
    'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
    'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'
  ];

  const [first, second] = birthdays.map(([year, month, date]) => {
    const entry = calendars[years.indexOf(year)].find(({ gregorian }) =>
      gregorian.year === year &&
      gregorian.month === month &&
      gregorian.date === date
    );

  const zodiac = entry?.zodiac?.replace(/[龙马鸡猪犬]/g, animal => ({
   龙: '龍', 马: '馬', 鸡: '雞', 猪: '豬', 犬: '狗'
   })[animal]);

    const index = zodiac?.length === 1 ? animals.indexOf(zodiac) : -1;
    if (index < 0) throw Error('Zodiac animal not found in the dataset.');
    return index;
  });

  // Project-defined entertainment score.
  const distance = Math.abs(first - second);
  let score = 2;
  if (distance === 6) score = 1;
  else if (distance === 0) score = 3;
  else if (distance === 4 || distance === 8) score = 4;

  return {
    score,
    animal1: english[first],
    animal2: english[second],
    description: 'Zodiac signs from lunar calendar data. Compatibility score calculated by The Love Laboratory for fun.'
  };
}

async function getTarotCard() {
  const json = await fetchJson(CONFIG.tarotUrl);
  const card = Array.isArray(json.cards) ? json.cards[0] : Array.isArray(json) ? json[0] : null;
  if (!card?.name) throw Error('Unrecognised tarot API response');
  return {
    name: String(card.name),
    meaning: String(card.meaning_up ?? card.desc ?? 'The cards invite reflection.').slice(0, 400)
  };
}

async function getAdvice() {
  // Timestamp query avoids cached repeated advice on some browsers.
  const url = `${CONFIG.adviceUrl}?t=${Date.now()}`;
  const json = await fetchJson(url);
  const advice = json.slip?.advice;
  if (typeof advice !== 'string' || !advice.trim()) throw Error('Unrecognised advice response');
  return advice;
}

function settle(promise) {
  return promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
}

function classification(score) {
  if (score >= 85) return ['CERTIFIED SOULMATES', 'The laboratory recommends immediate celebration. Our lawyers recommend caution.'];
  if (score >= 65) return ['HIGHLY REACTIVE CHEMISTRY', 'A promising match, subject to unpredictable emotional reactions.'];
  if (score >= 40) return ['EXPERIMENTALLY INCONCLUSIVE', 'Some romantic potential detected. Additional field research is recommended.'];
  return ['ROMANTIC HAZARD DETECTED', 'The readings suggest caution. Please do not make life decisions based on this website.'];
}

function renderResults(data) {
  const { name, zodiac, tarot, advice } = data;
  const scores = [];
  if (name.ok) scores.push(name.value.score);
  if (zodiac.ok) scores.push(Math.round(zodiac.value.score / 4 * 100));
  const overall = scores.length ? Math.round(scores.reduce((a,b) => a+b,0)/scores.length) : null;
  const disagreement = scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null;

  setText('name-score', name.ok ? name.value.score : 'N/A');
  setText('name-description', name.ok ? name.value.description : 'Name chemistry unavailable: API connection or response could not be verified.');
  if ($('name-meter')) $('name-meter').style.width = name.ok ? `${name.value.score}%` : '0%';

  setText('zodiac-score', zodiac.ok ? `${zodiac.value.score}/4` : 'N/A');
  setText('zodiac-animal1', zodiac.ok ? zodiac.value.animal1 : '?');
  setText('zodiac-animal2', zodiac.ok ? zodiac.value.animal2 : '?');
  setText(
  'zodiac-description',
  zodiac.ok ? zodiac.value.description : `Cosmic alignment unavailable: ${zodiac.error.message}`
);

  setText('tarot-name', tarot.ok ? tarot.value.name : 'UNAVAILABLE');
  setText('tarot-description', tarot.ok ? 'Your card is ready. Reveal it when you dare.' : 'Tarot service unavailable.');
  setText('tarot-symbol', '✦');
  $('reveal-tarot-btn').disabled = !tarot.ok;
  $('tarot-card').classList.remove('flipped');
  state.tarotRevealed = false;

  setText('advice-text', advice.ok ? advice.value : 'The advice department is currently unavailable.');
  setText('final-score', overall === null ? 'N/A' : overall);
  setText('uncertainty-value', disagreement === null ? 'N/A' : `${disagreement}%`);
  const [title, description] = overall === null
    ? ['RESULTS INCONCLUSIVE', 'Neither scoring service returned a valid result. Tarot and advice may still be available.']
    : classification(overall);
  setText('verdict-title', title);
  setText('verdict-description', description);
  setText('report-title', `RELATIONSHIP STATUS: ${title}`);
  setText('report-description', overall === null
    ? 'The laboratory cannot issue a compatibility classification without a verified scoring API.'
    : `Final classification based on ${scores.length} available compatibility assessment${scores.length === 1 ? '' : 's'}. Tarot and advice are entertainment-only extras and do not affect the score.`);

  document.body.dataset.compatibility = overall === null ? 'unknown' : overall >= 65 ? 'high' : overall >= 40 ? 'medium' : 'low';
  document.documentElement.style.setProperty('--compatibility-score', overall === null ? '0' : String(overall));
  document.documentElement.style.setProperty('--compatibility-hue', overall === null ? '330' : String(Math.round(350 - overall * 0.25)));
  document.documentElement.style.setProperty('--particle-intensity', overall === null ? '0' : String(Math.round(overall / 10)));
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function runExperiment(event) {
  event.preventDefault();
  const runId = ++state.run;
  const button = $('calculate-btn');
  let name1, name2, date1, date2;
  try {
    name1 = $('name1').value.trim();
    name2 = $('name2').value.trim();
    date1 = dateToIso($('birth1').value);
    date2 = dateToIso($('birth2').value);
    if (!name1 || !name2) throw Error('Enter both names.');
  } catch (error) {
    alert(error.message);
    return;
  }

  button.disabled = true;
  $('results').hidden = true;
  $('loading-section').hidden = false;
  setText('loading-message', 'Consulting the departments of questionable science…');
  if ($('loading-progress')) $('loading-progress').style.width = '35%';
  setText('couple-names', `${name1} + ${name2}`);

  const [name, zodiac, tarot, advice] = await Promise.all([
    settle(getNameCompatibility(name1, name2)),
    settle(getZodiacCompatibility(date1, date2)),
    settle(getTarotCard()),
    settle(getAdvice())
  ]);
  if (runId !== state.run) return;
  state.results = { name, zodiac, tarot, advice };
  if ($('loading-progress')) $('loading-progress').style.width = '100%';
  $('loading-section').hidden = true;
  button.disabled = false;
  renderResults(state.results);
  console.info('Experiment status:', Object.fromEntries(Object.entries(state.results).map(([key, value]) => [key, value.ok ? 'success' : String(value.error)])));
}

function revealTarot() {
  const result = state.results?.tarot;
  if (!result?.ok) return;
  state.tarotRevealed = !state.tarotRevealed;
  $('tarot-card').classList.toggle('flipped', state.tarotRevealed);
  setText('tarot-description', state.tarotRevealed ? result.value.meaning : 'Your romantic fate remains concealed.');
  setText('reveal-tarot-btn', state.tarotRevealed ? 'CONCEAL YOUR CARD' : 'REVEAL YOUR CARD');
}

async function refreshAdvice() {
  const button = $('new-advice-btn');
  button.disabled = true;
  setText('advice-text', 'Consulting the advisory department…');
  try {
    const advice = await getAdvice();
    if (state.results) state.results.advice = { ok: true, value: advice };
    setText('advice-text', advice);
  } catch (error) {
    setText('advice-text', 'The advisory department could not be reached. Please try again.');
  } finally {
    button.disabled = false;
  }
}

function restart() {
  state.run++;
  state.results = null;
  state.tarotRevealed = false;
  $('results').hidden = true;
  $('loading-section').hidden = true;
  $('calculate-btn').disabled = false;
  $('love-form').reset();
  $('experiment').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.addEventListener('DOMContentLoaded', () => {
  $('love-form').addEventListener('submit', runExperiment);
  $('reveal-tarot-btn').addEventListener('click', revealTarot);
  $('new-advice-btn').addEventListener('click', refreshAdvice);
  $('restart-btn').addEventListener('click', restart);
  for (const id of ['birth1', 'birth2']) $(id).max = new Date().toISOString().slice(0, 10);
});
