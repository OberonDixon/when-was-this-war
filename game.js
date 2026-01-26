// Game State
const state = {
    currentRound: 0,
    totalRounds: 10,
    score: 0,
    difficulty: 'all',
    mode: 'classic', 
    campaigns: [],
    usedCampaignIds: [],
    currentCampaign: null,
    hintsRevealed: 0,
    roundResults: [],
    // Map State
    yearGuess: null,
    locationGuess: null,
    mapInstance: null,
    guessMarker: null,
    resultMapInstance: null,
    // Command mode two-phase state
    commandPhase: 0,       // 0=both open, 1=one submitted, 2=both done
    firstGuessType: null   // 'year' or 'location'
};

// DOM Elements Container
let elements = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    elements = {
        startScreen: document.getElementById('start-screen'),
        gameScreen: document.getElementById('game-screen'),
        endScreen: document.getElementById('end-screen'),
        
        difficultySelect: document.getElementById('difficulty-select'),
        roundsSelect: document.getElementById('rounds-select'),
        modeSelect: document.getElementById('mode-select'), 
        startBtn: document.getElementById('start-btn'),
        highScoreDisplay: document.getElementById('high-score-display'),
        
        currentRound: document.getElementById('current-round'),
        totalRounds: document.getElementById('total-rounds'),
        currentScore: document.getElementById('current-score'),
        campaignTitle: document.getElementById('campaign-title'),
        campaignDescription: document.getElementById('campaign-description'),
        
        hintBtn: document.getElementById('hint-btn'),
        hintCost: document.getElementById('hint-cost'),
        hintsList: document.getElementById('hints-list'),
        
        // Guess Section
        guessSection: document.getElementById('guess-section'),
        yearPanel: document.getElementById('year-panel'),
        mapPanel: document.getElementById('map-panel'),
        yearInput: document.getElementById('year-input'),
        yearSubmitBtn: document.getElementById('year-submit-btn'),
        mapSubmitBtn: document.getElementById('map-submit-btn'),
        yearFeedback: document.getElementById('year-feedback'),
        mapFeedback: document.getElementById('map-feedback'),
        giveUpBtn: document.getElementById('give-up-btn'),
        skipBtn: document.getElementById('skip-btn'),
        guessMap: document.getElementById('guess-map'),
        
        // Result Section
        resultSection: document.getElementById('result-section'),
        resultDisplay: document.getElementById('result-display'),
        timelineViz: document.getElementById('timeline-viz'),
        resultMap: document.getElementById('result-map'),
        explanation: document.getElementById('explanation'),
        nextBtn: document.getElementById('next-btn'),
        
        finalScore: document.getElementById('final-score'),
        maxScore: document.getElementById('max-score'),
        scoreBreakdown: document.getElementById('score-breakdown'),
        shareBtn: document.getElementById('share-btn'),
        shareFeedback: document.getElementById('share-feedback'),
        playAgainBtn: document.getElementById('play-again-btn')
    };

    if(elements.modeSelect) {
        elements.modeSelect.addEventListener('change', displayHighScore);
    }

    displayHighScore();
    attachEventListeners();
}

function attachEventListeners() {
    elements.startBtn.addEventListener('click', startGame);
    elements.yearSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleYearSubmit();
    });
    elements.mapSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleMapSubmit();
    });
    elements.giveUpBtn.addEventListener('click', giveUp);

    if(elements.skipBtn) {
        elements.skipBtn.addEventListener('click', skipRound);
    }

    elements.hintBtn.addEventListener('click', revealHint);
    elements.nextBtn.addEventListener('click', nextRound);
    elements.shareBtn.addEventListener('click', shareResult);
    elements.playAgainBtn.addEventListener('click', resetGame);

    elements.yearInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleYearSubmit();
    });
}

