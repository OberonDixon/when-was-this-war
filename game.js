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
    // New State for Map
    yearGuess: null,
    locationGuess: null, // { lat: 0, lng: 0 }
    mapInstance: null,
    guessMarker: null,
    resultMapInstance: null
};

// DOM Elements
const elements = {
    // Screens
    startScreen: document.getElementById('start-screen'),
    gameScreen: document.getElementById('game-screen'),
    endScreen: document.getElementById('end-screen'),

    // Start screen
    difficultySelect: document.getElementById('difficulty-select'),
    roundsSelect: document.getElementById('rounds-select'),
    startBtn: document.getElementById('start-btn'),
    highScoreDisplay: document.getElementById('high-score-display'),

    // Game screen
    currentRound: document.getElementById('current-round'),
    totalRounds: document.getElementById('total-rounds'),
    currentScore: document.getElementById('current-score'),
    campaignTitle: document.getElementById('campaign-title'),
    campaignDescription: document.getElementById('campaign-description'),
    hintBtn: document.getElementById('hint-btn'),
    hintCost: document.getElementById('hint-cost'),
    hintsList: document.getElementById('hints-list'),
    hintsContainer: document.getElementById('hints-container'),
    yearInput: document.getElementById('year-input'),
    submitBtn: document.getElementById('submit-btn'),
    giveUpBtn: document.getElementById('give-up-btn'),
    guessSection: document.getElementById('guess-section'),
    resultSection: document.getElementById('result-section'),
    resultDisplay: document.getElementById('result-display'),
    timelineViz: document.getElementById('timeline-viz'),
    explanation: document.getElementById('explanation'),
    nextBtn: document.getElementById('next-btn'),

    // End screen
    finalScore: document.getElementById('final-score'),
    maxScore: document.getElementById('max-score'),
    scoreBreakdown: document.getElementById('score-breakdown'),
    shareBtn: document.getElementById('share-btn'),
    shareFeedback: document.getElementById('share-feedback'),
    playAgainBtn: document.getElementById('play-again-btn'),
    
    // Map Elements
    guessMap: document.getElementById('guess-map'),
    resultMap: document.getElementById('result-map')
};

// Initialize
function init() {
    displayHighScore();
    attachEventListeners();
}

function attachEventListeners() {
    elements.startBtn.addEventListener('click', startGame);
    elements.submitBtn.addEventListener('click', handlePhaseSubmit);
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

    // Separate into unseen and seen
    const unseen = filteredCampaigns.filter(c => !seenIds.includes(c.id));
    const seen = filteredCampaigns.filter(c => seenIds.includes(c.id));

    // If all campaigns have been seen, reset the seen list
    if (unseen.length === 0 && seen.length > 0) {
        resetSeenCampaigns();
        state.campaigns = shuffleArray([...filteredCampaigns]);
    } else {
        // Prioritize unseen campaigns, then add seen ones (both shuffled)
        state.campaigns = [...shuffleArray([...unseen]), ...shuffleArray([...seen])];
    }

    showScreen(elements.gameScreen);
    elements.totalRounds.textContent = state.totalRounds;
    
    // Initialize Map for the first time
    initGuessMap();
    
    nextRound();
}

function initGuessMap() {
    // Check if L (Leaflet) is loaded
    if (typeof L === 'undefined') return;

    if (state.mapInstance) {
        state.mapInstance.remove(); // Clean up previous map
    }

    state.mapInstance = L.map('guess-map').setView([20, 0], 2); // World view centered

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
        
        // Enable Final Submit button once a pin is dropped
        elements.submitBtn.disabled = false;
        elements.submitBtn.textContent = "Confirm Location";
        elements.submitBtn.classList.add('primary-action'); 
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

    // Get next campaign
    state.currentCampaign = getNextCampaign();
    if (!state.currentCampaign) {
        // Ran out of campaigns, end early
        endGame();
        return;
    }

    // Update UI
    elements.currentRound.textContent = state.currentRound;
    elements.currentScore.textContent = state.score;
    elements.campaignTitle.textContent = state.currentCampaign.title;
    elements.campaignDescription.innerHTML = state.currentCampaign.description
        .split('\n\n')
        .map(p => `<p>${p}</p>`)
        .join('');

    // Reset hints
    elements.hintsList.innerHTML = '';
    updateHintButton();

    // Reset Guess Section UI
    elements.guessSection.classList.remove('hidden');
    elements.resultSection.classList.add('hidden');
    
    // Step 1 State: Year Input Only
    elements.yearInput.value = '';
    elements.yearInput.disabled = false;
    elements.yearInput.classList.remove('hidden');
    
    // Hide Map initially
    elements.guessMap.classList.add('hidden');
    // Clear marker from map logic
    if (state.guessMarker) {
        state.mapInstance.removeLayer(state.guessMarker);
        state.guessMarker = null;
    }

    elements.submitBtn.textContent = "Next: Guess Location";
    elements.submitBtn.disabled = false;
    elements.submitBtn.classList.remove('primary-action');

    // Scroll to top
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        elements.yearInput.focus({ preventScroll: true });
    }, 0);
}

