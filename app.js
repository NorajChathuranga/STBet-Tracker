// Global state
let summaryData = [];
let detailsData = [];
let winnerChartInstance = null;
let firstBallChartInstance = null;

// DOM Elements
const lastRefreshedTimeEl = document.getElementById('lastRefreshedTime');
const qsTotalMatchesEl = document.getElementById('qsTotalMatches');
const qsAvgRunsEl = document.getElementById('qsAvgRuns');
const statWinnerHomeEl = document.getElementById('statWinnerHome');
const stat1stBallOutEl = document.getElementById('stat1stBallOut');
const statRunsOUEl = document.getElementById('statRunsOU');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    // Refresh data every 60 seconds (for live client view)
    setInterval(fetchData, 60000);
});

// Switch between dashboard, summary, and details views
function switchView(viewId) {
    // Update active tab buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (viewId === 'dashboard') document.getElementById('btnDashboard').classList.add('active');
    if (viewId === 'summary') document.getElementById('btnSummary').classList.add('active');
    if (viewId === 'details') document.getElementById('btnDetails').classList.add('active');
    
    // Update active views
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`view${viewId.charAt(0).toUpperCase() + viewId.slice(1)}`).classList.add('active');
}

// Fetch JSON data files
async function fetchData() {
    try {
        const timestamp = new Date().getTime(); // Avoid browser cache
        const [sumRes, detRes] = await Promise.all([
            fetch(`data/summary.json?t=${timestamp}`).then(r => r.json()),
            fetch(`data/details.json?t=${timestamp}`).then(r => r.json())
        ]);
        
        summaryData = sumRes || [];
        detailsData = detRes || [];
        
        lastRefreshedTimeEl.innerText = new Date().toLocaleTimeString();
        
        // Process data and update dashboard
        processDashboardStats();
        populateRecentMatches();
        populateSummaryTable();
        populateDetailsTable();
        
        // Build filters dropdowns
        buildFilters();
        
        // Render charts
        renderWinnerChart();
        renderFirstBallChart();
        
    } catch (error) {
        console.error('Error fetching data:', error);
        lastRefreshedTimeEl.innerText = 'Fetch Error';
    }
}

// Helper to calculate Mode (Most common value)
function getMode(arr) {
    if (arr.length === 0) return 'N/A';
    const modeMap = {};
    let maxEl = arr[0], maxCount = 1;
    for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el === null || el === undefined || el === '' || el === 'N/A') continue;
        if (modeMap[el] == null) modeMap[el] = 1;
        else modeMap[el]++;
        if (modeMap[el] > maxCount) {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    return maxEl;
}

// Process stats for Dashboard Card values
function processDashboardStats() {
    const total = summaryData.length;
    qsTotalMatchesEl.innerText = total;
    
    if (total === 0) {
        qsAvgRunsEl.innerText = '-';
        statWinnerHomeEl.innerText = 'N/A';
        stat1stBallOutEl.innerText = 'N/A';
        statRunsOUEl.innerText = 'N/A';
        return;
    }
    
    // Calculate Average runs from total_runs_ou string (e.g. "Over - 15.5" -> Over won, line is 15.5)
    // Wait, the API doesn't output the actual score directly, but we can extract the O/U line
    let runsSum = 0;
    let runsCount = 0;
    summaryData.forEach(row => {
        const str = row.total_runs_ou;
        if (str && str !== 'N/A') {
            const parts = str.split(' - ');
            if (parts.length > 0) {
                // e.g. "17.5"
                const lineStr = parts[0]; 
                const val = parseFloat(lineStr);
                if (!isNaN(val)) {
                    runsSum += val;
                    runsCount++;
                }
            }
        }
    });
    const avgRuns = runsCount > 0 ? (runsSum / runsCount).toFixed(1) : 'N/A';
    qsAvgRunsEl.innerText = avgRuns;
    
    // Modes
    const winners = summaryData.map(row => row.winner);
    const ball1sts = summaryData.map(row => row.first_ball_1st_innings);
    const runOUs = summaryData.map(row => {
        // e.g. "17.5 - Over" -> we want the outcome: "Over" or "Under"
        const str = row.total_runs_ou;
        if (str && str !== 'N/A') {
            const parts = str.split(' - ');
            return parts[1] || 'N/A';
        }
        return 'N/A';
    });
    
    statWinnerHomeEl.innerText = getMode(winners);
    stat1stBallOutEl.innerText = getMode(ball1sts);
    
    const runMode = getMode(runOUs);
    statRunsOUEl.innerText = runMode !== 'N/A' ? `${runMode}` : 'N/A';
}

