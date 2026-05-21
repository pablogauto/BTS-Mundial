// js/app.js - Logic for BTS ARMY Fixture PWA

// State variables
let state = {
  simulationMode: false,
  simulatedScores: {}, // Map of match.num -> { s1: int, s2: int }
  favoriteTeams: [],   // Array of team names
  activeTab: 'inicio',
  searchQuery: '',
  activeStageFilter: 'all' // 'all', 'argentina', 'groups', 'knockouts', 'favorites'
};

let deferredPrompt = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  // Ensure all matches have a unique number
  if (typeof MATCHES !== 'undefined') {
    MATCHES.forEach((match, index) => {
      if (!match.num) {
        match.num = index + 1;
      }
    });
  }
  
  initPWA();
  loadStateFromStorage();
  setupEventListeners();
  renderActiveTab();
  
  // Set theme color dynamically
  document.querySelector('meta[name="theme-color"]').setAttribute('content', '#5E27D8');
});

// Register PWA Service Worker
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
        .catch(err => console.error('Fallo al registrar Service Worker:', err));
    });
  }

  // Capturar el evento de instalación nativo
  window.addEventListener('beforeinstallprompt', (e) => {
    // Evitar que Chrome muestre automáticamente el prompt
    e.preventDefault();
    // Guardar el evento para dispararlo cuando el usuario haga click
    deferredPrompt = e;
    // Mostrar el botón de instalación en el header
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
      installBtn.style.display = 'flex';
    }
    // Mostrar también el banner de instalación en el Home
    const pwaHomeBanner = document.getElementById('pwaHomeBanner');
    if (pwaHomeBanner) {
      pwaHomeBanner.classList.remove('hidden');
    }
  });

  // Escuchar cuando la app se instala
  window.addEventListener('appinstalled', () => {
    console.log('BTS ARMY Fixture PWA ha sido instalada con éxito');
    deferredPrompt = null;
    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
    const pwaHomeBanner = document.getElementById('pwaHomeBanner');
    if (pwaHomeBanner) {
      pwaHomeBanner.classList.add('hidden');
    }
  });
}

// Load preferences from localStorage
function loadStateFromStorage() {
  try {
    const savedFavorites = localStorage.getItem('bts_army_fav_teams');
    if (savedFavorites) {
      state.favoriteTeams = JSON.parse(savedFavorites);
    }
    
    const savedScores = localStorage.getItem('bts_army_sim_scores');
    if (savedScores) {
      state.simulatedScores = JSON.parse(savedScores);
    }

    const savedSimMode = localStorage.getItem('bts_army_sim_mode');
    if (savedSimMode) {
      state.simulationMode = JSON.parse(savedSimMode);
      document.getElementById('simModeToggle').checked = state.simulationMode;
      updateSimulationUI();
    }
  } catch (e) {
    console.error('Error al cargar datos de localStorage', e);
  }
}

// Save preferences to localStorage
function saveStateToStorage() {
  try {
    localStorage.setItem('bts_army_fav_teams', JSON.stringify(state.favoriteTeams));
    localStorage.setItem('bts_army_sim_scores', JSON.stringify(state.simulatedScores));
    localStorage.setItem('bts_army_sim_mode', JSON.stringify(state.simulationMode));
  } catch (e) {
    console.error('Error al guardar datos en localStorage', e);
  }
}

// Update UI elements based on simulation mode status
function updateSimulationUI() {
  const badge = document.getElementById('simBadge');
  const note = document.getElementById('groupsSimulatorNote');
  
  if (state.simulationMode) {
    badge.style.display = 'inline-block';
    if (note) note.classList.remove('hidden');
    // Enable inputs
    document.querySelectorAll('.score-input').forEach(input => {
      input.removeAttribute('disabled');
    });
  } else {
    badge.style.display = 'none';
    if (note) note.classList.add('hidden');
    // Disable inputs
    document.querySelectorAll('.score-input').forEach(input => {
      input.setAttribute('disabled', 'true');
    });
  }
}

// Get team metadata (FIFA code, flag, group)
function getTeamInfo(teamName) {
  if (!teamName) return null;
  return TEAMS.find(t => t.name.toLowerCase() === teamName.toLowerCase()) || null;
}

