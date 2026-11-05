class BalancedScreenerManager {
    constructor() {
        this.storageKey = 'screener_signals';
        this.ringtoneKey = 'selected_ringtone';
    }

    saveNewSignal(signalData) {
        let signals = this.getAllSignals();
        
        const newSignal = {
            id: 'sig_' + Date.now(),
            symbol: signalData.symbol,
            type: signalData.type,
            strategyName: signalData.strategyName,
            strategyKey: signalData.strategyKey,
            entryPrice: Number(signalData.entryPrice),
            targetPrice: Number(signalData.targetPrice),
            stopLoss: Number(signalData.stopLoss),
            status: 'open',
            timestamp: Date.now(),
            datetime: new Date().toLocaleDateString('fa-IR') + ' - ' + new Date().toLocaleTimeString('fa-IR', {hour: '2-digit', minute:'2-digit'})
        };

        signals.push(newSignal);
        localStorage.setItem(this.storageKey, JSON.stringify(signals));
        window.dispatchEvent(new CustomEvent('signalsUpdated'));
        return newSignal;
    }

    getAllSignals() {
        return JSON.parse(localStorage.getItem(this.storageKey)) || [];
    }

    checkMarketPricesAndAutoClose(liveMarketPrices) {
        let signals = this.getAllSignals();
        let isUpdated = false;

        signals.forEach(signal => {
            if (signal.status !== 'open') return;

            const currentPrice = liveMarketPrices[signal.symbol];
            if (!currentPrice) return;

            if (signal.type === 'خرید' || signal.type === 'BUY') {
                if (currentPrice >= signal.targetPrice) {
                    signal.status = 'closed_win';
                    signal.closePrice = currentPrice;
                    isUpdated = true;
                    this.triggerAlertAndLog(signal, 'win');
                } else if (currentPrice <= signal.stopLoss) {
                    signal.status = 'closed_loss';
                    signal.closePrice = currentPrice;
                    isUpdated = true;
                    this.triggerAlertAndLog(signal, 'loss');
                }
            } 
            else if (signal.type === 'فروش' || signal.type === 'SELL') {
                if (currentPrice <= signal.targetPrice) {
                    signal.status = 'closed_win';
                    signal.closePrice = currentPrice;
                    isUpdated = true;
                    this.triggerAlertAndLog(signal, 'win');
                } else if (currentPrice >= signal.stopLoss) {
                    signal.status = 'closed_loss';
                    signal.closePrice = currentPrice;
                    isUpdated = true;
                    this.triggerAlertAndLog(signal, 'loss');
                }
            }
        });

        if (isUpdated) {
            localStorage.setItem(this.storageKey, JSON.stringify(signals));
            window.dispatchEvent(new CustomEvent('signalsUpdated'));
        }
    }

    playSelectedRingtone() {
        const savedRingtone = localStorage.getItem(this.ringtoneKey) || './assets/sounds/bell.mp3';
        const audio = new Audio(savedRingtone);
        audio.play().catch(err => console.log("خطا در پخش صدای هشدار:", err));
    }

    triggerAlertAndLog(signal, result) {
        this.playSelectedRingtone();
    }

    calculateStrategiesPerformance(signalsList = null) {
        const signals = signalsList || this.getAllSignals();
        const closedSignals = signals.filter(s => s.status === 'closed_win' || s.status === 'closed_loss');
        let stats = {};

        closedSignals.forEach(signal => {
            const key = signal.strategyKey;
            if (!stats[key]) {
                stats[key] = {
                    name: signal.strategyName,
                    totalClosed: 0,
                    wins: 0,
                    losses: 0,
                    netPoints: 0
                };
            }

            stats[key].totalClosed++;

            if (signal.status === 'closed_win') {
                stats[key].wins++;
                stats[key].netPoints += Math.abs(signal.targetPrice - signal.entryPrice);
            } else {
                stats[key].losses++;
                stats[key].netPoints -= Math.abs(signal.entryPrice - signal.stopLoss);
            }
        });

        for (let key in stats) {
            let item = stats[key];
            item.winRate = item.totalClosed > 0 ? ((item.wins / item.totalClosed) * 100).toFixed(1) + '%' : '0%';
        }

        return stats;
    }
}

const screenerManager = new BalancedScreenerManager();