function getNextCampaign() {
    for (const campaign of state.campaigns) {
        if (!state.usedCampaignIds.includes(campaign.id)) {
            state.usedCampaignIds.push(campaign.id);
            // Mark as seen in localStorage for future sessions
            markCampaignSeen(campaign.id);
            return campaign;
        }
    }
    return null;
}

function parseYearInput(input) {
    const trimmed = input.trim().toLowerCase();

    // Handle decade format like "1870s"
    const decadeMatch = trimmed.match(/^(\d{3,4})s$/);
    if (decadeMatch) {
        return parseInt(decadeMatch[1]) + 5; // Middle of decade
    }

    // Handle BCE/BC format like "53 bce", "53 bc"
    const bceMatch = trimmed.match(/^(\d{1,4})\s*(?:bce|bc|b\.c\.e\.?|b\.c\.?)$/);
    if (bceMatch) {
        return -parseInt(bceMatch[1]);
    }

    // Handle negative year like "-53"
    const negativeMatch = trimmed.match(/^-(\d{1,4})$/);
    if (negativeMatch) {
        return -parseInt(negativeMatch[1]);
    }

    // Handle plain year
    const yearMatch = trimmed.match(/^(\d{3,4})$/);
    if (yearMatch) {
        return parseInt(yearMatch[1]);
    }

    return null;
}

// === NEW LOGIC: Two-Phase Submission ===

function handlePhaseSubmit() {
    // Phase 1: Year Guess
    if (state.yearGuess === null) {
        const input = elements.yearInput.value;
        const guess = parseYearInput(input);

        if (guess === null || guess < -5000 || guess > 2025) {
            elements.yearInput.style.borderColor = '#c62828';
            setTimeout(() => {
                elements.yearInput.style.borderColor = '';
            }, 1000);
            return;
        }

        // Lock Year, Show Map
        state.yearGuess = guess;
        elements.yearInput.disabled = true;
        
        elements.guessMap.classList.remove('hidden');
        state.mapInstance.invalidateSize(); // Fix leaflet rendering issue when unhiding
        
        elements.submitBtn.textContent = "Click Map to Drop Pin";
        elements.submitBtn.disabled = true; // Disable until pin dropped
        
    } else {
        // Phase 2: Location Guess (Submit Round)
        processRound();
    }
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

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
    const age = 2026 - actual; // how old the battle is

    // Scale factor: 1x for recent battles, up to 3x for ancient battles
    const scale = Math.min(3, Math.max(1, age / 500));

    if (diff <= 5 * scale) return 100;   // Exact
    if (diff <= 10 * scale) return 90;   // Very close
    if (diff <= 25 * scale) return 75;   // Close
    if (diff <= 50 * scale) return 60;   // Good
    if (diff <= 100 * scale) return 40;  // Fair
    if (diff <= 200 * scale) return 20;  // Distant
    return 0;                             // Way off
}

function giveUp() {
    state.yearGuess = null; // null signifies give up
    state.locationGuess = null;
    processRound();
}

function processRound() {
    const campaign = state.currentCampaign;
    
    // 1. Calculate Year Score
    let yearPoints = 0;
    if (state.yearGuess !== null) {
        yearPoints = calculateScore(state.yearGuess, campaign.actualYear);
    }

    // 2. Calculate Map Score
    let mapPoints = 0;
    let distance = null;
    
    // Handle give up or no pin dropped
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
        if (campaign.hints[i]) {
            hintPenalty += campaign.hints[i].cost;
        }
    }

    // Total Score (Max 200 per round)
    const rawTotal = yearPoints + mapPoints;
    const finalRoundScore = Math.max(0, rawTotal - hintPenalty);

    state.score += finalRoundScore;
    state.roundResults.push({
        campaign: campaign,
        yearPoints: yearPoints,
        mapPoints: mapPoints,
        totalPoints: finalRoundScore
    });

    // Update score display
    elements.currentScore.textContent = state.score;

    // Show result
    displayResult(yearPoints, mapPoints, distance, hintPenalty);
}

function getScoreClass(pts) {
    if (pts >= 90) return 'perfect';
    if (pts >= 60) return 'good';
    if (pts >= 30) return 'okay';
    return 'miss';
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

    // Timeline visualization
    if (state.yearGuess !== null) {
        displayTimeline(state.yearGuess, actualYear);
    } else {
        elements.timelineViz.innerHTML = '';
    }

    // Map visualization
    displayResultMap();

    // Explanation
    let explanationHTML = `
        <h3>Historical Context</h3>
        <p>${state.currentCampaign.explanation}</p>
    `;

    // Add explanations for hints the player revealed
    const revealedHints = state.currentCampaign.hints.slice(0, state.hintsRevealed);
    for (const hint of revealedHints) {
        if (hint.explanation) {
            explanationHTML += `<p>${hint.explanation}</p>`;
        }
    }

    elements.explanation.innerHTML = explanationHTML;
}