// Resolve team placeholder for knockout stage
// e.g. "1A" -> Winner of Group A
function resolvePlaceholder(teamPlaceholder, standings) {
  if (!teamPlaceholder) return { name: '', code: '', flag: '⚽', isPlaceholder: true };
  
  // Standard team names don't match placeholder regex (e.g. "Mexico", "Argentina")
  // Placeholders usually look like "1A", "2B", "3A/B/C"
  const groupWinnerMatch = teamPlaceholder.match(/^1([A-L])$/);
  const groupRunnerUpMatch = teamPlaceholder.match(/^2([A-L])$/);
  const groupThirdMatch = teamPlaceholder.match(/^3([A-L]|\S+)/);

  if (groupWinnerMatch) {
    const groupLetter = groupWinnerMatch[1];
    const groupKey = `Group ${groupLetter}`;
    const groupTeams = standings[groupKey];
    if (groupTeams && groupTeams.length >= 4 && isGroupFinished(groupKey)) {
      return { ...groupTeams[0], isPlaceholder: false };
    }
    return { name: `Ganador Gr. ${groupLetter}`, code: `1${groupLetter}`, flag: '⚽', isPlaceholder: true };
  }
  
  if (groupRunnerUpMatch) {
    const groupLetter = groupRunnerUpMatch[1];
    const groupKey = `Group ${groupLetter}`;
    const groupTeams = standings[groupKey];
    if (groupTeams && groupTeams.length >= 4 && isGroupFinished(groupKey)) {
      return { ...groupTeams[1], isPlaceholder: false };
    }
    return { name: `Segundo Gr. ${groupLetter}`, code: `2${groupLetter}`, flag: '⚽', isPlaceholder: true };
  }

  if (groupThirdMatch) {
    // 3rd place teams list. For simplicity, we resolve this as "3° Grupo X" or "Mejor 3°"
    const details = groupThirdMatch[1];
    if (details.length === 1) { // e.g. "3A"
      const groupLetter = details;
      const groupKey = `Group ${groupLetter}`;
      const groupTeams = standings[groupKey];
      if (groupTeams && groupTeams.length >= 4 && isGroupFinished(groupKey)) {
        return { ...groupTeams[2], isPlaceholder: false };
      }
      return { name: `Tercero Gr. ${groupLetter}`, code: `3${groupLetter}`, flag: '⚽', isPlaceholder: true };
    }
    // E.g. "3A/B/C/D/F" - best 3rd placed teams
    // Let's resolve from best third standing if all group stages are done
    if (isAllGroupsFinished(standings)) {
      const bestThirds = getBestThirdPlaceTeams(standings);
      // We will assign third place spots according to standard placement, or just display them ranked
      // For simplicity in a PWA, let's show "Mejor 3°" or assign them in order.
      // Let's return a name indicating it's a qualifying 3rd place team.
      return { name: `Mejor 3° (${details})`, code: '3RD', flag: '⚽', isPlaceholder: true };
    }
    return { name: `Tercero ${details}`, code: '3RD', flag: '⚽', isPlaceholder: true };
  }

  // Already a real team name
  const info = getTeamInfo(teamPlaceholder);
  if (info) {
    return { ...info, name: teamPlaceholder, isPlaceholder: false };
  }
  return { name: teamPlaceholder, code: '', flag: '⚽', isPlaceholder: false };
}

// Convert a time string like "19:00 UTC-6" to Buenos Aires time (UTC-3)
function convertTimeToBA(timeStr) {
  if (!timeStr) return timeStr;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/);
  if (!match) return timeStr.replace(/\s*UTC[+-]\d+/, '');
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const offset = parseInt(match[3], 10); // e.g. -6 means UTC-6
  // Convert to UTC, then to UTC-3
  const utcMinutes = hours * 60 + minutes - offset * 60;
  const baMinutes = utcMinutes - 3 * 60;
  let h = Math.floor(((baMinutes % 1440) + 1440) % 1440 / 60);
  let m = ((baMinutes % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Check if all 6 matches of a group are played
function isGroupFinished(groupKey) {
  const groupMatches = MATCHES.filter(m => m.group === groupKey);
  for (const m of groupMatches) {
    const hasSimScore = state.simulationMode && state.simulatedScores[m.num] !== undefined;
    const hasScore = hasSimScore || (m.score1 !== undefined && m.score2 !== undefined);
    if (!hasScore) return false;
  }
  return true;
}

// Check if all group stage matches are finished
function isAllGroupsFinished(standings) {
  for (let letter of 'ABCDEFGHIJKL') {
    if (!isGroupFinished(`Group ${letter}`)) return false;
  }
  return true;
}

// Calculate Standings dynamically
function calculateStandings() {
  const standings = {};
  
  // Initialize teams stats
  TEAMS.forEach(team => {
    const groupKey = `Group ${team.group}`;
    if (!standings[groupKey]) {
      standings[groupKey] = [];
    }
    
    // Check if team already added
    if (!standings[groupKey].find(t => t.name === team.name)) {
      standings[groupKey].push({
        name: team.name,
        code: team.fifa_code,
        flag: team.flag_icon,
        pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0
      });
    }
  });

  // Calculate scores
  MATCHES.forEach(match => {
    // Only group stage matches
    if (!match.group) return;
    
    const groupKey = match.group;
    const sim = state.simulationMode ? state.simulatedScores[match.num] : null;
    let s1 = null;
    let s2 = null;

    if (sim) {
      s1 = sim.s1;
      s2 = sim.s2;
    } else if (match.score1 !== undefined && match.score2 !== undefined) {
      s1 = match.score1;
      s2 = match.score2;
    }

    if (s1 !== null && s2 !== null) {
      const team1Obj = standings[groupKey].find(t => t.name === match.team1);
      const team2Obj = standings[groupKey].find(t => t.name === match.team2);

      if (team1Obj && team2Obj) {
        team1Obj.pj += 1;
        team2Obj.pj += 1;
        team1Obj.gf += s1;
        team2Obj.gf += s2;
        team1Obj.gc += s2;
        team2Obj.gc += s1;
        team1Obj.dg = team1Obj.gf - team1Obj.gc;
        team2Obj.dg = team2Obj.gf - team2Obj.gc;

        if (s1 > s2) {
          team1Obj.pts += 3;
          team1Obj.pg += 1;
          team2Obj.pp += 1;
        } else if (s1 < s2) {
          team2Obj.pts += 3;
          team2Obj.pg += 1;
          team1Obj.pp += 1;
        } else {
          team1Obj.pts += 1;
          team2Obj.pts += 1;
          team1Obj.pe += 1;
          team2Obj.pe += 1;
        }
      }
    }
  });

  // Sort teams in each group
  Object.keys(standings).forEach(groupKey => {
    standings[groupKey].sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });
  });

  return standings;
}