// Populate Recent Matches (last 5 matches) on Dashboard
function populateRecentMatches() {
    const tableBody = document.querySelector('#recentMatchesTable tbody');
    tableBody.innerHTML = '';
    
    // Sort and grab last 5
    const sorted = [...summaryData].reverse().slice(0, 5);
    
    if (sorted.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No matches tracked yet.</td></tr>';
        return;
    }
    
    sorted.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${row.date}</strong> <span class="text-muted" style="font-size:11px;">${row.time}</span></td>
            <td>${row.match_name}</td>
            <td><span class="winner-badge">${row.winner}</span></td>
            <td class="cell-highlight-yellow">${row.first_ball_1st_innings}</td>
            <td class="cell-highlight-yellow">${row.first_ball_2nd_innings}</td>
            <td>${row.total_runs_ou}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Populate main Summary Table
function populateSummaryTable() {
    const tableBody = document.querySelector('#summaryTable tbody');
    tableBody.innerHTML = '';
    
    if (summaryData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted">No summary data available.</td></tr>';
        return;
    }
    
    // Display in reverse chronological order (newest first)
    const sorted = [...summaryData].reverse();
    
    sorted.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.date}</td>
            <td class="text-muted">${row.time}</td>
            <td><strong>${row.match_name}</strong></td>
            <td><span class="winner-badge">${row.winner}</span></td>
            <td class="cell-highlight-yellow">${row.first_ball_1st_innings}</td>
            <td class="cell-highlight-yellow">${row.first_ball_2nd_innings}</td>
            <td>${row.total_runs_ou}</td>
            <td>${row.total_4s_ou}</td>
            <td>${row.total_6s_ou}</td>
            <td>${row.most_4s}</td>
            <td>${row.most_6s}</td>
            <td>${row.wickets_lost_ou}</td>
            <td style="font-family:monospace; font-size:11px;">${row.meeting_code}</td>
        `;
        tableBody.appendChild(tr);
    });
    
    document.getElementById('summaryCount').innerText = `${summaryData.length} matches`;
}

// Populate Details Table
function populateDetailsTable() {
    const tableBody = document.querySelector('#detailsTable tbody');
    tableBody.innerHTML = '';
    
    if (detailsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No selection records available.</td></tr>';
        return;
    }
    
    // Sort details newest first
    const sorted = [...detailsData].reverse();
    
    sorted.forEach(row => {
        const tr = document.createElement('tr');
        
        // Highlight row in soft green if winner in 1st ball outcome
        const isFirstBallOutcome = row.event_name === '1st Innings 1st Ball Outcome' || row.event_name === '2nd Innings 1st Ball Outcome';
        const isWinner = parseInt(row.result_position) === 1;
        const rowClass = (isFirstBallOutcome && isWinner) ? 'class="cell-highlight-green"' : '';
        
        tr.innerHTML = `
            <td ${rowClass}>${row.date} <span class="text-muted" style="font-size:11px;">${row.time}</span></td>
            <td ${rowClass}>${row.match_name}</td>
            <td ${rowClass}><strong>${row.event_name}</strong></td>
            <td ${rowClass}>${row.selection_name}</td>
            <td ${rowClass}>${row.selection_number}</td>
            <td ${rowClass} style="font-weight:600;">${row.last_odd}</td>
            <td ${rowClass}>${row.result_position}</td>
            <td ${rowClass} style="color:${isWinner ? '#10b981' : 'inherit'}; font-weight:${isWinner ? '700' : 'normal'}">${row.win_amount || '-'}</td>
            <td ${rowClass} style="font-family:monospace; font-size:11px;">${row.meeting_code}</td>
        `;
        tableBody.appendChild(tr);
    });
    
    document.getElementById('detailsCount').innerText = `${detailsData.length} records`;
}

// Build dropdown filters dynamically
function buildFilters() {
    // 1. Summary Filters
    const filterWinner = document.getElementById('filterWinner');
    const filter1stBall = document.getElementById('filter1stBall');
    
    const uniqueWinners = [...new Set(summaryData.map(r => r.winner).filter(Boolean))].sort();
    const unique1stBalls = [...new Set(summaryData.map(r => r.first_ball_1st_innings).filter(Boolean))].sort();
    
    // Clear dynamic options but keep "All"
    filterWinner.innerHTML = '<option value="all">All Winners</option>';
    filter1stBall.innerHTML = '<option value="all">All Outcomes</option>';
    
    uniqueWinners.forEach(w => {
        if(w !== 'N/A') filterWinner.innerHTML += `<option value="${w}">${w}</option>`;
    });
    unique1stBalls.forEach(b => {
        if(b !== 'N/A') filter1stBall.innerHTML += `<option value="${b}">${b}</option>`;
    });
    
    // 2. Details Filters
    const filterEventName = document.getElementById('filterEventName');
    const uniqueEvents = [...new Set(detailsData.map(r => r.event_name).filter(Boolean))].sort();
    
    filterEventName.innerHTML = '<option value="all">All Event Types</option>';
    uniqueEvents.forEach(e => {
        filterEventName.innerHTML += `<option value="${e}">${e}</option>`;
    });
}

// Filter Summary Table on input
function filterSummaryTable() {
    const searchVal = document.getElementById('searchSummary').value.toLowerCase();
    const winnerVal = document.getElementById('filterWinner').value;
    const firstBallVal = document.getElementById('filter1stBall').value;
    
    const tableRows = document.querySelectorAll('#summaryTable tbody tr');
    let visibleCount = 0;
    
    // We iterate backwards through rows because summaryTable is rendered in reverse sorted order
    // But it's easier to iterate through summaryData and build matches, then toggle rows.
    // Instead of hiding tr elements manually, let's filter the data array and rebuild the tbody.
    const filtered = summaryData.filter(row => {
        const matchesSearch = row.match_name.toLowerCase().includes(searchVal) ||
                            row.date.toLowerCase().includes(searchVal) ||
                            row.meeting_code.toLowerCase().includes(searchVal) ||
                            row.winner.toLowerCase().includes(searchVal);
        
        const matchesWinner = winnerVal === 'all' || row.winner === winnerVal;
        const matches1stBall = firstBallVal === 'all' || row.first_ball_1st_innings === firstBallVal;
        
        return matchesSearch && matchesWinner && matches1stBall;
    });
    
    const tableBody = document.querySelector('#summaryTable tbody');
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="13" class="text-center text-muted">No matching results.</td></tr>';
    } else {
        const sorted = [...filtered].reverse();
        sorted.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.date}</td>
                <td class="text-muted">${row.time}</td>
                <td><strong>${row.match_name}</strong></td>
                <td><span class="winner-badge">${row.winner}</span></td>
                <td class="cell-highlight-yellow">${row.first_ball_1st_innings}</td>
                <td class="cell-highlight-yellow">${row.first_ball_2nd_innings}</td>
                <td>${row.total_runs_ou}</td>
                <td>${row.total_4s_ou}</td>
                <td>${row.total_6s_ou}</td>
                <td>${row.most_4s}</td>
                <td>${row.most_6s}</td>
                <td>${row.wickets_lost_ou}</td>
                <td style="font-family:monospace; font-size:11px;">${row.meeting_code}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    document.getElementById('summaryCount').innerText = `${filtered.length} matches`;
}

// Filter Details Table
function filterDetailsTable() {
    const searchVal = document.getElementById('searchDetails').value.toLowerCase();
    const eventVal = document.getElementById('filterEventName').value;
    const resultPosVal = document.getElementById('filterResultPos').value;
    
    const filtered = detailsData.filter(row => {
        const matchesSearch = row.match_name.toLowerCase().includes(searchVal) ||
                            row.selection_name.toLowerCase().includes(searchVal) ||
                            row.event_name.toLowerCase().includes(searchVal) ||
                            row.meeting_code.toLowerCase().includes(searchVal);
                            
        const matchesEvent = eventVal === 'all' || row.event_name === eventVal;
        
        let matchesResultPos = true;
        if (resultPosVal === '1') {
            matchesResultPos = parseInt(row.result_position) === 1;
        } else if (resultPosVal === '2') {
            matchesResultPos = parseInt(row.result_position) > 1;
        }
        
        return matchesSearch && matchesEvent && matchesResultPos;
    });
    
    const tableBody = document.querySelector('#detailsTable tbody');
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No matching details.</td></tr>';
    } else {
        const sorted = [...filtered].reverse();
        sorted.forEach(row => {
            const tr = document.createElement('tr');
            const isFirstBallOutcome = row.event_name === '1st Innings 1st Ball Outcome' || row.event_name === '2nd Innings 1st Ball Outcome';
            const isWinner = parseInt(row.result_position) === 1;
            const rowClass = (isFirstBallOutcome && isWinner) ? 'class="cell-highlight-green"' : '';
            
            tr.innerHTML = `
                <td ${rowClass}>${row.date} <span class="text-muted" style="font-size:11px;">${row.time}</span></td>
                <td ${rowClass}>${row.match_name}</td>
                <td ${rowClass}><strong>${row.event_name}</strong></td>
                <td ${rowClass}>${row.selection_name}</td>
                <td ${rowClass}>${row.selection_number}</td>
                <td ${rowClass} style="font-weight:600;">${row.last_odd}</td>
                <td ${rowClass}>${row.result_position}</td>
                <td ${rowClass} style="color:${isWinner ? '#10b981' : 'inherit'}; font-weight:${isWinner ? '700' : 'normal'}">${row.win_amount || '-'}</td>
                <td ${rowClass} style="font-family:monospace; font-size:11px;">${row.meeting_code}</td>
            `;
            tableBody.appendChild(tr);
        });
    }
    
    document.getElementById('detailsCount').innerText = `${filtered.length} records`;
}

// Render Winner Distribution Bar Chart
function renderWinnerChart() {
    const ctx = document.getElementById('winnerChart').getContext('2d');
    
    const winnerCounts = {};
    summaryData.forEach(row => {
        const w = row.winner;
        if (w && w !== 'N/A') {
            winnerCounts[w] = (winnerCounts[w] || 0) + 1;
        }
    });
    
    const labels = Object.keys(winnerCounts);
    const data = Object.values(winnerCounts);
    
    if (winnerChartInstance) {
        winnerChartInstance.destroy();
    }
    
    winnerChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Wins Count',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.65)',
                borderColor: '#3b82f6',
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: '#2b395b' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

// Render 1st Ball Outcomes Donut Chart (combined 1st and 2nd innings)
function renderFirstBallChart() {
    const ctx = document.getElementById('firstBallChart').getContext('2d');
    
    const ballCounts = {};
    summaryData.forEach(row => {
        const b1 = row.first_ball_1st_innings;
        const b2 = row.first_ball_2nd_innings;
        
        if (b1 && b1 !== 'N/A') ballCounts[b1] = (ballCounts[b1] || 0) + 1;
        if (b2 && b2 !== 'N/A') ballCounts[b2] = (ballCounts[b2] || 0) + 1;
    });
    
    const labels = Object.keys(ballCounts);
    const data = Object.values(ballCounts);
    
    if (firstBallChartInstance) {
        firstBallChartInstance.destroy();
    }
    
    firstBallChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#10b981', // emerald
                    '#fbbf24', // yellow
                    '#a855f7', // purple
                    '#f97316', // orange
                    '#3b82f6', // blue
                    '#ef4444'  // red
                ],
                borderWidth: 1,
                borderColor: '#131a2c'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8' }
                }
            }
        }
    });
}
