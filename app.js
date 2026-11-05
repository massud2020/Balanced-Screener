let currentTab = 'open';
let currentTimeFilter = 'all';
let myStrategyChart = null;

function switchHistoryTab(tab) {
    currentTab = tab;
    document.getElementById('btnOpen').classList.toggle('active', tab === 'open');
    document.getElementById('btnClosed').classList.toggle('active', tab === 'closed');
    refreshUI();
}

function setTimeFilter(filterType, btnElement) {
    currentTimeFilter = filterType;
    document.querySelectorAll('.filter-time-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    refreshUI();
}

function getFilteredSignalsByTime() {
    const signals = screenerManager.getAllSignals();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;

    return signals.filter(s => {
        const signalTime = s.timestamp || now;
        if (currentTimeFilter === 'today') {
            return (now - signalTime) <= oneDay;
        } else if (currentTimeFilter === 'week') {
            return (now - signalTime) <= oneWeek;
        }
        return true;
    });
}

function updatePnLSummaryUI() {
    const timeFiltered = getFilteredSignalsByTime();
    const closedSignals = timeFiltered.filter(s => s.status === 'closed_win' || s.status === 'closed_loss');

    let totalPoints = 0;
    let totalWins = 0;
    let totalLosses = 0;

    closedSignals.forEach(s => {
        if (s.status === 'closed_win') {
            totalWins++;
            totalPoints += Math.abs(s.targetPrice - s.entryPrice);
        } else {
            totalLosses++;
            totalPoints -= Math.abs(s.entryPrice - s.stopLoss);
        }
    });

    const totalClosed = closedSignals.length;
    const overallWinRate = totalClosed > 0 ? ((totalWins / totalClosed) * 100).toFixed(1) + '%' : '۰٪';

    const pointsElement = document.getElementById('totalNetPoints');
    pointsElement.textContent = totalPoints.toLocaleString() + ' امتیاز';
    pointsElement.style.color = totalPoints >= 0 ? '#4ade80' : '#f87171';

    document.getElementById('winLossCounts').textContent = `${totalWins} برد / ${totalLosses} باخت`;
    document.getElementById('totalWinRate').textContent = overallWinRate;
}

function renderSignalHistoryUI() {
    const container = document.getElementById('signalsContainer');
    const allSignals = screenerManager.getAllSignals();
    const timeFiltered = getFilteredSignalsByTime();

    document.getElementById('openCount').textContent = allSignals.filter(s => s.status === 'open').length;
    document.getElementById('closedCount').textContent = allSignals.filter(s => s.status !== 'open').length;

    const finalFiltered = timeFiltered.filter(s => {
        if (currentTab === 'open') return s.status === 'open';
        return s.status === 'closed_win' || s.status === 'closed_loss';
    });

    if (finalFiltered.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: #94a3b8; padding: 20px;">هیچ سیگنالی در این بخش یافت نشد.</p>`;
        return;
    }

    let html = '';
    finalFiltered.forEach(s => {
        let statusClass = s.status === 'open' ? 'open' : (s.status === 'closed_win' ? 'win' : 'loss');
        let statusText = s.status === 'open' ? '🟢 در جریان (باز)' : (s.status === 'closed_win' ? '🎯 حد سود (برد)' : '🛑 حد ضرر (باخت)');
        
        html += `
            <div class="signal-card ${statusClass}">
                <div class="signal-header">
                    <span><strong>${s.symbol}</strong> (${s.type})</span>
                    <span class="strategy-badge">${s.strategyName}</span>
                </div>
                <div class="signal-details">
                    <p>📅 زمان: ${s.datetime}</p>
                    <p>📥 قیمت ورود: <strong>${s.entryPrice.toLocaleString()} تومان</strong></p>
                    <p>🎯 حد سود (TP): <span style="color: #4ade80;">${s.targetPrice.toLocaleString()} تومان</span></p>
                    <p>🛑 حد ضرر (SL): <span style="color: #f87171;">${s.stopLoss.toLocaleString()} تومان</span></p>
                    ${s.closePrice ? `<p>🏁 قیمت بسته شدن: <strong>${s.closePrice.toLocaleString()} تومان</strong></p>` : ''}
                    <p style="margin-top: 8px; font-weight: bold; color: ${s.status === 'closed_win' ? '#4ade80' : (s.status === 'closed_loss' ? '#f87171' : '#38bdf8')}">
                        وضعیت: ${statusText}
                    </p>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderStrategyChart() {
    const timeFiltered = getFilteredSignalsByTime();
    const stats = screenerManager.calculateStrategiesPerformance(timeFiltered);
    
    const labels = [];
    const winRates = [];

    for (let key in stats) {
        labels.push(stats[key].name);
        winRates.push(parseFloat(stats[key].winRate));
    }

    const ctx = document.getElementById('strategyPerformanceChart').getContext('2d');
    
    if (myStrategyChart) {
        myStrategyChart.destroy();
    }

    myStrategyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length > 0 ? labels : ['بدون داده'],
            datasets: [{
                label: 'درصد موفقیت استراتژی (Win Rate %)',
                data: winRates.length > 0 ? winRates : [0],
                backgroundColor: '#3b82f6',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    max: 100,
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                x: { 
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                }
            }
        }
    });
}

function refreshUI() {
    renderSignalHistoryUI();
    renderStrategyChart();
    updatePnLSummaryUI();
}

window.addEventListener('DOMContentLoaded', () => {
    refreshUI();
});

window.addEventListener('signalsUpdated', () => {
    refreshUI();
});
