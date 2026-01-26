// Game State
const state = {
    currentRound: 0,
    totalRounds: 10,
    score: 0,
    difficulty: 'all',
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
    resultMapInstance: null
};

// DOM Elements Container
let elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Populate DOM elements safely after load
    elements = {
        startScreen: document.getElementById('start-screen'),
        gameScreen: document.getElementById('game-screen'),
        endScreen: document.getElementById('end-screen'),
        
        difficultySelect: document.getElementById('difficulty-select'),
        roundsSelect: document.getElementById('rounds-select'),
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
        
        yearInput: document.getElementById('year-input'),
        submitBtn: document.getElementById('submit-btn'),
        giveUpBtn: document.getElementById('give-up-btn'),
        
        guessSection: document.getElementById('guess-section'),
        guessMap: document.getElementById('guess-map'),
        
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

    displayHighScore();
    attachEventListeners();
}

function attachEventListeners() {
    elements.startBtn.addEventListener('click', startGame);
    elements.submitBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent any weird form submission defaults
        handlePhaseSubmit();
    });
    elements.giveUpBtn.addEventListener('click', giveUp);
    elements.hintBtn.addEventListener('click', revealHint);
    elements.nextBtn.addEventListener('click', nextRound);
    elements.shareBtn.addEventListener('click', shareResult);
    elements.playAgainBtn.addEventListener('click', resetGame);

    elements.yearInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handlePhaseSubmit();
    });
}

function showScreen(screen) {
    elements.startScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.endScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}

// Game Flow
function startGame() {
    state.difficulty = elements.difficultySelect.value;
    state.totalRounds = parseInt(elements.roundsSelect.value);
    state.currentRound = 0;
    state.score = 0;
    state.usedCampaignIds = [];
    state.roundResults = [];

    // Filter campaigns by difficulty
    let filteredCampaigns = CAMPAIGNS.filter(c =>
        state.difficulty === 'all' || c.difficulty === state.difficulty
    );

    // Get previously seen campaigns
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
    
    // Initialize Map
    initGuessMap();
    
    nextRound();
}

function initGuessMap() {
    if (typeof L === 'undefined') return;

    // Reset map container if needed
    if (state.mapInstance) {
        state.mapInstance.remove();
    }

    state.mapInstance = L.map('guess-map').setView([20, 0], 2);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '©OpenStreetMap, ©CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.mapInstance);

    // Map Click Listener
    state.mapInstance.on('click', function(e) {
        state.locationGuess = e.latlng;
        
        if (state.guessMarker) {
            state.guessMarker.setLatLng(e.latlng);
        } else {
            state.guessMarker = L.marker(e.latlng).addTo(state.mapInstance);
        }
        
        // Update button state immediately on click
        elements.submitBtn.textContent = "Confirm Location";
        elements.submitBtn.classList.add('primary-action');
        elements.submitBtn.disabled = false;
    });
}

