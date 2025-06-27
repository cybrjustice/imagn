// --- Melody Auth Logic with Piano Sound and Improvements ---
const KEYBOARD = "QWERTYUIOP[]\\"; // 2 octaves, white keys only
const NOTES = [
  "C4","D4","E4","F4","G4","A4","B4", // QWERTYUI
  "C5","D5","E5","F5","G5","A5","B5"  // OP[]\
];
const KEY_TO_NOTE = Object.fromEntries(KEYBOARD.split('').map((key,i)=>[key,NOTES[i]]));

let melodyLength = 4; // fallback until fetched
let playedNotes = [];

const $ = sel => document.querySelector(sel);

// --- Prompt Helper Definitions ---
const PROMPT_HELPERS = {
  blueprint: [
    "A detailed floor plan of a futuristic house",
    "Mechanical schematic of a flying car",
    "Blueprint of a steampunk airship"
  ],
  artwork: [
    "A serene landscape with mountains at sunset",
    "Surreal portrait of a person made of flowers",
    "Cyberpunk city skyline at night"
  ],
  tattoo: [
    "Minimalist line drawing of a wolf",
    "Traditional Japanese koi fish",
    "Geometric mandala with fine lines"
  ]
};

function showPromptHelpers() {
  const type = $('#type').value;
  const helpers = PROMPT_HELPERS[type] || [];
  const container = $('#prompt-helpers');
  container.innerHTML = helpers.map(h =>
    `<button type="button" class="helper-btn">${h}</button>`
  ).join('');
  // Add click listeners to insert the helper into the input
  document.querySelectorAll('.helper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#prompt').value = btn.textContent;
    });
  });
}

// --- Piano Sound Setup ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const NOTE_FREQS = (() => {
  // Calculate frequencies for C4 (MIDI 60) to B5 (MIDI 83)
  const baseMidi = 60, baseFreq = 261.63;
  let out = {};
  NOTES.forEach((note, i) => {
    const midi = baseMidi + i;
    out[note] = 440 * Math.pow(2, (midi - 69) / 12);
  });
  return out;
})();
function playNote(note, duration = 0.22, velocity = 0.7) {
  const freq = NOTE_FREQS[note];
  if (!freq) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  gain.gain.value = velocity * 1.4; // Louder
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function renderPiano() {
  const piano = $('#piano');
  piano.innerHTML = "";
  KEYBOARD.split('').forEach((key, i) => {
    const note = NOTES[i];
    const el = document.createElement('div');
    el.className = 'piano-key';
    el.dataset.key = key;
    el.dataset.note = note;
    el.tabIndex = 0;
    el.textContent = key;
    el.title = note;
    el.addEventListener('mousedown', () => handleKey(note, key, el, true));
    el.addEventListener('keydown', e => {
      if (e.key === "Enter" || e.key === " ") handleKey(note, key, el, true);
    });
    piano.appendChild(el);
  });
}

function handleKey(note, key, el, withSound = false) {
  if (playedNotes.length >= melodyLength) return;
  playedNotes.push(note);
  el.classList.add('active');
  setTimeout(()=>el.classList.remove('active'), 120);
  if (withSound) playNote(note);
  updateNotesInput();
  if (playedNotes.length >= melodyLength) {
    $('#auth-submit').disabled = false;
  }
}

function updateNotesInput() {
  $('#notes-input').textContent = playedNotes.join(' - ');
  $('#auth-status').textContent = '';
  $('#auth-submit').disabled = playedNotes.length < melodyLength;
}

function resetMelody() {
  playedNotes = [];
  updateNotesInput();
}

document.addEventListener('keydown', e => {
  // Ignore if in input/textarea
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

  if (e.key === "Backspace") {
    if (playedNotes.length > 0) {
      playedNotes.pop();
      updateNotesInput();
    }
    e.preventDefault();
    return;
  }

  const key = e.key.length === 1 ? e.key.toUpperCase() : '';
  const note = KEY_TO_NOTE[key];
  if (note && playedNotes.length < melodyLength) {
    const el = Array.from(document.querySelectorAll('.piano-key')).find(k=>k.dataset.note===note);
    if (el) {
      playNote(note);
      handleKey(note, key, el, false);
    }
  }
});

// --- API URLs (adjust if deploying elsewhere) ---
const API_BASE = "https://imagen.ai-n.workers.dev";

// --- Melody Auth API ---
async function fetchMelodyChallenge() {
  try {
    const res = await fetch(`${API_BASE}/auth/challenge`);
    if (!res.ok) return;
    const data = await res.json();
    melodyLength = data.melody || 4;
  } catch {}
}

async function submitMelody() {
  $('#auth-submit').disabled = true;
  $('#auth-status').textContent = "Checking...";
  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt: playedNotes })
    });
    const data = await res.json();
    if (data.success) {
      $('#auth-status').textContent = "✔️ Melody correct! Unlocked.";
      setTimeout(() => {
        $('#auth-section').style.display = 'none';
        $('#gen-section').style.display = '';
      }, 600);
    } else {
      $('#auth-status').textContent = "❌ Incorrect melody. Try again.";
      resetMelody();
    }
  } catch {
    $('#auth-status').textContent = "Error contacting server.";
    resetMelody();
  }
  $('#auth-submit').disabled = false;
}

// --- Image Generation Logic ---
let lastImageUrl = null;
let lastBlob = null;

$('#gen-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#gen-status').textContent = "Generating...";
  $('#result-img').style.display = 'none';
  $('#result-container').style.display = 'none';
  $('#gen-submit').disabled = true;

  const type = $('#type').value;
  const prompt = $('#prompt').value;
  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, prompt })
    });
    if (!res.ok) throw new Error("Generation failed");
    const blob = await res.blob();
    lastBlob = blob;
    const url = URL.createObjectURL(blob);
    lastImageUrl = url;
    $('#result-img').src = url;
    $('#result-img').style.display = 'block';
    $('#result-container').style.display = '';
    $('#gen-status').textContent = "Done!";
  } catch (err) {
    $('#gen-status').textContent = "Error: " + err.message;
  }
  $('#gen-submit').disabled = false;
});

// --- Download Button Logic ---
$('#download-btn').addEventListener('click', () => {
  if (!lastBlob) return;
  const a = document.createElement('a');
  a.href = lastImageUrl;
  a.download = 'generated-image.png';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
});

// --- Revise Button Logic ---
$('#revise-btn').addEventListener('click', () => {
  $('#result-container').style.display = 'none';
  $('#result-img').src = '';
  $('#gen-status').textContent = '';
  $('#gen-form').reset();
  showPromptHelpers();
  $('#prompt').focus();
});

// --- Add Clear Button Logic ---
$('#auth-clear').addEventListener('click', () => {
  resetMelody();
});

// --- Init ---
renderPiano();
fetchMelodyChallenge();
$('#type').addEventListener('change', showPromptHelpers);
showPromptHelpers();
$('#auth-submit').addEventListener('click', submitMelody);
$('#notes-input').addEventListener('click', resetMelody);
updateNotesInput();