// Get the ranked 3rd-placed teams across all 12 groups
function getBestThirdPlaceTeams(standings) {
  const thirds = [];
  Object.keys(standings).forEach(groupKey => {
    const teams = standings[groupKey];
    if (teams && teams.length >= 3) {
      thirds.push({
        ...teams[2],
        group: groupKey.replace('Group ', '')
      });
    }
  });

  // Sort third placed teams
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });

  return thirds;
}

// Event Listeners setup
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabItem = e.currentTarget;
      const tabName = tabItem.getAttribute('data-tab');
      
      document.querySelectorAll('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      
      tabItem.classList.add('active');
      document.getElementById(`panel-${tabName}`).classList.add('active');
      
      state.activeTab = tabName;
      renderActiveTab();
    });
  });

  // Search input filter
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderFixture();
    });
  }

  // Filter Pills (Stage Filters)
  document.querySelectorAll('#stageFilters .filter-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('#stageFilters .filter-pill').forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.activeStageFilter = e.currentTarget.getAttribute('data-stage');
      renderFixture();
    });
  });

  // Argentina quick link
  const linkArgentina = document.getElementById('link-argentina');
  if (linkArgentina) {
    linkArgentina.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Update filter pills active class
      document.querySelectorAll('#stageFilters .filter-pill').forEach(p => p.classList.remove('active'));
      const argPill = document.querySelector('#stageFilters .filter-pill[data-stage="argentina"]');
      if (argPill) argPill.classList.add('active');
      
      state.activeStageFilter = 'argentina';
      renderFixture();
    });
  }

  // Simulation Mode Toggle Switch
  const simToggle = document.getElementById('simModeToggle');
  if (simToggle) {
    simToggle.addEventListener('change', (e) => {
      state.simulationMode = e.target.checked;
      saveStateToStorage();
      updateSimulationUI();
      renderActiveTab();
    });
  }

  // Sync Button Online Data
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      syncBtn.style.animation = 'pulse 1s infinite';
      fetchOnlineFixture();
    });
  }

  // Botón de Instalación PWA
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        // Mostrar el banner nativo de instalación
        deferredPrompt.prompt();
        // Esperar la elección del usuario
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Elección de instalación del usuario: ${outcome}`);
        // Limpiar el prompt diferido
        deferredPrompt = null;
        // Ocultar el botón
        installBtn.style.display = 'none';
      }
    });
  }

  // Favorite Tracker Actions
  const saveFavBtn = document.getElementById('saveFavoritesBtn');
  if (saveFavBtn) {
    saveFavBtn.addEventListener('click', () => {
      const selected = [];
      document.querySelectorAll('.team-select-card.selected').forEach(card => {
        selected.push(card.getAttribute('data-name'));
      });
      state.favoriteTeams = selected;
      saveStateToStorage();
      alert('Favoritos guardados correctamente. Podrás seguirlos en la pestaña "Seguidor".');
      renderTracker();
    });
  }

  const clearFavBtn = document.getElementById('clearFavoritesBtn');
  if (clearFavBtn) {
    clearFavBtn.addEventListener('click', () => {
      state.favoriteTeams = [];
      saveStateToStorage();
      document.querySelectorAll('.team-select-card').forEach(card => {
        card.classList.remove('selected');
      });
      renderTracker();
    });
  }

  // Tarjetas de navegación rápida en el Home
  document.querySelectorAll('.quick-nav-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const targetTab = e.currentTarget.getAttribute('data-target');
      if (targetTab === 'external-bts') {
        window.open('https://open.spotify.com/intl-es/artist/3Nrfpe0tUJi4K4DXYWgMUX', '_blank', 'noopener,noreferrer');
        return;
      }
      const targetBtn = document.querySelector(`.bottom-nav .nav-item[data-tab="${targetTab}"]`);
      if (targetBtn) {
        targetBtn.click();
      }
    });
  });

  // Botón de instalación PWA en el Home
  const installBtnHome = document.getElementById('installBtnHome');
  if (installBtnHome) {
    installBtnHome.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`Elección de instalación del usuario (Home): ${outcome}`);
        deferredPrompt = null;
        const pwaHomeBanner = document.getElementById('pwaHomeBanner');
        if (pwaHomeBanner) pwaHomeBanner.classList.add('hidden');
        const installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.style.display = 'none';
      }
    });
  }
}

// Render active tab panel contents
function renderActiveTab() {
  if (state.activeTab === 'inicio') {
    renderInicio();
  } else if (state.activeTab === 'fixture') {
    renderFixture();
  } else if (state.activeTab === 'groups') {
    renderGroups();
  } else if (state.activeTab === 'tracker') {
    renderTracker();
  }
}

// Render Home (Inicio) view
function renderInicio() {
  const container = document.getElementById('nextMatchArgentinaContainer');
  if (!container) return;

  const standings = calculateStandings();

  // Find next Argentina match
  const argMatches = MATCHES.filter(m => {
    return m.team1.toLowerCase() === 'argentina' || m.team2.toLowerCase() === 'argentina';
  });

  // Find the first match that is not played (no real score, no simulated score)
  let nextMatch = argMatches.find(m => {
    const hasRealScore = m.score1 !== undefined && m.score2 !== undefined;
    const hasSimScore = state.simulationMode && state.simulatedScores[m.num] !== undefined;
    return !hasRealScore && !hasSimScore;
  });

  // If all are played or simulated, fallback to first match
  if (!nextMatch) {
    nextMatch = argMatches[0];
  }

  if (nextMatch) {
    const isKnockout = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'].includes(nextMatch.round);
    
    // Resolve Team Names
    let t1Name = nextMatch.team1;
    let t2Name = nextMatch.team2;
    let t1Flag = '⚽';
    let t2Flag = '⚽';
    let t1Code = '';
    let t2Code = '';

    if (isKnockout) {
      const resolved1 = resolvePlaceholder(nextMatch.team1, standings);
      const resolved2 = resolvePlaceholder(nextMatch.team2, standings);
      t1Name = resolved1.name;
      t2Name = resolved2.name;
      t1Flag = resolved1.flag || '⚽';
      t2Flag = resolved2.flag || '⚽';
      t1Code = resolved1.code || '';
      t2Code = resolved2.code || '';
    } else {
      const team1Info = getTeamInfo(nextMatch.team1);
      const team2Info = getTeamInfo(nextMatch.team2);
      if (team1Info) { t1Flag = team1Info.flag_icon; t1Code = team1Info.fifa_code; }
      if (team2Info) { t2Flag = team2Info.flag_icon; t2Code = team2Info.fifa_code; }
    }

    const sim = state.simulationMode ? state.simulatedScores[nextMatch.num] : null;
    let s1Val = sim ? sim.s1 : (nextMatch.score1 !== undefined ? nextMatch.score1 : '');
    let s2Val = sim ? sim.s2 : (nextMatch.score2 !== undefined ? nextMatch.score2 : '');

    // Formatar fecha en Español
    const dateObj = new Date(nextMatch.date + 'T00:00:00');
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    let formattedDate = dateObj.toLocaleDateString('es-ES', options);
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    container.innerHTML = `
      <div class="next-match-card" data-num="${nextMatch.num}">
        <div class="next-match-header">
          <span class="next-match-badge">${nextMatch.group ? `Grupo ${nextMatch.group.replace('Group ', '')}` : nextMatch.round}</span>
          <span class="next-match-badge" style="background:var(--primary-color)">${nextMatch.num ? `#${nextMatch.num}` : ''}</span>
        </div>
        
        <div class="next-match-teams">
          <!-- Team 1 -->
          <div class="next-match-team">
            <span class="team-flag">${t1Flag}</span>
            <span class="next-match-team-name">${t1Name}</span>
          </div>

          <!-- Score / VS Area -->
          <div class="next-match-info-center">
            ${state.simulationMode ? `
              <div class="score-input-container">
                <input type="number" min="0" max="99" 
                  class="score-input ${sim ? 'score-highlight' : ''}" 
                  data-match="${nextMatch.num}" 
                  data-team="1" 
                  value="${s1Val}" 
                  placeholder="-">
                <span class="match-separator">:</span>
                <input type="number" min="0" max="99" 
                  class="score-input ${sim ? 'score-highlight' : ''}" 
                  data-match="${nextMatch.num}" 
                  data-team="2" 
                  value="${s2Val}" 
                  placeholder="-">
              </div>
            ` : `
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="score-box" style="width:28px; height:28px; font-size:15px; font-weight:800;">${s1Val !== '' ? s1Val : '-'}</span>
                <span class="match-separator">:</span>
                <span class="score-box" style="width:28px; height:28px; font-size:15px; font-weight:800;">${s2Val !== '' ? s2Val : '-'}</span>
              </div>
            `}
            <span class="next-match-vs" style="margin-top: 4px;">VS</span>
          </div>

          <!-- Team 2 -->
          <div class="next-match-team">
            <span class="team-flag">${t2Flag}</span>
            <span class="next-match-team-name">${t2Name}</span>
          </div>
        </div>

        <div class="next-match-details-footer">
          <div class="next-match-date-time">${formattedDate} &nbsp;|&nbsp; H: ${convertTimeToBA(nextMatch.time)}</div>
          <a href="#" id="homePredictLink" style="color: var(--primary-color); text-decoration: none; font-weight: 700; transition: opacity 0.2s;">
            ${state.simulationMode ? 'Ver fixture' : 'Pronosticar'} &rarr;
          </a>
        </div>
      </div>
    `;

    // Hook up dynamic events inside the card
    const homePredictLink = container.querySelector('#homePredictLink');
    if (homePredictLink) {
      homePredictLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (!state.simulationMode) {
          const simToggle = document.getElementById('simModeToggle');
          if (simToggle) {
            simToggle.checked = true;
            state.simulationMode = true;
            saveStateToStorage();
            updateSimulationUI();
          }
        }
        const fixtureTabBtn = document.querySelector('.bottom-nav .nav-item[data-tab="fixture"]');
        if (fixtureTabBtn) {
          fixtureTabBtn.click();
        }
      });
    }

    container.querySelectorAll('.score-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const matchNum = parseInt(e.target.getAttribute('data-match'));
        const teamIndex = e.target.getAttribute('data-team');
        const val = e.target.value;

        if (!state.simulatedScores[matchNum]) {
          state.simulatedScores[matchNum] = { s1: null, s2: null };
        }

        if (val === '') {
          state.simulatedScores[matchNum][`s${teamIndex}`] = null;
        } else {
          state.simulatedScores[matchNum][`s${teamIndex}`] = Math.max(0, parseInt(val));
        }

        if (state.simulatedScores[matchNum].s1 === null && state.simulatedScores[matchNum].s2 === null) {
          delete state.simulatedScores[matchNum];
        }

        saveStateToStorage();
        
        // Provide visual feedback
        const inputs = container.querySelectorAll('.score-input');
        inputs.forEach(i => {
          i.classList.add('score-highlight');
          setTimeout(() => i.classList.remove('score-highlight'), 1500);
        });
      });
    });
  } else {
    container.innerHTML = `
      <div class="info-card">
        <div class="info-card-title">Sin partidos pendientes</div>
        <div class="info-card-text">Argentina no tiene más partidos en su fixture.</div>
      </div>
    `;
  }

  // Handle installation banner visibility
  const pwaHomeBanner = document.getElementById('pwaHomeBanner');
  if (pwaHomeBanner) {
    if (deferredPrompt) {
      pwaHomeBanner.classList.remove('hidden');
    } else {
      pwaHomeBanner.classList.add('hidden');
    }
  }
}

// Render Fixture view
function renderFixture() {
  const container = document.getElementById('matchesContainer');
  if (!container) return;

  const standings = calculateStandings();
  
  // Group matches by date
  const matchesByDate = {};
  
    MATCHES.forEach(match => {
      // Determine Stage
      const isKnockout = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'].includes(match.round);
      
      // Apply Stage Filter
      if (state.activeStageFilter === 'groups' && isKnockout) return;
      if (state.activeStageFilter === 'knockouts' && !isKnockout) return;
      
      // Resolve Team Names and Flags
      let team1Info = getTeamInfo(match.team1);
      let team2Info = getTeamInfo(match.team2);
      
      let t1Name = match.team1;
      let t2Name = match.team2;
      let t1Flag = team1Info ? team1Info.flag_icon : '⚽';
      let t2Flag = team2Info ? team2Info.flag_icon : '⚽';
      let t1Code = team1Info ? team1Info.fifa_code : '';
      let t2Code = team2Info ? team2Info.fifa_code : '';

      if (isKnockout) {
        const resolved1 = resolvePlaceholder(match.team1, standings);
        const resolved2 = resolvePlaceholder(match.team2, standings);
        t1Name = resolved1.name;
        t2Name = resolved2.name;
        t1Flag = resolved1.flag || '⚽';
        t2Flag = resolved2.flag || '⚽';
        t1Code = resolved1.code || '';
        t2Code = resolved2.code || '';
      }

      // Apply Argentina Filter
      if (state.activeStageFilter === 'argentina') {
        const isArgentinaMatch = t1Name.toLowerCase() === 'argentina' || t2Name.toLowerCase() === 'argentina';
        if (!isArgentinaMatch) return;
      }
      
      // Apply Favorite Filter
      const isFavMatch = state.favoriteTeams.includes(t1Name) || state.favoriteTeams.includes(t2Name);
      if (state.activeStageFilter === 'favorites' && !isFavMatch) return;

    // Apply Search Query filter
    if (state.searchQuery) {
      const query = state.searchQuery;
      const matchGroup = match.group || '';
      const matchVenue = match.ground || '';
      const matchRound = match.round || '';
      
      const searchMatches = 
        t1Name.toLowerCase().includes(query) || 
        t2Name.toLowerCase().includes(query) || 
        matchGroup.toLowerCase().includes(query) || 
        matchVenue.toLowerCase().includes(query) || 
        matchRound.toLowerCase().includes(query);
        
      if (!searchMatches) return;
    }

    // Group by Date
    const dateStr = match.date;
    if (!matchesByDate[dateStr]) {
      matchesByDate[dateStr] = [];
    }
    matchesByDate[dateStr].push({
      ...match,
      t1Name, t2Name, t1Flag, t2Flag, t1Code, t2Code, isFavMatch, isKnockout
    });
  });

  // Sort dates
  const sortedDates = Object.keys(matchesByDate).sort();
  
  if (sortedDates.length === 0) {
    container.innerHTML = `
      <div class="info-card">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <div class="info-card-title">Sin Resultados</div>
        <div class="info-card-text">No se encontraron partidos para los filtros aplicados.</div>
      </div>
    `;
    return;
  }

  // Render HTML
  let html = '';
  sortedDates.forEach(dateStr => {
    // Formatar fecha en Español (ej. "Jueves 11 de Junio")
    const dateObj = new Date(dateStr + 'T00:00:00');
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    let formattedDate = dateObj.toLocaleDateString('es-ES', options);
    // Capitalize first letter
    formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

    html += `
      <div class="match-date-group">
        <h3 class="match-date-header">
          ${formattedDate}
          <span>${dateStr}</span>
        </h3>
        <div class="match-card-list">
    `;

    matchesByDate[dateStr].forEach(match => {
      const sim = state.simulatedScores[match.num];
      let s1Val = sim ? sim.s1 : (match.score1 !== undefined ? match.score1 : '');
      let s2Val = sim ? sim.s2 : (match.score2 !== undefined ? match.score2 : '');
      
      const isFavActive = state.favoriteTeams.includes(match.t1Name) || state.favoriteTeams.includes(match.t2Name);
      const isLive = sim !== undefined; // Simulated matches behave like live in the UI

      html += `
        <div class="match-card ${isLive ? 'live' : ''}" data-num="${match.num}">
          <div class="match-info-header">
            <div class="match-info-group">
              ${match.group ? `Grupo ${match.group.replace('Group ', '')}` : match.round}
              ${match.num ? `<span style="color:var(--text-muted); font-size:10px;">#${match.num}</span>` : ''}
            </div>
            <div class="match-info-venue">${match.ground}</div>
          </div>
          
          <div class="match-main-row">
            <!-- Team 1 Meta -->
            <div class="match-team-meta team1">
              <span class="team-flag">${match.t1Flag}</span>
              ${match.t1Code ? `<span class="team-code">${match.t1Code}</span>` : ''}
            </div>
            
            <!-- Scores Area -->
            <div class="match-score-area">
              <div class="score-input-container">
                <input type="number" min="0" max="99" 
                  class="score-input ${sim ? 'score-highlight' : ''}" 
                  data-match="${match.num}" 
                  data-team="1" 
                  value="${s1Val}" 
                  placeholder="-"
                  ${state.simulationMode ? '' : 'disabled'}>
                
                <span class="match-separator">:</span>
                
                <input type="number" min="0" max="99" 
                  class="score-input ${sim ? 'score-highlight' : ''}" 
                  data-match="${match.num}" 
                  data-team="2" 
                  value="${s2Val}" 
                  placeholder="-"
                  ${state.simulationMode ? '' : 'disabled'}>
              </div>
            </div>
            
            <!-- Team 2 Meta -->
            <div class="match-team-meta team2">
              ${match.t2Code ? `<span class="team-code">${match.t2Code}</span>` : ''}
              <span class="team-flag">${match.t2Flag}</span>
            </div>
          </div>

          <div class="match-names-row">
            <span class="team-name-label team1" title="${match.t1Name}">${match.t1Name}</span>
            <span class="team-name-label team2" title="${match.t2Name}">${match.t2Name}</span>
          </div>

          <div class="match-teams-row" style="padding-top:4px; font-size:11px; color:var(--text-muted); border-top:1px solid var(--card-border)">
            <div>Hora: ${convertTimeToBA(match.time)}</div>
            
            <!-- Favorite button -->
            <button class="fav-btn ${isFavActive ? 'active' : ''}" onclick="toggleFavoriteInline('${match.t1Name}', '${match.t2Name}', this)" title="Marcar selecciones como favoritas">
              <svg viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Add event listeners for score inputs
  container.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const matchNum = parseInt(e.target.getAttribute('data-match'));
      const teamIndex = e.target.getAttribute('data-team');
      const val = e.target.value;

      if (!state.simulatedScores[matchNum]) {
        state.simulatedScores[matchNum] = { s1: null, s2: null };
      }

      if (val === '') {
        state.simulatedScores[matchNum][`s${teamIndex}`] = null;
      } else {
        state.simulatedScores[matchNum][`s${teamIndex}`] = Math.max(0, parseInt(val));
      }

      // If both scores are empty, remove simulation for this match
      if (state.simulatedScores[matchNum].s1 === null && state.simulatedScores[matchNum].s2 === null) {
        delete state.simulatedScores[matchNum];
      }

      saveStateToStorage();
      
      // Visual feedback: Highlight the card
      const card = document.querySelector(`.match-card[data-num="${matchNum}"]`);
      if (card) {
        card.classList.add('live');
        const inputs = card.querySelectorAll('.score-input');
        inputs.forEach(i => {
          i.classList.add('score-highlight');
          setTimeout(() => i.classList.remove('score-highlight'), 1500);
        });
      }
    });
  });
}