function nextRound() {
    state.currentRound++;
    state.hintsRevealed = 0;
    state.yearGuess = null;
    state.locationGuess = null;

    if (state.currentRound > state.totalRounds) {
        endGame();
        return;
    }

    state.currentCampaign = getNextCampaign();
    if (!state.currentCampaign) {
        endGame();
        return;
    }

    // === CHANGE STARTS HERE: Wipe previous results ===
    elements.resultDisplay.innerHTML = '';
    elements.timelineViz.innerHTML = '';
    elements.explanation.innerHTML = '';
    if (state.resultMapInstance) {
        state.resultMapInstance.remove();
        state.resultMapInstance = null;
    }
    // === CHANGE ENDS HERE ===

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
    
    // Reset Year Input
    elements.yearInput.value = '';
    elements.yearInput.disabled = false;
    elements.yearInput.classList.remove('hidden');
    
    // Reset Map
    elements.guessMap.classList.add('hidden');
    if (state.guessMarker && state.mapInstance) {
        state.mapInstance.removeLayer(state.guessMarker);
        state.guessMarker = null;
    }
    // Re-invalidate map size to prevent gray tiles on hidden re-show
    if (state.mapInstance) state.mapInstance.invalidateSize();

    // Reset Button
    elements.submitBtn.textContent = "Next: Guess Location";
    elements.submitBtn.classList.remove('primary-action');
    elements.submitBtn.disabled = false;

    // Scroll top
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function handlePhaseSubmit() {
    // Phase 1: Year Guess
    if (state.yearGuess === null) {
        const input = elements.yearInput.value;
        const guess = parseYearInput(input);

        if (guess === null || guess < -5000 || guess > 2025) {
            flashError(elements.yearInput);
            return;
        }

        // Lock Year, Transition to Map
        state.yearGuess = guess;
        elements.yearInput.disabled = true;
        
        elements.guessMap.classList.remove('hidden');
        if (state.mapInstance) state.mapInstance.invalidateSize();
        
        elements.submitBtn.textContent = "Place Pin on Map";
        // Do NOT disable button, just prompt user if they click it again
        
    } else {
        // Phase 2: Location Guess
        if (!state.locationGuess) {
            // User hasn't clicked map yet
            elements.submitBtn.textContent = "Please Click Map First!";
            setTimeout(() => {
                if(state.locationGuess) return;
                elements.submitBtn.textContent = "Place Pin on Map";
            }, 1500);
            return;
        }
        processRound();
    }
}

function processRound() {
    const campaign = state.currentCampaign;
    
    // 1. Year Score
    let yearPoints = 0;
    if (state.yearGuess !== null) {
        yearPoints = calculateScore(state.yearGuess, campaign.actualYear);
    }

    // 2. Map Score
    let mapPoints = 0;
    let distance = null;
    
    if (state.locationGuess !== null && campaign.latitude) {
        distance = getDistanceFromLatLonInKm(
            state.locationGuess.lat, state.locationGuess.lng,
            campaign.latitude, campaign.longitude
        );
        mapPoints = calculateMapScore(distance);
    }

    // 3. Hint Penalty
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

    const actualYear = state.currentCampaign.actualYear;
    const userYear = state.yearGuess !== null ? formatYear(state.yearGuess) : "Given up";
    const distText = distance !== null ? `${Math.round(distance)} km` : "No guess";

    let resultHTML = `
        <div class="result-grid">
            <div class="result-card">
                <h4>Year</h4>
                <div class="guess-val">${userYear}</div>
                <div class="actual-val">Actual: ${formatYear(actualYear)}</div>
                <div class="pts-pill ${getScoreClass(yearPoints)}">+${yearPoints} pts</div>
            </div>
            <div class="result-card">
                <h4>Location</h4>
                <div class="guess-val">${distText}</div>
                <div class="actual-val">Region check</div>
                <div class="pts-pill ${getScoreClass(mapPoints)}">+${mapPoints} pts</div>
            </div>
        </div>
    `;

    if (hintPenalty > 0) {
        resultHTML += `<div class="penalty-text">-${hintPenalty} pts (Hints)</div>`;
    }
    
    resultHTML += `<div class="round-total">Round Total: ${Math.max(0, yearPoints + mapPoints - hintPenalty)}</div>`;

    elements.resultDisplay.innerHTML = resultHTML;

    // Timeline Viz
    if (state.yearGuess !== null) {
        displayTimeline(state.yearGuess, actualYear);
    } else {
        elements.timelineViz.innerHTML = '';
    }

    displayResultMap();

    // Explanations
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

    // Actual Location
    const actualIcon = L.divIcon({
        className: 'custom-pin actual-pin',
        html: `<div style="background-color: #2e7d32; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`
    });
    L.marker([c.latitude, c.longitude], {icon: actualIcon}).addTo(state.resultMapInstance)
     .bindPopup("Actual Location").openPopup();

    // User Guess
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
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) { return deg * (Math.PI / 180); }

function calculateMapScore(distanceKm) {
    if (distanceKm < 50) return 100;
    if (distanceKm < 200) return 90;
    if (distanceKm < 500) return 75;
    if (distanceKm < 1000) return 50;
    if (distanceKm < 2000) return 25;
    return 0;
}

function calculateScore(guess, actual) {
    const diff = Math.abs(guess - actual);
    const age = 2026 - actual;
    const scale = Math.min(3, Math.max(1, age / 500));

    if (diff <= 5 * scale) return 100;
    if (diff <= 10 * scale) return 90;
    if (diff <= 25 * scale) return 75;
    if (diff <= 50 * scale) return 60;
    if (diff <= 100 * scale) return 40;
    if (diff <= 200 * scale) return 20;
    return 0;
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
    state.yearGuess = null;
    state.locationGuess = null;
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
    const maxPossible = state.roundResults.length * 200;
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
    const key = `highscore_${state.difficulty}_${state.totalRounds}`;
    const existing = localStorage.getItem(key);
    if (!existing || score > parseInt(existing)) localStorage.setItem(key, score);
    displayHighScore();
}

function displayHighScore() {
    if (!elements.difficultySelect) return;
    const difficulty = elements.difficultySelect.value;
    const rounds = elements.roundsSelect.value;
    const key = `highscore_${difficulty}_${rounds}`;
    const score = localStorage.getItem(key);
    if (score) elements.highScoreDisplay.textContent = `High score: ${score}/${rounds * 200}`;
    else elements.highScoreDisplay.textContent = '';
}

function shareResult() {
    const maxPossible = state.roundResults.length * 200;
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