function displayResultMap() {
    const c = state.currentCampaign;
    if (!c.latitude || typeof L === 'undefined') return;

    if (state.resultMapInstance) {
        state.resultMapInstance.remove();
    }

    state.resultMapInstance = L.map('result-map').setView([c.latitude, c.longitude], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(state.resultMapInstance);

    // Actual Location (Green)
    const actualIcon = L.divIcon({
        className: 'custom-pin actual-pin',
        html: `<div style="background-color: #2e7d32; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`
    });
    L.marker([c.latitude, c.longitude], {icon: actualIcon}).addTo(state.resultMapInstance)
     .bindPopup("Actual Location").openPopup();

    // User Guess (Red)
    if (state.locationGuess) {
        const guessIcon = L.divIcon({
            className: 'custom-pin guess-pin',
            html: `<div style="background-color: #c62828; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`
        });
        L.marker([state.locationGuess.lat, state.locationGuess.lng], {icon: guessIcon}).addTo(state.resultMapInstance)
         .bindPopup("Your Guess");

        // Draw Line
        L.polyline([
            [state.locationGuess.lat, state.locationGuess.lng],
            [c.latitude, c.longitude]
        ], {color: 'blue', dashArray: '5, 10'}).addTo(state.resultMapInstance);
        
        // Fit bounds to show both
        const bounds = L.latLngBounds(
            [state.locationGuess.lat, state.locationGuess.lng],
            [c.latitude, c.longitude]
        );
        state.resultMapInstance.fitBounds(bounds, {padding: [50, 50]});
    }
}

function displayTimeline(guess, actual) {
    // Determine range
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
            <div class="legend-item">
                <div class="legend-dot guess"></div>
                <span>Your guess (${formatYear(guess)})</span>
            </div>
            <div class="legend-item">
                <div class="legend-dot actual"></div>
                <span>Actual (${formatYear(actual)})</span>
            </div>
        </div>
    `;
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
        const nextCost = hints[state.hintsRevealed].cost;
        elements.hintCost.textContent = nextCost;
        elements.hintBtn.innerHTML = `Buy Hint (<span id="hint-cost">${nextCost}</span> pts)`;
    }
}

function endGame() {
    showScreen(elements.endScreen);

    // Max score is now higher because of map round (100 for year + 100 for map = 200 per round)
    const maxPossible = state.roundResults.length * 200;
    
    elements.finalScore.textContent = state.score;
    elements.maxScore.textContent = maxPossible;

    // Score breakdown
    let breakdownHTML = '';
    for (const result of state.roundResults) {
        const title = result.campaign.title.length > 30
            ? result.campaign.title.substring(0, 30) + '...'
            : result.campaign.title;
        breakdownHTML += `
            <div class="breakdown-item">
                <span class="campaign">${title}</span>
                <span class="points">${result.totalPoints} pts</span>
            </div>
        `;
    }
    elements.scoreBreakdown.innerHTML = breakdownHTML;

    // Save high score
    saveHighScore(state.score, maxPossible);
}

function saveHighScore(score, maxPossible) {
    const key = `highscore_${state.difficulty}_${state.totalRounds}`;
    const existing = localStorage.getItem(key);
    if (!existing || score > parseInt(existing)) {
        localStorage.setItem(key, score);
    }
    displayHighScore();
}

function displayHighScore() {
    const difficulty = elements.difficultySelect.value;
    const rounds = elements.roundsSelect.value;
    const key = `highscore_${difficulty}_${rounds}`;
    const score = localStorage.getItem(key);

    // Note: Max score calculation changed (rounds * 200)
    if (score) {
        elements.highScoreDisplay.textContent = `High score: ${score}/${rounds * 200}`;
    } else {
        elements.highScoreDisplay.textContent = '';
    }
}

function shareResult() {
    // Max score is rounds * 200 now
    const maxPossible = state.roundResults.length * 200;
    const percent = Math.round((state.score / maxPossible) * 100);
    const text = `I scored ${state.score}/${maxPossible} (${percent}%) on When Was This War? Can you guess historical battles by their descriptions?`;

    navigator.clipboard.writeText(text).then(() => {
        elements.shareFeedback.textContent = 'Copied to clipboard!';
        setTimeout(() => {
            elements.shareFeedback.textContent = '';
        }, 2000);
    }).catch(() => {
        elements.shareFeedback.textContent = 'Could not copy to clipboard';
    });
}

function resetGame() {
    showScreen(elements.startScreen);
    displayHighScore();
}

// Utility
function formatYear(year) {
    if (year < 0) {
        return `${Math.abs(year)} BCE`;
    }
    return year.toString();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Seen campaigns tracking (localStorage)
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

function resetSeenCampaigns() {
    localStorage.removeItem(SEEN_CAMPAIGNS_KEY);
}

// Update high score display when settings change
elements.difficultySelect.addEventListener('change', displayHighScore);
elements.roundsSelect.addEventListener('change', displayHighScore);

// Start
init();