// Toggle favorites from match card
window.toggleFavoriteInline = function(team1, team2, btnElement) {
  // If either team is already in favorites, remove them. Otherwise add both or the primary one.
  const t1Info = getTeamInfo(team1);
  const t2Info = getTeamInfo(team2);
  
  const t1Name = t1Info ? team1 : null;
  const t2Name = t2Info ? team2 : null;

  if (t1Name && state.favoriteTeams.includes(t1Name)) {
    state.favoriteTeams = state.favoriteTeams.filter(t => t !== t1Name);
  } else if (t1Name) {
    state.favoriteTeams.push(t1Name);
  }

  if (t2Name && state.favoriteTeams.includes(t2Name)) {
    state.favoriteTeams = state.favoriteTeams.filter(t => t !== t2Name);
  } else if (t2Name && t2Name !== t1Name) {
    state.favoriteTeams.push(t2Name);
  }

  saveStateToStorage();
  
  // Toggle class
  const isFav = (t1Name && state.favoriteTeams.includes(t1Name)) || (t2Name && state.favoriteTeams.includes(t2Name));
  if (isFav) {
    btnElement.classList.add('active');
  } else {
    btnElement.classList.remove('active');
  }

  // If in favorite tab, refresh
  if (state.activeStageFilter === 'favorites') {
    renderFixture();
  }
};