function showScreen(screen) {
    elements.startScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.endScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

function startGame() {
    state.difficulty = elements.difficultySelect.value;
    state.totalRounds = parseInt(elements.roundsSelect.value);
    state.mode = elements.modeSelect ? elements.modeSelect.value : 'classic';
    
    state.currentRound = 0;
    state.score = 0;
    state.usedCampaignIds = [];
    state.roundResults = [];

    let filteredCampaigns = CAMPAIGNS.filter(c =>
        state.difficulty === 'all' || c.difficulty === state.difficulty
    );

    const seenIds = getSeenCampaigns();
    const unseen = filteredCampaigns.filter(c => !seenIds.includes(c.id));
    const seen = filteredCampaigns.filter(c => seenIds.includes(c.id));

    if (unseen.length === 0 && seen.length > 0) {
        resetSeenCampaigns();
        state.campaigns = shuffleArray([...filteredCampaigns]);
    } else {
        state.campaigns = [...shuffleArray([...unseen]), ...shuffleArray([...seen])];
    }

    showScreen(elements.gameScreen);
    elements.totalRounds.textContent = state.totalRounds;
    
    if (state.mode !== 'date') {
        initGuessMap();
    }
    
    nextRound();
}

function onMapClick(e) {
    if (elements.mapPanel.classList.contains('panel-completed')) return;

    state.locationGuess = e.latlng;

    if (state.guessMarker) {
        state.guessMarker.setLatLng(e.latlng);
    } else {
        state.guessMarker = L.marker(e.latlng).addTo(state.mapInstance);
    }

    elements.mapSubmitBtn.textContent = "Confirm Location";
    elements.mapSubmitBtn.classList.add('primary-action');
    elements.mapSubmitBtn.disabled = false;
}

function initGuessMap() {
    if (typeof L === 'undefined') return;

    if (state.mapInstance) {
        state.mapInstance.remove();
    }

    state.mapInstance = L.map('guess-map').setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '©OpenStreetMap, ©CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.mapInstance);

    state.mapInstance.on('click', onMapClick);
}

// --- NEW FUNCTION: SKIPS CURRENT CARD ---
function skipRound() {
    // 1. Get a replacement
    const replacement = getNextCampaign();
    
    // 2. Handle case where we ran out of campaigns
    if (!replacement) {
        alert("No more historical events available to swap!");
        return;
    }

    // 3. Swap the campaign
    state.currentCampaign = replacement;

    // 4. Reset round state
    state.hintsRevealed = 0;
    state.yearGuess = null;
    state.locationGuess = null;
    state.commandPhase = 0;
    state.firstGuessType = null;

    // 5. Re-render the level (without incrementing round count)
    startLevel();
}

function nextRound() {
    state.currentRound++;
    state.hintsRevealed = 0;
    state.yearGuess = null;
    state.locationGuess = null;
    state.commandPhase = 0;
    state.firstGuessType = null;

    if (state.currentRound > state.totalRounds) {
        endGame();
        return;
    }

    state.currentCampaign = getNextCampaign();
    if (!state.currentCampaign) {
        endGame();
        return;
    }

    startLevel();
}

// --- NEW FUNCTION: Extracted UI logic to reuse in nextRound and skipRound ---
function startLevel() {
    // Wipe previous results
    elements.resultDisplay.innerHTML = '';
    elements.timelineViz.innerHTML = '';
    elements.explanation.innerHTML = '';
    if (state.resultMapInstance) {
        state.resultMapInstance.remove();
        state.resultMapInstance = null;
    }

    // UI Updates
    elements.currentRound.textContent = state.currentRound;
    elements.currentScore.textContent = state.score;
    elements.campaignTitle.textContent = state.currentCampaign.title;
    elements.campaignDescription.innerHTML = state.currentCampaign.description
        .split('\n\n')
        .map(p => `<p>${p}</p>`)
        .join('');

    elements.hintsList.innerHTML = '';
    updateHintButton();

    // Reset Guess Section
    elements.guessSection.classList.remove('hidden');
    elements.resultSection.classList.add('hidden');
    
    // Show the Skip Button
    if(elements.skipBtn) elements.skipBtn.classList.remove('hidden');
    
    // SETUP BASED ON MODE
    setupRoundInputs();

    window.scrollTo({ top: 0, behavior: 'instant' });
}

function setupRoundInputs() {
    // Reset inputs
    elements.yearInput.value = '';
    elements.yearInput.disabled = false;
    state.commandPhase = 0;
    state.firstGuessType = null;

    // Clear previous guess marker
    if (state.guessMarker && state.mapInstance) {
        state.mapInstance.removeLayer(state.guessMarker);
        state.guessMarker = null;
    }

    // Reset feedback areas
    elements.yearFeedback.classList.add('hidden');
    elements.yearFeedback.innerHTML = '';
    elements.mapFeedback.classList.add('hidden');
    elements.mapFeedback.innerHTML = '';

    // Reset panel visual states
    elements.yearPanel.classList.remove('panel-completed', 'panel-emphasized', 'hidden');
    elements.mapPanel.classList.remove('panel-completed', 'panel-emphasized', 'hidden');

    // Reset buttons
    elements.yearSubmitBtn.disabled = false;
    elements.yearSubmitBtn.classList.remove('primary-action');
    elements.yearSubmitBtn.textContent = 'Submit Year';
    elements.mapSubmitBtn.disabled = true;
    elements.mapSubmitBtn.classList.remove('primary-action');
    elements.mapSubmitBtn.textContent = 'Place Pin on Map';

    // Re-enable map clicks (may have been disabled on previous round)
    if (state.mapInstance) {
        state.mapInstance.off('click', onMapClick);
        state.mapInstance.on('click', onMapClick);
    }

    // MODE SPECIFIC UI
    if (state.mode === 'date') {
        // Chronicle: year panel only
        elements.yearPanel.classList.remove('hidden');
        elements.mapPanel.classList.add('hidden');
        elements.guessSection.classList.remove('side-by-side');
        elements.yearSubmitBtn.textContent = 'Submit Date';
        elements.yearInput.focus({ preventScroll: true });

    } else if (state.mode === 'place') {
        // Surveyor: map panel only
        elements.yearPanel.classList.add('hidden');
        elements.mapPanel.classList.remove('hidden');
        elements.guessSection.classList.remove('side-by-side');
        if (state.mapInstance) state.mapInstance.invalidateSize();

    } else {
        // Command: both panels side-by-side
        elements.yearPanel.classList.remove('hidden');
        elements.mapPanel.classList.remove('hidden');
        elements.guessSection.classList.add('side-by-side');
        if (state.mapInstance) {
            setTimeout(() => state.mapInstance.invalidateSize(), 100);
        }
        elements.yearInput.focus({ preventScroll: true });
    }
}

function handleYearSubmit() {
    const input = elements.yearInput.value;
    const guess = parseYearInput(input);
    if (guess === null || guess < -5000 || guess > 2025) {
        flashError(elements.yearInput);
        return;
    }

    // Hide skip button once guessing begins
    if (elements.skipBtn) elements.skipBtn.classList.add('hidden');

    // Lock the year
    state.yearGuess = guess;
    elements.yearInput.disabled = true;
    elements.yearSubmitBtn.disabled = true;
    elements.yearPanel.classList.add('panel-completed');

    if (state.mode === 'date') {
        // Chronicle mode: go straight to results
        processRound();
        return;
    }

    // Command mode
    if (state.commandPhase === 0) {
        // First guess is year
        state.firstGuessType = 'year';
        state.commandPhase = 1;

        const diff = Math.abs(guess - state.currentCampaign.actualYear);
        showYearFeedback(diff);

        // Emphasize the map panel
        elements.mapPanel.classList.add('panel-emphasized');
    } else {
        // Second guess (location was first)
        state.commandPhase = 2;
        processRound();
    }
}

function handleMapSubmit() {
    if (!state.locationGuess) {
        warnMapButton("Click the map first!");
        return;
    }

    // Hide skip button once guessing begins
    if (elements.skipBtn) elements.skipBtn.classList.add('hidden');

    // Lock the map
    elements.mapSubmitBtn.disabled = true;
    elements.mapPanel.classList.add('panel-completed');
    if (state.mapInstance) state.mapInstance.off('click', onMapClick);

    if (state.mode === 'place') {
        // Surveyor mode: go straight to results
        processRound();
        return;
    }

    // Command mode
    if (state.commandPhase === 0) {
        // First guess is location
        state.firstGuessType = 'location';
        state.commandPhase = 1;

        const campaign = state.currentCampaign;
        const distance = getDistanceFromLatLonInKm(
            state.locationGuess.lat, state.locationGuess.lng,
            campaign.latitude, campaign.longitude
        );
        showMapFeedback(distance);

        // Emphasize the year panel
        elements.yearPanel.classList.add('panel-emphasized');
        elements.yearInput.focus({ preventScroll: true });
    } else {
        // Second guess (year was first)
        state.commandPhase = 2;
        processRound();
    }
}

function showYearFeedback(diff) {
    const el = elements.yearFeedback;
    let text, cssClass;

    if (diff === 0) {
        text = "Exact year!";
        cssClass = "feedback-perfect";
    } else if (diff <= 10) {
        text = `${diff} year${diff !== 1 ? 's' : ''} off`;
        cssClass = "feedback-good";
    } else if (diff <= 50) {
        text = `${diff} years off`;
        cssClass = "feedback-okay";
    } else {
        text = `${diff} years off`;
        cssClass = "feedback-miss";
    }

    el.textContent = text;
    el.className = 'guess-feedback ' + cssClass;
    el.classList.remove('hidden');
}

function showMapFeedback(distanceKm) {
    const el = elements.mapFeedback;
    const rounded = Math.round(distanceKm);
    let text, cssClass;

    if (rounded <= 50) {
        text = "Within 50 km!";
        cssClass = "feedback-perfect";
    } else if (rounded <= 300) {
        text = `${rounded} km away`;
        cssClass = "feedback-good";
    } else if (rounded <= 1000) {
        text = `${rounded} km away`;
        cssClass = "feedback-okay";
    } else {
        text = `${rounded} km away`;
        cssClass = "feedback-miss";
    }

    el.textContent = text;
    el.className = 'guess-feedback ' + cssClass;
    el.classList.remove('hidden');
}

function warnMapButton(msg) {
    const btn = elements.mapSubmitBtn;
    const originalText = btn.textContent;
    btn.textContent = msg;
    btn.classList.add('error-pulse');
    setTimeout(() => {
        if (btn.textContent === msg) {
            btn.textContent = originalText;
            btn.classList.remove('error-pulse');
        }
    }, 1500);
}

function processRound() {
    const campaign = state.currentCampaign;
    let yearPoints = 0;
    let mapPoints = 0;
    let distance = null;

    if (state.mode !== 'place' && state.yearGuess !== null) {
        yearPoints = calculateYearScore(state.yearGuess, campaign.actualYear);
    }

    if (state.mode !== 'date' && state.locationGuess !== null && campaign.latitude) {
        distance = getDistanceFromLatLonInKm(
            state.locationGuess.lat, state.locationGuess.lng,
            campaign.latitude, campaign.longitude
        );
        mapPoints = calculateMapScore(distance);
    }

    let hintPenalty = 0;
    for (let i = 0; i < state.hintsRevealed; i++) {
        if (campaign.hints[i]) hintPenalty += campaign.hints[i].cost;
    }

    const rawTotal = yearPoints + mapPoints;
    const finalRoundScore = Math.max(0, rawTotal - hintPenalty);

    state.score += finalRoundScore;
    state.roundResults.push({
        campaign: campaign,
        yearPoints: yearPoints,
        mapPoints: mapPoints,
        totalPoints: finalRoundScore
    });

    elements.currentScore.textContent = state.score;
    displayResult(yearPoints, mapPoints, distance, hintPenalty);
}

function displayResult(yearPoints, mapPoints, distance, hintPenalty) {
    elements.guessSection.classList.add('hidden');
    elements.resultSection.classList.remove('hidden');
    
    // Ensure skip button is hidden in results
    if(elements.skipBtn) elements.skipBtn.classList.add('hidden');

    const actualYear = state.currentCampaign.actualYear;
    const userYear = state.yearGuess !== null ? formatYear(state.yearGuess) : "-";
    const distText = distance !== null ? `${Math.round(distance)} km` : "-";

    const isSingleMode = (state.mode === 'date' || state.mode === 'place');
    const gridClass = isSingleMode ? 'result-grid single-mode' : 'result-grid';

    let gridHTML = `<div class="${gridClass}">`;
    
    if (state.mode !== 'place') {
        gridHTML += `
            <div class="result-card">
                <h4>Year</h4>
                <div class="guess-val">${userYear}</div>
                <div class="actual-val">Actual: ${formatYear(actualYear)}</div>
                <div class="pts-pill ${getScoreClass(yearPoints)}">+${yearPoints} pts</div>
            </div>`;
    }

    if (state.mode !== 'date') {
        gridHTML += `
            <div class="result-card">
                <h4>Location</h4>
                <div class="guess-val">${distText}</div>
                <div class="actual-val">Region check</div>
                <div class="pts-pill ${getScoreClass(mapPoints)}">+${mapPoints} pts</div>
            </div>`;
    }
    
    gridHTML += '</div>';

    let resultHTML = gridHTML;

    if (hintPenalty > 0) {
        resultHTML += `<div class="penalty-text">-${hintPenalty} pts (Hints)</div>`;
    }
    
    resultHTML += `<div class="round-total">Round Total: ${Math.max(0, yearPoints + mapPoints - hintPenalty)}</div>`;

    elements.resultDisplay.innerHTML = resultHTML;

    if (state.mode !== 'place' && state.yearGuess !== null) {
        displayTimeline(state.yearGuess, actualYear);
    } else {
        elements.timelineViz.innerHTML = '';
    }

    if (state.mode !== 'date') {
        elements.resultMap.style.display = 'block'; 
        displayResultMap();
    } else {
        elements.resultMap.style.display = 'none';
    }

    let explanationHTML = `<h3>Historical Context</h3><p>${state.currentCampaign.explanation}</p>`;
    const revealedHints = state.currentCampaign.hints.slice(0, state.hintsRevealed);
    for (const hint of revealedHints) {
        if (hint.explanation) explanationHTML += `<p>${hint.explanation}</p>`;
    }
    elements.explanation.innerHTML = explanationHTML;
}

function displayResultMap() {
    const c = state.currentCampaign;
    if (!c.latitude || typeof L === 'undefined') return;

    if (state.resultMapInstance) state.resultMapInstance.remove();

    state.resultMapInstance = L.map('result-map').setView([c.latitude, c.longitude], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.resultMapInstance);

    const actualIcon = L.divIcon({
        className: 'custom-pin actual-pin',
        html: `<div style="background-color: #2e7d32; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`
    });
    L.marker([c.latitude, c.longitude], {icon: actualIcon}).addTo(state.resultMapInstance)
     .bindPopup("Actual Location").openPopup();

    if (state.locationGuess) {
        const guessIcon = L.divIcon({
            className: 'custom-pin guess-pin',
            html: `<div style="background-color: #c62828; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`
        });
        L.marker([state.locationGuess.lat, state.locationGuess.lng], {icon: guessIcon}).addTo(state.resultMapInstance)
         .bindPopup("Your Guess");

        L.polyline([
            [state.locationGuess.lat, state.locationGuess.lng],
            [c.latitude, c.longitude]
        ], {color: 'blue', dashArray: '5, 10'}).addTo(state.resultMapInstance);
        
        const bounds = L.latLngBounds(
            [state.locationGuess.lat, state.locationGuess.lng],
            [c.latitude, c.longitude]
        );
        state.resultMapInstance.fitBounds(bounds, {padding: [50, 50]});
    }
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) { return deg * (Math.PI / 180); }

function calculateMapScore(distanceKm) {
    if (distanceKm <= 50) return 100;
    const maxDist = 5000;
    if (distanceKm >= maxDist) return 0;
    const scale = 1200;
    const decay = (scale / (scale + distanceKm)) * ((maxDist - distanceKm) / maxDist);
    return Math.floor(20 * decay) * 5;
}

function calculateYearScore(guess, actual) {
    const age = Math.abs(2026 - actual);
    const scale = Math.min(3, Math.max(1, age / 500));
    const diff = Math.abs(guess - actual);
    const minDist = 5 * scale;   // Score 100
    const maxDist = 200 * scale; // Score 0
    if (diff <= minDist) return 100;
    if (diff >= maxDist) return 0;
    const logFraction = Math.log(diff / minDist) / Math.log(maxDist / minDist);
    return Math.floor(20 * Math.pow(1 - logFraction, 0.7)) * 5;
}

function displayTimeline(guess, actual) {
    const minYear = Math.min(guess, actual) - 50;
    const maxYear = Math.max(guess, actual) + 50;
    const range = maxYear - minYear;
    const guessPos = ((guess - minYear) / range) * 100;
    const actualPos = ((actual - minYear) / range) * 100;

    elements.timelineViz.innerHTML = `
        <div class="timeline-bar">
            <div class="timeline-marker actual" style="left: ${actualPos}%"></div>
            <div class="timeline-marker guess" style="left: ${guessPos}%"></div>
        </div>
        <div class="timeline-labels">
            <span>${formatYear(minYear)}</span>
            <span>${formatYear(maxYear)}</span>
        </div>
        <div class="timeline-legend">
            <div class="legend-item"><div class="legend-dot guess"></div><span>Your guess (${formatYear(guess)})</span></div>
            <div class="legend-item"><div class="legend-dot actual"></div><span>Actual (${formatYear(actual)})</span></div>
        </div>
    `;
}

function flashError(element) {
    element.style.borderColor = '#c62828';
    setTimeout(() => { element.style.borderColor = ''; }, 1000);
}

function giveUp() {
    if (state.mode === 'classic' && state.commandPhase === 1) {
        // Keep the first guess, null out the second
        if (state.firstGuessType === 'year') {
            state.locationGuess = null;
        } else {
            state.yearGuess = null;
        }
    } else {
        state.yearGuess = null;
        state.locationGuess = null;
    }
    processRound();
}

function revealHint() {
    const hints = state.currentCampaign.hints;
    if (state.hintsRevealed >= hints.length) return;
    const hint = hints[state.hintsRevealed];
    state.hintsRevealed++;
    const hintEl = document.createElement('div');
    hintEl.className = 'hint-item';
    hintEl.textContent = hint.text;
    elements.hintsList.appendChild(hintEl);
    updateHintButton();
}

function updateHintButton() {
    const hints = state.currentCampaign.hints;
    if (state.hintsRevealed >= hints.length) {
        elements.hintBtn.disabled = true;
        elements.hintBtn.textContent = 'No more hints';
    } else {
        elements.hintBtn.disabled = false;
        elements.hintCost.textContent = hints[state.hintsRevealed].cost;
        elements.hintBtn.innerHTML = `Buy Hint (<span id="hint-cost">${hints[state.hintsRevealed].cost}</span> pts)`;
    }
}

function getNextCampaign() {
    for (const campaign of state.campaigns) {
        if (!state.usedCampaignIds.includes(campaign.id)) {
            state.usedCampaignIds.push(campaign.id);
            markCampaignSeen(campaign.id);
            return campaign;
        }
    }
    return null;
}

function parseYearInput(input) {
    const trimmed = input.trim().toLowerCase();
    const decadeMatch = trimmed.match(/^(\d{3,4})s$/);
    if (decadeMatch) return parseInt(decadeMatch[1]) + 5;
    const bceMatch = trimmed.match(/^(\d{1,4})\s*(?:bce|bc|b\.c\.e\.?|b\.c\.?)$/);
    if (bceMatch) return -parseInt(bceMatch[1]);
    const negativeMatch = trimmed.match(/^-(\d{1,4})$/);
    if (negativeMatch) return -parseInt(negativeMatch[1]);
    const yearMatch = trimmed.match(/^(\d{3,4})$/);
    if (yearMatch) return parseInt(yearMatch[1]);
    return null;
}

function getScoreClass(pts) {
    if (pts >= 90) return 'perfect';
    if (pts >= 60) return 'good';
    if (pts >= 30) return 'okay';
    return 'miss';
}

function endGame() {
    showScreen(elements.endScreen);
    
    let ptsPerRound = (state.mode === 'classic') ? 200 : 100;
    const maxPossible = state.roundResults.length * ptsPerRound;
    
    elements.finalScore.textContent = state.score;
    elements.maxScore.textContent = maxPossible;
    let breakdownHTML = '';
    for (const result of state.roundResults) {
        const title = result.campaign.title.length > 30 ? result.campaign.title.substring(0, 30) + '...' : result.campaign.title;
        breakdownHTML += `
            <div class="breakdown-item">
                <span class="campaign">${title}</span>
                <span class="points">${result.totalPoints} pts</span>
            </div>
        `;
    }
    elements.scoreBreakdown.innerHTML = breakdownHTML;
    saveHighScore(state.score, maxPossible);
}

function saveHighScore(score, maxPossible) {
    const key = `highscore_${state.difficulty}_${state.totalRounds}_${state.mode}`;
    const existing = localStorage.getItem(key);
    if (!existing || score > parseInt(existing)) localStorage.setItem(key, score);
    displayHighScore();
}

function displayHighScore() {
    if (!elements.difficultySelect) return;
    const difficulty = elements.difficultySelect.value;
    const rounds = elements.roundsSelect.value;
    const mode = elements.modeSelect ? elements.modeSelect.value : 'classic';
    const key = `highscore_${difficulty}_${rounds}_${mode}`;
    const score = localStorage.getItem(key);
    
    let ptsPerRound = (mode === 'classic') ? 200 : 100;
    
    if (score) elements.highScoreDisplay.textContent = `High score: ${score}/${rounds * ptsPerRound}`;
    else elements.highScoreDisplay.textContent = '';
}

function shareResult() {
    let ptsPerRound = (state.mode === 'classic') ? 200 : 100;
    const maxPossible = state.roundResults.length * ptsPerRound;
    const percent = Math.round((state.score / maxPossible) * 100);
    const text = `I scored ${state.score}/${maxPossible} (${percent}%) on When Was This War?`;
    navigator.clipboard.writeText(text).then(() => {
        elements.shareFeedback.textContent = 'Copied!';
        setTimeout(() => { elements.shareFeedback.textContent = ''; }, 2000);
    });
}

function resetGame() {
    showScreen(elements.startScreen);
    displayHighScore();
}

function formatYear(year) {
    return year < 0 ? `${Math.abs(year)} BCE` : year.toString();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const SEEN_CAMPAIGNS_KEY = 'seen_campaigns';
function getSeenCampaigns() {
    const stored = localStorage.getItem(SEEN_CAMPAIGNS_KEY);
    return stored ? JSON.parse(stored) : [];
}
function markCampaignSeen(id) {
    const seen = getSeenCampaigns();
    if (!seen.includes(id)) {
        seen.push(id);
        localStorage.setItem(SEEN_CAMPAIGNS_KEY, JSON.stringify(seen));
    }
}
function resetSeenCampaigns() { localStorage.removeItem(SEEN_CAMPAIGNS_KEY); }