// Render Groups Standings
function renderGroups() {
  const container = document.getElementById('groupsContainer');
  if (!container) return;

  const standings = calculateStandings();
  const sortedGroupLetters = 'ABCDEFGHIJKL'.split('');
  
  let html = '';
  
  sortedGroupLetters.forEach(letter => {
    const groupKey = `Group ${letter}`;
    const teams = standings[groupKey] || [];
    
    html += `
      <div class="group-card">
        <h4 class="group-header">Grupo ${letter}</h4>
        <table class="group-table">
          <thead>
            <tr>
              <th class="team-col">Equipo</th>
              <th title="Partidos Jugados">PJ</th>
              <th title="Diferencia de Goles">DG</th>
              <th title="Puntos">PTS</th>
            </tr>
          </thead>
          <tbody>
    `;

    teams.forEach((team, index) => {
      // Determine qualification style (Top 2 qualify, best thirds qualify in blue)
      let rowClass = '';
      if (index === 0 || index === 1) {
        rowClass = 'qualify-next'; // Green dot (qualified)
      } else if (index === 2) {
        rowClass = 'qualify-playoff'; // Blue dot (depends on rankings)
      }

      html += `
        <tr class="${rowClass}">
          <td class="team-col">
            <div class="group-team-name">
              <span class="group-team-flag">${team.flag}</span>
              <span>${team.name} <span style="color:var(--text-muted); font-size:10px;">${team.code}</span></span>
            </div>
          </td>
          <td>${team.pj}</td>
          <td style="color:${team.dg > 0 ? 'var(--success)' : team.dg < 0 ? '#EF4444' : 'var(--text-secondary)'}">
            ${team.dg > 0 ? '+' : ''}${team.dg}
          </td>
          <td class="group-pts-col">${team.pts}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Map of stadium names to high-quality Unsplash image URLs
const VENUE_IMAGES = {
  "BC Place": "https://images.unsplash.com/photo-1597843797221-50d890e28ac5?w=500&q=80&fit=crop",
  "Lumen Field": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500&q=80&fit=crop",
  "Levi's Stadium": "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=500&q=80&fit=crop",
  "SoFi Stadium": "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=500&q=80&fit=crop",
  "Estadio Akron": "https://images.unsplash.com/photo-1568194157720-8eae79a37bba?w=500&q=80&fit=crop",
  "Estadio Azteca": "https://images.unsplash.com/photo-1504150559411-aef407cbb7ab?w=500&q=80&fit=crop",
  "Estadio BBVA": "https://images.unsplash.com/photo-1518063319789-7217e6706b04?w=500&q=80&fit=crop",
  "NRG Stadium": "https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=500&q=80&fit=crop",
  "AT&T Stadium": "https://images.unsplash.com/photo-1551816258-ef52d1354092?w=500&q=80&fit=crop",
  "Arrowhead Stadium": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=500&q=80&fit=crop",
  "Mercedes-Benz Stadium": "https://images.unsplash.com/photo-1540747737956-37872c847ced?w=500&q=80&fit=crop",
  "Hard Rock Stadium": "https://images.unsplash.com/photo-1564385944933-722a27546fb4?w=500&q=80&fit=crop",
  "BMO Field": "https://images.unsplash.com/photo-1510563800743-aed236490d08?w=500&q=80&fit=crop",
  "Gillette Stadium": "https://images.unsplash.com/photo-1431324155629-1a6edd1dec1d?w=500&q=80&fit=crop",
  "Lincoln Financial Field": "https://images.unsplash.com/photo-1513568692695-1f95b9a896aa?w=500&q=80&fit=crop",
  "MetLife Stadium": "https://images.unsplash.com/photo-1566799009971-87b649d2bc17?w=500&q=80&fit=crop"
};

// Render Host Venues (Sedes)
function renderVenues() {
  const container = document.getElementById('venuesContainer');
  if (!container) return;

  let html = '';
  
  STADIUMS.forEach(venue => {
    // Flag by country code
    let flag = '🇺🇸';
    if (venue.cc === 'mx') flag = '🇲🇽';
    if (venue.cc === 'ca') flag = '🇨🇦';

    // Count how many matches in this stadium
    const venueMatchesCount = MATCHES.filter(m => m.ground.toLowerCase().includes(venue.city.toLowerCase())).length;
    const imageUrl = VENUE_IMAGES[venue.name] || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500&q=80&fit=crop';

    html += `
      <div class="venue-card">
        <div class="venue-img-container">
          <div class="venue-img" style="background-image: url('${imageUrl}');"></div>
          <div class="venue-img-overlay"></div>
          <span class="venue-flag-badge">${flag} ${venue.cc.toUpperCase()}</span>
        </div>
        <div class="venue-info">
          <div class="venue-city">${venue.city}</div>
          <div class="venue-name">${venue.name}</div>
          
          <div class="venue-details">
            <div>Capacidad: <strong>${venue.capacity.toLocaleString()}</strong></div>
            <div>Partidos: <strong>${venueMatchesCount}</strong></div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Render Favorite Team Tracker view
function renderTracker() {
  // Render Selection grid
  const grid = document.getElementById('teamSelectGrid');
  if (grid) {
    let selectHtml = '';
    // Sort teams alphabetically
    const sortedTeams = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedTeams.forEach(team => {
      const isSelected = state.favoriteTeams.includes(team.name);
      selectHtml += `
        <div class="team-select-card ${isSelected ? 'selected' : ''}" 
          data-name="${team.name}" 
          onclick="toggleSelectCard(this)">
          <span class="team-select-flag">${team.flag_icon}</span>
          <span class="team-select-name">${team.name}</span>
        </div>
      `;
    });
    grid.innerHTML = selectHtml;
  }

  // Render favorite matches
  const trackerMatchesContainer = document.getElementById('trackerMatchesContainer');
  if (!trackerMatchesContainer) return;

  const standings = calculateStandings();
  const trackerMatches = [];

  MATCHES.forEach(match => {
    const isKnockout = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Match for third place', 'Final'].includes(match.round);
    
    // Resolve Team Names
    let t1Name = match.team1;
    let t2Name = match.team2;
    let t1Flag = '⚽';
    let t2Flag = '⚽';
    let t1Code = '';
    let t2Code = '';

    if (isKnockout) {
      const resolved1 = resolvePlaceholder(match.team1, standings);
      const resolved2 = resolvePlaceholder(match.team2, standings);
      t1Name = resolved1.name;
      t2Name = resolved2.name;
      t1Flag = resolved1.flag || '⚽';
      t2Flag = resolved2.flag || '⚽';
      t1Code = resolved1.code || '';
      t2Code = resolved2.code || '';
    } else {
      const team1Info = getTeamInfo(match.team1);
      const team2Info = getTeamInfo(match.team2);
      if (team1Info) { t1Flag = team1Info.flag_icon; t1Code = team1Info.fifa_code; }
      if (team2Info) { t2Flag = team2Info.flag_icon; t2Code = team2Info.fifa_code; }
    }

    const isFav = state.favoriteTeams.includes(t1Name) || state.favoriteTeams.includes(t2Name);
    
    if (isFav) {
      trackerMatches.push({
        ...match,
        t1Name, t2Name, t1Flag, t2Flag, t1Code, t2Code, isKnockout
      });
    }
  });

  if (trackerMatches.length === 0) {
    trackerMatchesContainer.innerHTML = `
      <div class="info-card">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        <div class="info-card-title">Sin partidos que mostrar</div>
        <div class="info-card-text">No seleccionaste ningún favorito o tus equipos seleccionados no tienen partidos programados con las llaves actuales.</div>
      </div>
    `;
    return;
  }

  // Render tracker matches
  let matchesHtml = '';
  trackerMatches.forEach(match => {
    const sim = state.simulatedScores[match.num];
    let s1Val = sim ? sim.s1 : (match.score1 !== undefined ? match.score1 : '');
    let s2Val = sim ? sim.s2 : (match.score2 !== undefined ? match.score2 : '');
    
    matchesHtml += `
      <div class="match-card ${sim !== undefined ? 'live' : ''}">
        <div class="match-info-header">
          <div class="match-info-group">
            ${match.group ? `Grupo ${match.group.replace('Group ', '')}` : match.round}
            <span style="color:var(--text-muted); font-size:10px;">#${match.num}</span>
          </div>
          <div class="match-info-venue">${match.ground}</div>
        </div>
        
        <div class="match-main-row">
          <!-- Team 1 Meta -->
          <div class="match-team-meta team1">
            <span class="team-flag">${match.t1Flag}</span>
            ${match.t1Code ? `<span class="team-code">${match.t1Code}</span>` : ''}
          </div>
          
          <!-- Scores Area -->
          <div class="match-score-area">
            <span class="score-box">${s1Val !== '' ? s1Val : '-'}</span>
            <span class="match-separator">:</span>
            <span class="score-box">${s2Val !== '' ? s2Val : '-'}</span>
          </div>
          
          <!-- Team 2 Meta -->
          <div class="match-team-meta team2">
            ${match.t2Code ? `<span class="team-code">${match.t2Code}</span>` : ''}
            <span class="team-flag">${match.t2Flag}</span>
          </div>
        </div>

        <div class="match-names-row">
          <span class="team-name-label team1" title="${match.t1Name}">${match.t1Name}</span>
          <span class="team-name-label team2" title="${match.t2Name}">${match.t2Name}</span>
        </div>

        <div class="match-teams-row" style="padding-top:4px; font-size:11px; color:var(--text-muted); border-top:1px solid var(--card-border)">
          <div>Fecha: ${match.date} &nbsp;|&nbsp; Hora: ${convertTimeToBA(match.time)}</div>
        </div>
      </div>
    `;
  });

  trackerMatchesContainer.innerHTML = matchesHtml;
}

// Toggle card selection in tracker list
window.toggleSelectCard = function(element) {
  element.classList.toggle('selected');
};

// Fetch live update from the Github repository
function fetchOnlineFixture() {
  const syncBtn = document.getElementById('syncBtn');
  
  fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('La respuesta de red no fue satisfactoria');
      }
      return response.json();
    })
    .then(data => {
      if (data && data.matches) {
        let updatedCount = 0;
        data.matches.forEach(newMatch => {
          const matchIndex = MATCHES.findIndex(m => m.num === newMatch.num);
          if (matchIndex !== -1) {
            // Check if score changed
            if (newMatch.score1 !== undefined && newMatch.score2 !== undefined) {
              if (MATCHES[matchIndex].score1 !== newMatch.score1 || MATCHES[matchIndex].score2 !== newMatch.score2) {
                MATCHES[matchIndex].score1 = newMatch.score1;
                MATCHES[matchIndex].score2 = newMatch.score2;
                updatedCount++;
              }
            }
          }
        });
        
        if (updatedCount > 0) {
          alert(`Se actualizaron ${updatedCount} partidos con resultados oficiales.`);
          renderActiveTab();
        } else {
          alert('No hay nuevos resultados oficiales disponibles.');
        }
      }
    })
    .catch(err => {
      console.error('Error al sincronizar fixture:', err);
      alert('Error de conexión al obtener actualizaciones.');
    })
    .finally(() => {
      if (syncBtn) syncBtn.style.animation = 'none';
    });
}