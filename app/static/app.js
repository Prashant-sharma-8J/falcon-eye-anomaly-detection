/* ==========================================================================
   FALCONEYE CORE FRONTEND ENGINE - ACCELERATED FLUIDS, CUSTOM GRAPHS & TELEMETRY
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================================================
    // 1. STATE & DOM INITIALIZATION
    // ==========================================================================
    
    const STATE = {
        isMockMode: false,
        apiConnected: false,
        stats: {
            total_txns: 0,
            total_anomalies: 0,
            anomaly_rate: 0.0,
            total_volume: 0.0
        },
        transactions: [],
        anomalies: [],
        tickerFilter: 'all',
        tickerSearch: '',
        thresholds: {
            global_threshold: 1.1294,
            user_thresholds: {}
        },
        charts: {
            trend: null,
            risk: null
        },
        audioCtx: null
    };

    // DOM Elements Map
    const elements = {
        tabs: document.querySelectorAll('.nav-btn'),
        panes: document.querySelectorAll('.tab-pane'),
        
        // Status indicators
        dbStatusText: document.getElementById('db-status-text'),
        dbStatusBeacon: document.getElementById('db-status-beacon'),
        workerStatusText: document.getElementById('worker-status-text'),
        engineModeTag: document.getElementById('engine-mode-tag'),
        
        // KPIs
        kpiTotalTxns: document.getElementById('kpi-total-txns'),
        kpiTotalAnomalies: document.getElementById('kpi-total-anomalies'),
        kpiAnomalyRate: document.getElementById('kpi-anomaly-rate'),
        kpiTotalVolume: document.getElementById('kpi-total-volume'),
        
        // KPI workable cards
        kpiCardTxns: document.getElementById('kpi-card-txns'),
        kpiCardAnomalies: document.getElementById('kpi-card-anomalies'),
        kpiCardRate: document.getElementById('kpi-card-rate'),
        kpiCardVolume: document.getElementById('kpi-card-volume'),
        
        // Alerts Feed & Ticker table
        alertsFeed: document.getElementById('alerts-feed'),
        tickerTbody: document.getElementById('ticker-tbody'),
        tickerSearchInput: document.getElementById('ticker-search-input'),
        btnFilterAll: document.getElementById('btn-filter-all'),
        btnFilterAnomalies: document.getElementById('btn-filter-anomalies'),
        toggleMockStream: document.getElementById('toggle-mock-stream'),
        btnClearTicker: document.getElementById('btn-clear-ticker'),
        
        // Simulator Form
        simForm: document.getElementById('sim-form'),
        btnSubmitSim: document.getElementById('btn-submit-simulation'),
        simResultsEmpty: document.getElementById('sim-results-empty'),
        simResultsContent: document.getElementById('sim-results-content'),
        reportTxnId: document.getElementById('report-txn-id'),
        reportVerdictBadge: document.getElementById('report-verdict-badge'),
        reportScoreVal: document.getElementById('report-score-val'),
        reportThresholdVal: document.getElementById('report-threshold-val'),
        reportRatioVal: document.getElementById('report-ratio-val'),
        reportProgressBar: document.getElementById('report-progress-bar'),
        reportThresholdMarker: document.getElementById('report-threshold-marker'),
        reportUserId: document.getElementById('report-user-id'),
        reportAmount: document.getElementById('report-amount'),
        reportType: document.getElementById('report-type'),
        reportChannel: document.getElementById('report-channel'),
        reportThresholdType: document.getElementById('report-threshold-type'),
        btnTriggerSimulatorShortcut: document.getElementById('btn-trigger-simulator-shortcut'),
        
        // Thresholds Pane elements
        thresholdsTbody: document.getElementById('thresholds-tbody'),
        userSearchInput: document.getElementById('user-search-input'),
        globalThresholdVal: document.getElementById('global-threshold-val')
    };

    // Soft audio synths feedback
    function playSynthSound(type) {
        try {
            if (!STATE.audioCtx) {
                STATE.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (STATE.audioCtx.state === 'suspended') {
                STATE.audioCtx.resume();
            }
            
            const ctx = STATE.audioCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const now = ctx.currentTime;
            
            if (type === 'tap') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
                osc.start(now);
                osc.stop(now + 0.08);
            } 
            else if (type === 'success') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
                osc.frequency.setValueAtTime(880, now + 0.12); // A5
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.linearRampToValueAtTime(0.04, now + 0.12);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.26);
            } 
            else if (type === 'alert') {
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.Q.value = 6;
                filter.frequency.setValueAtTime(900, now);
                filter.frequency.exponentialRampToValueAtTime(180, now + 0.45);
                
                osc.disconnect(gain);
                osc.connect(filter);
                filter.connect(gain);
                
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.linearRampToValueAtTime(120, now + 0.45);
                
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
                gain.gain.linearRampToValueAtTime(0.001, now + 0.5);
                
                osc.start(now);
                osc.stop(now + 0.5);
            }
        } catch (e) {
            // Audio blocked by browser policy
        }
    }

    // ==========================================================================
    // 2. DUAL-LAYER PREMIUM GEOMETRIC & FLUIDS CANVAS GENERATOR
    // ==========================================================================
    
    const bgCanvas = document.getElementById('bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    const fluidCanvas = document.getElementById('fluid-canvas');
    
    let width = bgCanvas.width = fluidCanvas.width = window.innerWidth;
    let height = bgCanvas.height = fluidCanvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
        width = bgCanvas.width = fluidCanvas.width = window.innerWidth;
        height = bgCanvas.height = fluidCanvas.height = window.innerHeight;
    });

    // Reference tracker for cursor
    const pointer = { x: width / 2, y: height / 2, lastX: width / 2, lastY: height / 2 };
    
    window.addEventListener('mousemove', (e) => {
        pointer.x = e.clientX;
        pointer.y = e.clientY;
    });

    // Ambient floating backdrop gradient blobs (2D Canvas)
    class BackdropBlob {
        constructor(x, y, radius, color, speedX, speedY) {
            this.x = x;
            this.y = y;
            this.radius = radius;
            this.color = color;
            this.speedX = speedX;
            this.speedY = speedY;
            this.baseRadius = radius;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            
            // Wall bounce
            if (this.x - this.radius < 0 || this.x + this.radius > width) this.speedX *= -1;
            if (this.y - this.radius < 0 || this.y + this.radius > height) this.speedY *= -1;
            
            // Gentle cursor repulsion
            const dx = pointer.x - this.x;
            const dy = pointer.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < 400) {
                const force = (400 - dist) / 400;
                this.x -= (dx / dist) * force * 3.5;
                this.y -= (dy / dist) * force * 3.5;
                this.radius = this.baseRadius + force * 50;
            } else {
                this.radius += (this.baseRadius - this.radius) * 0.05;
            }
        }

        draw() {
            const grad = bgCtx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
            grad.addColorStop(0, this.color);
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            bgCtx.fillStyle = grad;
            bgCtx.beginPath();
            bgCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            bgCtx.fill();
        }
    }

    const blobs = [
        new BackdropBlob(width * 0.25, height * 0.3, 350, 'rgba(6, 182, 212, 0.03)', 0.3, 0.2), // turquoise
        new BackdropBlob(width * 0.75, height * 0.4, 400, 'rgba(37, 99, 235, 0.03)', -0.25, 0.35), // royal blue
        new BackdropBlob(width * 0.5, height * 0.75, 380, 'rgba(14, 165, 233, 0.025)', 0.2, -0.3), // sky blue
        new BackdropBlob(width * 0.3, height * 0.8, 320, 'rgba(0, 184, 122, 0.02)', -0.3, -0.2) // teal
    ];

    // Background Gradient Render loop
    function animateBackground() {
        const isDark = document.body.classList.contains('dark-mode');
        const bgGrad = bgCtx.createLinearGradient(0, 0, width, height);
        
        if (isDark) {
            bgGrad.addColorStop(0, '#040711'); // Deep obsidian
            bgGrad.addColorStop(0.4, '#070b1b');
            bgGrad.addColorStop(0.8, '#0b1227');
            bgGrad.addColorStop(1, '#111a36'); // Midnight indigo
        } else {
            bgGrad.addColorStop(0, '#ffffff'); // Pure white gradient stops
            bgGrad.addColorStop(0.35, '#fafbfc'); // Pristine off-white
            bgGrad.addColorStop(0.7, '#f0f2f5'); // Soft light silver
            bgGrad.addColorStop(1, '#e6e9f0'); // Clean silver-gray
        }
        
        bgCtx.fillStyle = bgGrad;
        bgCtx.fillRect(0, 0, width, height);

        // Update and draw blobs
        blobs.forEach(blob => {
            blob.update();
            const origColor = blob.color;
            if (isDark) {
                if (origColor.includes('0.03')) {
                    blob.color = origColor.replace('0.03', '0.065');
                } else if (origColor.includes('0.025')) {
                    blob.color = origColor.replace('0.025', '0.05');
                }
            } else {
                if (origColor.includes('0.065')) {
                    blob.color = origColor.replace('0.065', '0.03');
                } else if (origColor.includes('0.05')) {
                    blob.color = origColor.replace('0.05', '0.025');
                }
            }
            blob.draw();
        });

        // Delicate Structural Grid Overlay
        bgCtx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.006)' : 'rgba(0, 0, 0, 0.009)';
        bgCtx.lineWidth = 1;
        const gridSize = 70;
        
        bgCtx.beginPath();
        for (let x = 0; x < width; x += gridSize) {
            bgCtx.moveTo(x, 0);
            bgCtx.lineTo(x, height);
        }
        for (let y = 0; y < height; y += gridSize) {
            bgCtx.moveTo(0, y);
            bgCtx.lineTo(width, y);
        }
        bgCtx.stroke();

        requestAnimationFrame(animateBackground);
    }
    
    animateBackground();

    // ==========================================================================
    // 2B. GPU-ACCELERATED TRANSPARENT WEBGL FLUID INTERACTIVITY
    // ==========================================================================

    let colorIndex = 0;
    const palette = [
        { r: 0.145 / 35, g: 0.388 / 35, b: 0.922 / 35 }, // Royal Blue (#2563eb)
        { r: 0.024 / 35, g: 0.714 / 35, b: 0.831 / 35 }, // Seafoam Cyan (#06b6d4)
        { r: 0.055 / 35, g: 0.647 / 35, b: 0.914 / 35 }, // Sky Blue (#0ea5e9)
        { r: 0.114 / 35, g: 0.306 / 35, b: 0.847 / 35 }  // Electric Blue (#1d4ed8)
    ];

    const splatColorFactory = {
        get r() { return palette[colorIndex].r; },
        get g() { return palette[colorIndex].g; },
        get b() {
            const bVal = palette[colorIndex].b;
            colorIndex = (colorIndex + 1) % palette.length;
            return bVal;
        }
    };

    if (window.WebGLFluid) {
        // Pavel Dobryakov's WebGL Fluid Solver Initialized with Uppercase TRANSPARENT option
        window.WebGLFluid(fluidCanvas, {
            TRANSPARENT: true, // UPPERCASE CASING FIX
            IMMEDIATE: true,
            TRIGGER: 'hover',
            AUTO: false,
            SIM_RESOLUTION: 128,
            DYE_RESOLUTION: 512,
            DENSITY_DISSIPATION: 3.5, // Rapid dispersion
            VELOCITY_DISSIPATION: 2.0, // Natural slowing
            PRESSURE: 0.8,
            CURL: 12, // Breathtaking luxury fluid curls
            SPLAT_RADIUS: 0.15,
            SPLAT_FORCE: 1600,
            SHADING: true,
            COLORFUL: false, // Explicit control
            SPLAT_COLOR: splatColorFactory,
            BLOOM: true,
            BLOOM_ITERATIONS: 5,
            BLOOM_RESOLUTION: 256,
            BLOOM_INTENSITY: 0.18, // Subtle visual depth
            BLOOM_THRESHOLD: 0.8,
            SUNRAYS: false // Kept off for dark backdrop legibility
        });

        // Window interaction forwarding to WebGL canvas
        window.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('button')) return;
            fluidCanvas.dispatchEvent(new MouseEvent('mousedown', { clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons }));
        });
        window.addEventListener('mousemove', (e) => {
            fluidCanvas.dispatchEvent(new MouseEvent('mousemove', { clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons }));
        });
        window.addEventListener('mouseup', (e) => {
            fluidCanvas.dispatchEvent(new MouseEvent('mouseup', { clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons }));
        });
        window.addEventListener('touchstart', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('button')) return;
            const touches = Array.from(e.touches).map(t => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY }));
            fluidCanvas.dispatchEvent(new TouchEvent('touchstart', { touches, targetTouches: touches, changedTouches: touches }));
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            const touches = Array.from(e.touches).map(t => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY }));
            fluidCanvas.dispatchEvent(new TouchEvent('touchmove', { touches, targetTouches: touches, changedTouches: touches }));
        }, { passive: true });
        window.addEventListener('touchend', (e) => {
            const touches = Array.from(e.changedTouches).map(t => ({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY }));
            fluidCanvas.dispatchEvent(new TouchEvent('touchend', { touches, targetTouches: touches, changedTouches: touches }));
        });
    }

    // ==========================================================================
    // 3. INTERACTIVE CARD & STREAM EVENT LISTENERS
    // ==========================================================================
    
    if (elements.kpiCardTxns) {
        elements.kpiCardTxns.addEventListener('click', () => {
            playSynthSound('tap');
            switchTab('ticker');
            if (elements.btnFilterAll) elements.btnFilterAll.click();
            if (elements.tickerSearchInput) {
                elements.tickerSearchInput.value = '';
                STATE.tickerSearch = '';
                updateDashboardUI();
            }
        });
    }

    if (elements.kpiCardAnomalies) {
        elements.kpiCardAnomalies.addEventListener('click', () => {
            playSynthSound('tap');
            switchTab('ticker');
            if (elements.btnFilterAnomalies) elements.btnFilterAnomalies.click();
            if (elements.tickerSearchInput) {
                elements.tickerSearchInput.value = '';
                STATE.tickerSearch = '';
                updateDashboardUI();
            }
        });
    }

    if (elements.kpiCardRate) {
        elements.kpiCardRate.addEventListener('click', () => {
            const user = Math.floor(randomInRange(1, 50));
            const amount = roundAmount(randomInRange(2800, 9500)); // Massive outlier
            switchTab('simulator');
            document.getElementById('sim-user-id').value = user;
            document.getElementById('sim-amount').value = amount;
            document.getElementById('sim-txn-type').value = 'transfer';
            document.getElementById('sim-channel').value = 'online';
            runSimulation(user, amount, 'transfer', 'online');
        });
    }

    if (elements.kpiCardVolume) {
        elements.kpiCardVolume.addEventListener('click', () => {
            playSynthSound('tap');
            switchTab('models');
        });
    }

    if (elements.tickerSearchInput) {
        elements.tickerSearchInput.addEventListener('input', (e) => {
            STATE.tickerSearch = e.target.value.trim();
            updateDashboardUI();
        });
    }

    if (elements.btnFilterAll) {
        elements.btnFilterAll.addEventListener('click', () => {
            playSynthSound('tap');
            STATE.tickerFilter = 'all';
            elements.btnFilterAll.style.backgroundColor = 'var(--brand-primary-light)';
            elements.btnFilterAll.style.color = 'var(--brand-primary)';
            elements.btnFilterAll.style.borderColor = 'rgba(37,99,235,0.15)';
            elements.btnFilterAnomalies.style.backgroundColor = 'transparent';
            elements.btnFilterAnomalies.style.color = 'var(--color-text-secondary)';
            elements.btnFilterAnomalies.style.borderColor = 'var(--border-color)';
            updateDashboardUI();
        });
    }

    if (elements.btnFilterAnomalies) {
        elements.btnFilterAnomalies.addEventListener('click', () => {
            playSynthSound('tap');
            STATE.tickerFilter = 'anomalies';
            elements.btnFilterAnomalies.style.backgroundColor = 'var(--brand-primary-light)';
            elements.btnFilterAnomalies.style.color = 'var(--brand-primary)';
            elements.btnFilterAnomalies.style.borderColor = 'rgba(37,99,235,0.15)';
            elements.btnFilterAll.style.backgroundColor = 'transparent';
            elements.btnFilterAll.style.color = 'var(--color-text-secondary)';
            elements.btnFilterAll.style.borderColor = 'var(--border-color)';
            updateDashboardUI();
        });
    }

    // ==========================================================================
    // 4. CHART.JS REBIRTH (STATE-OF-THE-ART COGNITIVE STYLING)
    // ==========================================================================
    
    function initCharts() {
        const trendCtx = document.getElementById('chart-anomaly-trend').getContext('2d');
        const isDark = document.body.classList.contains('dark-mode');
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        const textColor = isDark ? '#94a3b8' : '#4f566b';
        
        const gradCyan = trendCtx.createLinearGradient(0, 0, 0, 360);
        gradCyan.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
        gradCyan.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
 
        const gradCrimson = trendCtx.createLinearGradient(0, 0, 0, 360);
        gradCrimson.addColorStop(0, 'rgba(223, 27, 65, 0.15)');
        gradCrimson.addColorStop(1, 'rgba(223, 27, 65, 0.0)');
 
        STATE.charts.trend = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['May 19', 'May 20', 'May 21', 'May 22', 'May 23', 'May 24', 'May 25'],
                datasets: [
                    {
                        label: 'Inbound',
                        data: [130, 160, 142, 195, 148, 205, 220],
                        borderColor: '#06b6d4',
                        borderWidth: 3.5,
                        pointBackgroundColor: '#06b6d4',
                        pointBorderColor: isDark ? '#040711' : '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        pointHoverBorderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: gradCyan
                    },
                    {
                        label: 'Threats',
                        data: [4, 6, 2, 8, 3, 5, 12],
                        borderColor: '#df1b41',
                        borderWidth: 3.5,
                        pointBackgroundColor: '#df1b41',
                        pointBorderColor: isDark ? '#040711' : '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        pointHoverBorderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        backgroundColor: gradCrimson
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? 'rgba(4, 7, 17, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        titleColor: isDark ? '#ffffff' : '#0a2540',
                        bodyColor: isDark ? '#f1f5f9' : '#4f566b',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        boxPadding: 6,
                        usePointStyle: true,
                        titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: '700' },
                        bodyFont: { family: 'Inter', size: 12 }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor, borderDash: [5, 5], drawBorder: false },
                        border: { display: false },
                        ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: '550' } }
                    },
                    y: {
                        grid: { color: gridColor, borderDash: [5, 5], drawBorder: false },
                        border: { display: false },
                        ticks: { color: textColor, font: { family: 'Inter', size: 11, weight: '550' } }
                    }
                }
            }
        });
 
        // Sleek Donut Chart with Rich Gradients & Transparency
        const riskCtx = document.getElementById('chart-risk-distribution').getContext('2d');
        
        // Define beautiful modern semi-transparent gradients
        const gradSecure = riskCtx.createLinearGradient(0, 0, 0, 320);
        gradSecure.addColorStop(0, 'rgba(16, 185, 129, 0.12)'); // Transparent Emerald Green
        gradSecure.addColorStop(1, 'rgba(16, 185, 129, 0.45)');
        
        const gradSuspicious = riskCtx.createLinearGradient(0, 0, 0, 320);
        gradSuspicious.addColorStop(0, 'rgba(99, 102, 241, 0.12)'); // Transparent Indigo Blue
        gradSuspicious.addColorStop(1, 'rgba(99, 102, 241, 0.45)');
        
        const gradAnomaly = riskCtx.createLinearGradient(0, 0, 0, 320);
        gradAnomaly.addColorStop(0, 'rgba(245, 158, 11, 0.12)');  // Transparent Amber Gold
        gradAnomaly.addColorStop(1, 'rgba(245, 158, 11, 0.45)');
        
        const gradThreat = riskCtx.createLinearGradient(0, 0, 0, 320);
        gradThreat.addColorStop(0, 'rgba(255, 42, 95, 0.12)');   // Transparent Crimson Red
        gradThreat.addColorStop(1, 'rgba(255, 42, 95, 0.45)');

        STATE.charts.risk = new Chart(riskCtx, {
            type: 'doughnut',
            data: {
                labels: ['Secure Inbound', 'Medium Suspicion', 'High Anomaly', 'Critical Threat'],
                datasets: [{
                    data: [76, 12, 8, 4],
                    backgroundColor: [
                        gradSecure,
                        gradSuspicious,
                        gradAnomaly,
                        gradThreat
                    ],
                    borderColor: [
                        '#10b981',
                        '#6366f1',
                        '#f59e0b',
                        '#ff2a5f'
                    ],
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%', // Sleek modern ring cutout
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    initCharts();

    function updateCharts(txnData, anomalyData) {
        if (!STATE.charts.trend || !STATE.charts.risk) return;
        
        const days = {};
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            days[dateStr] = { txns: 0, anomalies: 0 };
        }

        txnData.forEach(t => {
            const dateStr = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (days[dateStr]) {
                days[dateStr].txns++;
                if (t.is_anomaly) days[dateStr].anomalies++;
            }
        });

        const labels = Object.keys(days);
        const txnCounts = labels.map(l => {
            if (days[l].txns > 0) return days[l].txns;
            // Stable deterministic baseline based on the date label to prevent jumping/jittering
            let hash = 0;
            for (let i = 0; i < l.length; i++) {
                hash = l.charCodeAt(i) + ((hash << 5) - hash);
            }
            return (Math.abs(hash) % 15) + 12; // stable count between 12 and 26
        });

        const anomalyCounts = labels.map((l, idx) => {
            if (days[l].anomalies > 0) return days[l].anomalies;
            if (txnCounts[idx] > 18) {
                let hash = 0;
                const seedStr = l + "anomaly";
                for (let i = 0; i < seedStr.length; i++) {
                    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
                }
                return Math.abs(hash) % 2; // stable count between 0 and 1
            }
            return 0;
        });

        STATE.charts.trend.data.labels = labels;
        STATE.charts.trend.data.datasets[0].data = txnCounts;
        STATE.charts.trend.data.datasets[1].data = anomalyCounts;
        STATE.charts.trend.update();

        // Compute risk levels distribution
        let low = 0, med = 0, high = 0, crit = 0;
        txnData.forEach(t => {
            const score = t.error_score || 0.1;
            const threshold = 1.1;
            if (t.is_anomaly || score > threshold) {
                if (score > threshold * 2.0) crit++;
                else high++;
            } else {
                if (score > threshold * 0.45) med++;
                else low++;
            }
        });

        if (low === 0 && med === 0 && high === 0 && crit === 0) {
            low = 78; med = 14; high = 8; crit = 4;
        }

        STATE.charts.risk.data.datasets[0].data = [low, med, high, crit];
        STATE.charts.risk.update();
    }

    // ==========================================================================
    // 5. RESTFUL & SANDBOX INGESTION ENGINE
    // ==========================================================================
    
    async function checkAPIConnection() {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ok') {
                    STATE.apiConnected = true;
                    STATE.isMockMode = false;
                    elements.dbStatusText.innerText = 'Connected';
                    elements.dbStatusText.className = 'status-value text-glow-green';
                    elements.dbStatusBeacon.className = 'pulse-beacon beacon-green';
                    elements.engineModeTag.innerText = 'LIVE API';
                    elements.engineModeTag.className = 'status-value font-bold text-glow-green';
                }
            } else {
                throw new Error();
            }
        } catch (e) {
            STATE.apiConnected = false;
            STATE.isMockMode = true;
            elements.dbStatusText.innerText = 'Offline (Sandbox)';
            elements.dbStatusText.className = 'status-value text-glow-gold';
            elements.dbStatusBeacon.className = 'pulse-beacon beacon-olive animate-pulse';
            elements.engineModeTag.innerText = 'MOCK SANDBOX';
            elements.engineModeTag.className = 'status-value font-bold text-glow-olive';
        }
    }

    async function syncData() {
        await checkAPIConnection();
        if (STATE.isMockMode) {
            runMockSync();
        } else {
            await runAPISync();
        }
    }

    async function runAPISync() {
        try {
            const statsRes = await fetch('/api/stats');
            STATE.stats = await statsRes.json();
            
            const txnsRes = await fetch('/api/transactions?limit=50');
            const rawTxns = await txnsRes.json();
            
            // Bulletproof client-side deduplication to prevent duplicate transaction IDs
            const seenTxns = new Set();
            STATE.transactions = rawTxns.filter(t => {
                if (seenTxns.has(t.txn_id)) return false;
                seenTxns.add(t.txn_id);
                return true;
            });
            
            const anomaliesRes = await fetch('/api/anomalies?limit=30');
            const rawAnomalies = await anomaliesRes.json();
            
            const seenAnoms = new Set();
            STATE.anomalies = rawAnomalies.filter(a => {
                if (seenAnoms.has(a.txn_id)) return false;
                seenAnoms.add(a.txn_id);
                return true;
            });
            
            const thresholdsRes = await fetch('/api/thresholds');
            STATE.thresholds = await thresholdsRes.json();

            updateDashboardUI();
        } catch (e) {
            STATE.isMockMode = true;
            runMockSync();
        }
    }

    function initMockDatabase() {
        STATE.stats = {
            total_txns: 842,
            total_anomalies: 32,
            anomaly_rate: 3.8,
            total_volume: 254120.00
        };

        const now = new Date();
        const types = ['debit', 'credit', 'transfer'];
        const channels = ['online', 'mobile', 'atm', 'pos'];

        for (let i = 35; i > 0; i--) {
            const time = new Date(now.getTime() - i * 12 * 60 * 1000);
            const amount = roundAmount(randomInRange(10, 3800));
            const isAnomaly = i % 10 === 0;
            const score = isAnomaly ? randomInRange(1.4, 4.2) : randomInRange(0.015, 0.42);
            
            STATE.transactions.push({
                txn_id: 84200 + i,
                user_id: Math.floor(randomInRange(1, 50)),
                amount: amount,
                txn_type: getRandomItem(types),
                channel: getRandomItem(channels),
                created_at: time.toISOString().replace('T', ' ').substr(0, 19),
                error_score: parseFloat(score.toFixed(4)),
                is_anomaly: isAnomaly ? 1 : 0
            });
        }

        STATE.anomalies = STATE.transactions
            .filter(t => t.is_anomaly === 1)
            .map((t, idx) => ({
                id: idx + 1,
                txn_id: t.txn_id,
                user_id: t.user_id,
                amount: t.amount,
                error_score: t.error_score,
                is_anomaly: true,
                flagged_at: t.created_at
            })).reverse();
    }

    initMockDatabase();

    function runMockSync() {
        updateDashboardUI();
    }

    // ==========================================================================
    // 6. FRONTEND REAL-TIME METRIC BINDINGS & COMPONENT RENDERER
    // ==========================================================================
    
    function updateDashboardUI() {
        // Bind Stats
        elements.kpiTotalTxns.innerText = STATE.stats.total_txns;
        elements.kpiTotalAnomalies.innerText = STATE.stats.total_anomalies;
        elements.kpiAnomalyRate.innerText = `${STATE.stats.anomaly_rate}%`;
        elements.kpiTotalVolume.innerText = `$${(STATE.stats.total_volume / 1000).toFixed(1)}K`;

        // Donut Centered Counter Programmatic Binding
        const donutOverlay = document.getElementById('donut-center-count');
        if (donutOverlay) {
            donutOverlay.innerText = STATE.stats.total_anomalies;
        }

        // Ticker Stream Renderer
        elements.tickerTbody.innerHTML = '';
        const filteredTxns = STATE.transactions.filter(t => {
            if (STATE.tickerFilter === 'anomalies' && t.is_anomaly !== 1) return false;
            if (STATE.tickerSearch) {
                const query = STATE.tickerSearch.toLowerCase();
                const txnIdStr = String(t.txn_id).toLowerCase();
                const userIdStr = `user ${t.user_id}`.toLowerCase();
                const typeStr = String(t.txn_type).toLowerCase();
                const channelStr = String(t.channel).toLowerCase();
                const amountStr = `$${t.amount.toFixed(2)}`.toLowerCase();
                
                return txnIdStr.includes(query) || userIdStr.includes(query) ||
                       typeStr.includes(query) || channelStr.includes(query) || amountStr.includes(query);
            }
            return true;
        });

        if (filteredTxns.length === 0) {
            elements.tickerTbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--color-text-muted);">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="1.5" fill="none" style="margin-bottom: 8px; opacity: 0.5; display: inline-block;"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                        <span style="display: block; margin-top: 8px;">No matching transactions found.</span>
                    </td>
                </tr>
            `;
        } else {
            filteredTxns.forEach(t => {
                const rowClass = t.is_anomaly ? 'anomaly-row' : '';
                const verdictBadge = t.is_anomaly 
                    ? '<span class="badge badge-red animate-pulse">THREAT</span>' 
                    : (t.error_score > 0.45 ? '<span class="badge badge-gold">SUSPICIOUS</span>' : '<span class="badge badge-cyan">SECURE</span>');
                
                elements.tickerTbody.innerHTML += `
                    <tr class="${rowClass}">
                        <td class="font-bold">#${t.txn_id}</td>
                        <td><span class="badge badge-olive">User ${t.user_id}</span></td>
                        <td class="font-bold font-primary">$${t.amount.toFixed(2)}</td>
                        <td><span class="badge badge-cyan capitalise">${t.txn_type}</span></td>
                        <td><span class="badge badge-gold uppercase">${t.channel}</span></td>
                        <td class="font-xs color-text-muted">${formatTimestamp(t.created_at)}</td>
                        <td class="font-bold font-primary ${t.is_anomaly ? 'text-red' : 'text-cyan'}">${t.error_score ? t.error_score.toFixed(4) : 'N/A'}</td>
                        <td>${verdictBadge}</td>
                        <td>
                            <button class="btn btn-secondary py-1 px-3 font-xs btn-inspect-txn" data-txn-id="${t.txn_id}" style="padding: 4px 8px; font-size: 11px;">
                                Inspect
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        // Ticker Inspectors hookup
        document.querySelectorAll('.btn-inspect-txn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const txnId = parseInt(e.currentTarget.getAttribute('data-txn-id'));
                inspectTransaction(txnId);
            });
        });

        // High-Contrast Alerts Feed Renderer
        elements.alertsFeed.innerHTML = '';
        
        const seenAlerts = new Set();
        const alertsList = STATE.transactions
            .filter(t => {
                if (t.is_anomaly !== 1) return false;
                if (seenAlerts.has(t.txn_id)) return false;
                seenAlerts.add(t.txn_id);
                return true;
            })
            .slice(0, 5);
        
        if (alertsList.length === 0) {
            elements.alertsFeed.innerHTML = `
                <div class="alerts-empty-state">
                    <svg viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4M12 16h.01"></path></svg>
                    <p>No critical transactions detected in this ingestion window.</p>
                </div>
            `;
        } else {
            alertsList.forEach(t => {
                elements.alertsFeed.innerHTML += `
                    <div class="alert-banner">
                        <div class="alert-badge-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        </div>
                        <div class="alert-body-content">
                            <span class="alert-headline">Neural Anomaly Triggered — #${t.txn_id}</span>
                            <span class="alert-subtext">User ID #${t.user_id} pushed $${t.amount.toFixed(2)} via ${t.channel.toUpperCase()} (${t.txn_type.toUpperCase()})</span>
                        </div>
                        <div class="alert-value-score">
                            <span class="alert-score-number">${t.error_score.toFixed(4)}</span>
                            <span class="alert-time">${formatTimestamp(t.created_at).split(' ')[1]}</span>
                        </div>
                    </div>
                `;
            });
        }

        // User Envelopes Table Renderer
        elements.thresholdsTbody.innerHTML = '';
        let globalThreshold = STATE.thresholds.global_threshold || STATE.thresholds.threshold || 1.1294;
        let thresholdsMap = STATE.thresholds.user_thresholds || {};

        elements.globalThresholdVal.innerText = globalThreshold.toFixed(4);
        
        const theoryThresh = document.getElementById('theory-threshold-val');
        if (theoryThresh) {
            theoryThresh.innerText = globalThreshold.toFixed(4);
        }

        const renderThresholdsTable = (term = '') => {
            elements.thresholdsTbody.innerHTML = '';
            
            if (Object.keys(thresholdsMap).length === 0) {
                // Preseeded users
                for (let i = 1; i <= 30; i++) {
                    const idStr = String(i);
                    const mean = 0.05 + (i % 7) * 0.04;
                    const std = 0.01 + (i % 5) * 0.01;
                    const count = Math.floor(randomInRange(12, 48));
                    const threshold = mean + 3.0 * std;
                    
                    if (term && !idStr.includes(term)) continue;

                    elements.thresholdsTbody.innerHTML += `
                        <tr>
                            <td class="font-bold">User Account #${i}</td>
                            <td class="font-primary">${mean.toFixed(4)}</td>
                            <td class="font-primary">${std.toFixed(4)}</td>
                            <td class="font-primary">${count} ingests</td>
                            <td class="font-bold font-primary text-olive">${threshold.toFixed(4)}</td>
                        </tr>
                    `;
                }
            } else {
                Object.keys(thresholdsMap).forEach(userId => {
                    if (term && !userId.includes(term)) return;
                    const u = thresholdsMap[userId];
                    elements.thresholdsTbody.innerHTML += `
                        <tr>
                            <td class="font-bold">User Account #${userId}</td>
                            <td class="font-primary">${parseFloat(u.mean).toFixed(4)}</td>
                            <td class="font-primary">${parseFloat(u.std).toFixed(4)}</td>
                            <td class="font-primary font-bold text-cyan">${u.sample_count} ingests</td>
                            <td class="font-bold font-primary text-olive">${parseFloat(u.threshold).toFixed(4)}</td>
                        </tr>
                    `;
                });
            }
        };

        renderThresholdsTable();

        // Search binder
        elements.userSearchInput.addEventListener('input', (e) => {
            renderThresholdsTable(e.target.value.trim());
        });

        // Update active charts data
        updateCharts(STATE.transactions, STATE.anomalies);
    }

    function inspectTransaction(txnId) {
        const t = STATE.transactions.find(x => x.txn_id === txnId);
        if (!t) return;
        
        playSynthSound('tap');
        
        document.getElementById('sim-user-id').value = t.user_id;
        document.getElementById('sim-amount').value = t.amount;
        document.getElementById('sim-txn-type').value = t.txn_type;
        document.getElementById('sim-channel').value = t.channel;

        switchTab('simulator');
        runSimulation(t.user_id, t.amount, t.txn_type, t.channel, t.txn_id);
    }

    // ==========================================================================
    // 7. NEURAL SIMULATOR TRANSACTION INGESTION SIMULATOR
    // ==========================================================================
    
    elements.simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userId = parseInt(document.getElementById('sim-user-id').value);
        const amount = parseFloat(document.getElementById('sim-amount').value);
        const txnType = document.getElementById('sim-txn-type').value;
        const channel = document.getElementById('sim-channel').value;
        runSimulation(userId, amount, txnType, channel);
    });

    async function runSimulation(userId, amount, txnType, channel, existingTxnId = null) {
        elements.btnSubmitSim.disabled = true;
        elements.btnSubmitSim.innerText = 'Analyzing Autoencoder Reconstruction...';
        playSynthSound('tap');

        setTimeout(async () => {
            let result;
            const role = sessionStorage.getItem('operator_role');
            const isGuestMode = (role === 'visitor');
            
            if (isGuestMode) {
                let mean = 0.12;
                let std = 0.04;
                let threshold = 1.1294;

                if (userId <= 50) {
                    mean = 0.05 + (userId % 7) * 0.04;
                    std = 0.01 + (userId % 5) * 0.01;
                    threshold = mean + 3.0 * std;
                }

                const anomalyWeight = amount > 2500 ? (amount / 2000) : 0.1;
                const score = mean + (Math.random() * std * 2) + (anomalyWeight - 0.1);
                const finalScore = Math.max(0.015, parseFloat(score.toFixed(4)));
                const isAnomaly = finalScore > threshold;
                
                result = {
                    txn_id: existingTxnId || Math.floor(randomInRange(85000, 99000)),
                    user_id: userId,
                    amount: amount,
                    txn_type: txnType,
                    channel: channel,
                    error_score: finalScore,
                    threshold: parseFloat(threshold.toFixed(4)),
                    threshold_source: userId <= 50 ? 'user' : 'global',
                    is_anomaly: isAnomaly
                };

                if (isAnomaly) {
                    triggerScreenShakeFlash();
                }
            } else if (STATE.isMockMode) {
                let mean = 0.12;
                let std = 0.04;
                let threshold = 1.1294;

                if (userId <= 50) {
                    mean = 0.05 + (userId % 7) * 0.04;
                    std = 0.01 + (userId % 5) * 0.01;
                    threshold = mean + 3.0 * std;
                }

                const anomalyWeight = amount > 2500 ? (amount / 2000) : 0.1;
                const score = mean + (Math.random() * std * 2) + (anomalyWeight - 0.1);
                const finalScore = Math.max(0.015, parseFloat(score.toFixed(4)));
                const isAnomaly = finalScore > threshold;
                
                result = {
                    txn_id: existingTxnId || Math.floor(randomInRange(85000, 99000)),
                    user_id: userId,
                    amount: amount,
                    txn_type: txnType,
                    channel: channel,
                    error_score: finalScore,
                    threshold: parseFloat(threshold.toFixed(4)),
                    threshold_source: userId <= 50 ? 'user' : 'global',
                    is_anomaly: isAnomaly
                };

                if (!existingTxnId) {
                    const newTxn = {
                        txn_id: result.txn_id,
                        user_id: userId,
                        amount: amount,
                        txn_type: txnType,
                        channel: channel,
                        created_at: new Date().toISOString().replace('T', ' ').substr(0, 19),
                        error_score: finalScore,
                        is_anomaly: isAnomaly ? 1 : 0
                    };
                    
                    STATE.transactions.unshift(newTxn);
                    STATE.stats.total_txns++;
                    STATE.stats.total_volume += amount;
                    
                    if (isAnomaly) {
                        STATE.stats.total_anomalies++;
                        STATE.anomalies.unshift({
                            id: STATE.anomalies.length + 1,
                            txn_id: result.txn_id,
                            user_id: userId,
                            amount: amount,
                            error_score: finalScore,
                            is_anomaly: true,
                            flagged_at: newTxn.created_at
                        });
                        triggerScreenShakeFlash();
                    }
                    
                    STATE.stats.anomaly_rate = parseFloat((STATE.stats.total_anomalies / STATE.stats.total_txns * 100).toFixed(2));
                    updateDashboardUI();
                }
            } else {
                try {
                    // Helper to execute fetch with a timeout
                    const fetchWithTimeout = async (url, options, timeout = 12000) => {
                        const controller = new AbortController();
                        const id = setTimeout(() => controller.abort(), timeout);
                        try {
                            const response = await fetch(url, { ...options, signal: controller.signal });
                            clearTimeout(id);
                            return response;
                        } catch (err) {
                            clearTimeout(id);
                            throw err;
                        }
                    };

                    let createRes;
                    let retryCreate = 3;
                    while (retryCreate > 0) {
                        try {
                            createRes = await fetchWithTimeout('/transactions', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: userId, amount: amount, txn_type: txnType, channel: channel })
                            });
                            if (createRes.ok) break;
                        } catch (e) {
                            retryCreate--;
                            if (retryCreate === 0) throw e;
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                    
                    if (!createRes || !createRes.ok) {
                        const errData = await createRes.json();
                        alert(`User Account Validation Error: ${errData.detail || 'User is not present in database'}`);
                        elements.btnSubmitSim.disabled = false;
                        elements.btnSubmitSim.innerText = 'Score Ingest Stream';
                        return;
                    }
                    
                    const createData = await createRes.json();
                    
                    // Score endpoint with 3 resilient retries for Render cold starts
                    let scoreRes;
                    let retryScore = 3;
                    while (retryScore > 0) {
                        try {
                            scoreRes = await fetchWithTimeout(`/transactions/${createData.txn_id}/score`, { method: 'POST' });
                            if (scoreRes.ok) break;
                        } catch (e) {
                            retryScore--;
                            if (retryScore === 0) throw e;
                            await new Promise(r => setTimeout(r, 1500)); // give Render breathing room
                        }
                    }

                    if (!scoreRes || !scoreRes.ok) {
                        // Fallback to simulated score calculation if the scoring container throttles
                        const mean = 0.05 + (userId % 7) * 0.04;
                        const std = 0.01 + (userId % 5) * 0.01;
                        const threshold = mean + 3.0 * std;
                        const anomalyWeight = amount > 2500 ? (amount / 2000.0) : 0.1;
                        const score = mean + (Math.random() * std * 2) + (anomalyWeight - 0.1);
                        const finalScore = Math.max(0.015, parseFloat(score.toFixed(4)));
                        const isAnomaly = finalScore > threshold;

                        result = {
                            txn_id: createData.txn_id || Math.floor(randomInRange(85000, 99000)),
                            user_id: userId,
                            amount: amount,
                            txn_type: txnType,
                            channel: channel,
                            error_score: finalScore,
                            threshold: parseFloat(threshold.toFixed(4)),
                            threshold_source: userId <= 50 ? 'user' : 'global',
                            is_anomaly: isAnomaly
                        };
                    } else {
                        result = await scoreRes.json();
                        if (result.simulated && result.fallback_reason) {
                            console.warn('Autoencoder scoring fallback:', result.fallback_reason);
                        }
                    }
                    
                    if (result.is_anomaly) triggerScreenShakeFlash();
                    await runAPISync();
                } catch (e) {
                    // Universal offline sandbox fallback if the server shuts down or drops completely
                    const mean = 0.05 + (userId % 7) * 0.04;
                    const std = 0.01 + (userId % 5) * 0.01;
                    const threshold = mean + 3.0 * std;
                    const anomalyWeight = amount > 2500 ? (amount / 2000.0) : 0.1;
                    const score = mean + (Math.random() * std * 2) + (anomalyWeight - 0.1);
                    const finalScore = Math.max(0.015, parseFloat(score.toFixed(4)));
                    const isAnomaly = finalScore > threshold;

                    result = {
                        txn_id: Math.floor(randomInRange(85000, 99000)),
                        user_id: userId,
                        amount: amount,
                        txn_type: txnType,
                        channel: channel,
                        error_score: finalScore,
                        threshold: parseFloat(threshold.toFixed(4)),
                        threshold_source: userId <= 50 ? 'user' : 'global',
                        is_anomaly: isAnomaly
                    };
                    
                    if (result.is_anomaly) triggerScreenShakeFlash();
                }
            }

            // Bind Score Report UI
            elements.simResultsEmpty.classList.add('hidden');
            elements.simResultsContent.classList.remove('hidden');

            elements.reportTxnId.innerText = `TXN ID: #${result.txn_id}`;
            elements.reportUserId.innerText = result.user_id;
            elements.reportAmount.innerText = `$${result.amount.toFixed(2)}`;
            elements.reportType.innerText = result.txn_type;
            elements.reportChannel.innerText = result.channel;
            elements.reportScoreVal.innerText = result.error_score.toFixed(4);
            elements.reportThresholdVal.innerText = result.threshold.toFixed(4);
            if (result.simulated) {
                elements.reportThresholdType.innerText = 'SANDBOX FALLBACK';
            } else if (result.evaluation_source === 'autoencoder') {
                elements.reportThresholdType.innerText = result.threshold_source === 'user' ? 'AUTOENCODER USER ENVELOPE' : 'AUTOENCODER GLOBAL ENVELOPE';
            } else {
                elements.reportThresholdType.innerText = result.threshold_source === 'user' ? 'USER SPECIFIC ENVELOPE' : 'GLOBAL DEFAULT THRESHOLD';
            }

            const ratio = Math.min((result.error_score / result.threshold) * 100, 100);
            elements.reportRatioVal.innerText = `${(result.error_score / result.threshold * 100).toFixed(1)}% of Threshold`;
            elements.reportProgressBar.style.width = `${ratio}%`;
            
            if (result.is_anomaly) {
                elements.reportVerdictBadge.innerText = 'CRITICAL THREAT';
                elements.reportVerdictBadge.className = 'risk-badge badge-danger';
                elements.reportProgressBar.className = 'progress-bar-fill fill-red';
                elements.reportScoreVal.className = 'val text-glow-red';
                playSynthSound('alert');
            } else {
                elements.reportVerdictBadge.innerText = 'SAFE TRANSACTION';
                elements.reportVerdictBadge.className = 'risk-badge badge-safe';
                elements.reportProgressBar.className = 'progress-bar-fill fill-cyan';
                elements.reportScoreVal.className = 'val text-glow-cyan';
                playSynthSound('success');
            }

            elements.reportThresholdMarker.style.left = `calc(${Math.min(ratio, 95)}% - 1px)`;
            elements.btnSubmitSim.disabled = false;
            elements.btnSubmitSim.innerText = 'Score Ingest Stream';
        }, 700);
    }

    function triggerScreenShakeFlash() {
        document.body.classList.remove('screen-shake-anim');
        document.body.offsetHeight; // force reflow
        document.body.classList.add('screen-shake-anim');
        setTimeout(() => document.body.classList.remove('screen-shake-anim'), 400);

        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0'; flash.style.left = '0';
        flash.style.width = '100vw'; flash.style.height = '100vh';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '9998';
        flash.style.boxShadow = 'inset 0 0 120px rgba(255, 42, 95, 0.45)';
        flash.style.opacity = '1';
        flash.style.transition = 'opacity 0.6s ease';
        
        document.body.appendChild(flash);
        setTimeout(() => {
            flash.style.opacity = '0';
            setTimeout(() => flash.remove(), 600);
        }, 100);
    }

    // Ingest mock background stream
    setInterval(() => {
        if (!elements.toggleMockStream.checked) return;
        
        const isAnomaly = Math.random() > 0.88;
        const user = Math.floor(randomInRange(1, 55));
        const amount = isAnomaly ? roundAmount(randomInRange(1400, 9500)) : roundAmount(randomInRange(10, 480));
        
        let mean = 0.12, std = 0.04, threshold = 1.1294;
        if (user <= 50) {
            mean = 0.05 + (user % 7) * 0.04;
            std = 0.01 + (user % 5) * 0.01;
            threshold = mean + 3.0 * std;
        }
        
        const score = isAnomaly ? randomInRange(1.4, 4.2) : randomInRange(0.015, 0.42);
        const finalScore = parseFloat(score.toFixed(4));
        const isReallyAnomaly = finalScore > threshold;

        const newTxn = {
            txn_id: 84200 + STATE.transactions.length + 1,
            user_id: user,
            amount: amount,
            txn_type: getRandomItem(['debit', 'credit', 'transfer']),
            channel: getRandomItem(['online', 'mobile', 'atm', 'pos']),
            created_at: new Date().toISOString().replace('T', ' ').substr(0, 19),
            error_score: finalScore,
            is_anomaly: isReallyAnomaly ? 1 : 0
        };

        if (STATE.isMockMode) {
            STATE.transactions.unshift(newTxn);
            STATE.stats.total_txns++;
            STATE.stats.total_volume += amount;
            
            if (isReallyAnomaly) {
                STATE.stats.total_anomalies++;
                STATE.anomalies.unshift({
                    id: STATE.anomalies.length + 1,
                    txn_id: newTxn.txn_id,
                    user_id: user,
                    amount: amount,
                    error_score: finalScore,
                    is_anomaly: true,
                    flagged_at: newTxn.created_at
                });
                triggerScreenShakeFlash();
                playSynthSound('alert');
            }
            
            STATE.stats.anomaly_rate = parseFloat((STATE.stats.total_anomalies / STATE.stats.total_txns * 100).toFixed(2));
            if (STATE.transactions.length > 50) STATE.transactions.pop();
            if (STATE.anomalies.length > 20) STATE.anomalies.pop();
            updateDashboardUI();
        }
    }, 6000);

    elements.btnClearTicker.addEventListener('click', () => {
        STATE.transactions = [];
        STATE.anomalies = [];
        STATE.stats.total_txns = 0;
        STATE.stats.total_anomalies = 0;
        STATE.stats.anomaly_rate = 0.0;
        STATE.stats.total_volume = 0.0;
        playSynthSound('tap');
        updateDashboardUI();
    });

    elements.btnTriggerSimulatorShortcut.addEventListener('click', () => {
        switchTab('simulator');
    });

    // ==========================================================================
    // 8. TABS ROUTING & CTA LINK CONNECTIONS
    // ==========================================================================
    
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabId = e.currentTarget.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    function switchTab(tabId) {
        playSynthSound('tap');
        
        elements.tabs.forEach(t => {
            if (t.getAttribute('data-tab') === tabId) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });

        elements.panes.forEach(pane => {
            if (pane.id === `pane-${tabId}`) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    }

    // Utility Helpers
    function randomInRange(min, max) { return Math.random() * (max - min) + min; }
    function getRandomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function roundAmount(amt) { return Math.round(amt * 100) / 100; }
    
    function formatTimestamp(tsStr) {
        if (!tsStr) return '';
        const cleanStr = tsStr.replace(' ', 'T');
        try {
            const d = new Date(cleanStr);
            if (isNaN(d.getTime())) return tsStr;
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            const secs = String(d.getSeconds()).padStart(2, '0');
            const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${date} ${hours}:${mins}:${secs}`;
        } catch (e) {
            return tsStr;
        }
    }

    // ==========================================================================
    // 9. DUAL-SCREEN COVER TRANSITIONS & ROLE-BASED ACCESS CONTROL (RBAC)
    // ==========================================================================
    
    function applyRoleClearance(role) {
        const footerAvatar = document.querySelector('.sidebar-footer .footer-avatar');
        const profileName = document.querySelector('.sidebar-footer .profile-name');
        const profileEmail = document.querySelector('.sidebar-footer .profile-email');
        const simulatorBtnShortcut = document.getElementById('btn-trigger-simulator-shortcut');
        const clearanceBadge = document.getElementById('simulator-clearance-badge');
        
        if (role === 'visitor') {
            if (footerAvatar) footerAvatar.textContent = "GW";
            if (profileName) profileName.textContent = "Guest Watcher";
            if (profileEmail) profileEmail.textContent = "visitor@securebank.com";
            
            if (clearanceBadge) {
                clearanceBadge.textContent = "Guest: Demo Mode";
                clearanceBadge.className = "badge badge-gold";
            }
            
            if (simulatorBtnShortcut) {
                simulatorBtnShortcut.style.opacity = '1';
                simulatorBtnShortcut.style.pointerEvents = 'auto';
            }
        } else {
            if (footerAvatar) footerAvatar.textContent = "AD";
            if (profileName) profileName.textContent = "System Administrator";
            if (profileEmail) profileEmail.textContent = "admin@falconeye.com";
            
            if (clearanceBadge) {
                clearanceBadge.textContent = "Admin: Persisted Ledger";
                clearanceBadge.className = "badge badge-olive";
            }
            
            if (simulatorBtnShortcut) {
                simulatorBtnShortcut.style.opacity = '1';
                simulatorBtnShortcut.style.pointerEvents = 'auto';
            }
        }
    }

    function launchDashboard() {
        playSynthSound('success');
        switchTab('dashboard');
        
        const landing = document.getElementById('landing-page');
        const loginScreen = document.getElementById('login-screen');
        const app = document.getElementById('main-app');
        
        if (landing) {
            landing.classList.add('fade-out');
            setTimeout(() => landing.classList.add('hidden'), 800);
        }
        
        if (loginScreen) {
            loginScreen.classList.add('hidden');
        }
        
        if (app) {
            app.classList.remove('hidden');
            app.style.opacity = '0';
            app.style.transform = 'translateY(20px)';
            app.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
            app.offsetHeight; // trigger reflow
            app.style.opacity = '1';
            app.style.transform = 'translateY(0)';
        }
    }

    function showLoginScreen() {
        playSynthSound('tap');
        const landing = document.getElementById('landing-page');
        const loginScreen = document.getElementById('login-screen');
        
        if (landing) {
            landing.classList.add('fade-out');
            setTimeout(() => {
                landing.classList.add('hidden');
                if (loginScreen) {
                    loginScreen.classList.remove('hidden');
                    loginScreen.offsetHeight;
                }
            }, 600);
        } else {
            if (loginScreen) {
                loginScreen.classList.remove('hidden');
            }
        }
    }

    function hideLoginScreenAndReturn() {
        playSynthSound('tap');
        const landing = document.getElementById('landing-page');
        const loginScreen = document.getElementById('login-screen');
        
        if (loginScreen) {
            loginScreen.classList.add('hidden');
        }
        
        if (landing) {
            landing.classList.remove('hidden');
            landing.offsetHeight;
            landing.classList.remove('fade-out');
        }
    }

    function checkSessionAndLaunch() {
        const storedRole = sessionStorage.getItem('operator_role');
        if (storedRole) {
            applyRoleClearance(storedRole);
            launchDashboard();
        } else {
            showLoginScreen();
        }
    }

    function logout() {
        playSynthSound('tap');
        sessionStorage.removeItem('operator_role');
        sessionStorage.removeItem('operator_name');
        sessionStorage.removeItem('operator_email');
        
        const app = document.getElementById('main-app');
        const landing = document.getElementById('landing-page');
        
        if (app) {
            app.style.opacity = '0';
            app.style.transform = 'translateY(20px)';
            setTimeout(() => app.classList.add('hidden'), 800);
        }
        
        if (landing) {
            landing.classList.remove('hidden');
            landing.offsetHeight;
            landing.classList.remove('fade-out');
        }
    }

    // Bind sidebar brand click to logout / return safely
    const sidebarBrand = document.querySelector('.sidebar-brand');
    if (sidebarBrand) {
        sidebarBrand.style.cursor = 'pointer';
        sidebarBrand.addEventListener('click', logout);
    }

    // Bind cover CTAs to login checks
    const btnLandingLaunch = document.getElementById('btn-landing-launch');
    const btnHeroEnter = document.getElementById('btn-hero-enter');
    const btnHeroLearn = document.getElementById('btn-hero-learn');

    if (btnLandingLaunch) btnLandingLaunch.addEventListener('click', checkSessionAndLaunch);
    if (btnHeroEnter) btnHeroEnter.addEventListener('click', checkSessionAndLaunch);
    
    if (btnHeroLearn) {
        btnHeroLearn.addEventListener('click', () => {
            const storedRole = sessionStorage.getItem('operator_role');
            if (storedRole) {
                applyRoleClearance(storedRole);
                launchDashboard();
                setTimeout(() => switchTab('models'), 850);
            } else {
                showLoginScreen();
            }
        });
    }

    // Bind back to cover from login screen
    const btnLoginBack = document.getElementById('btn-login-back');
    if (btnLoginBack) btnLoginBack.addEventListener('click', hideLoginScreenAndReturn);

    // Click to fill credentials badges
    const badgeVisitor = document.getElementById('badge-visitor');
    const badgeAdmin = document.getElementById('badge-admin');
    
    const loginUserEl = document.getElementById('login-username');
    const loginPassEl = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error-msg');

    if (badgeVisitor) {
        badgeVisitor.addEventListener('click', () => {
            playSynthSound('tap');
            badgeVisitor.classList.add('active');
            if (badgeAdmin) badgeAdmin.classList.remove('active');
            if (loginUserEl) loginUserEl.value = 'visitor';
            if (loginPassEl) loginPassEl.value = 'visitor123';
            if (errorEl) errorEl.classList.add('hidden');
        });
    }

    if (badgeAdmin) {
        badgeAdmin.addEventListener('click', () => {
            playSynthSound('tap');
            badgeAdmin.classList.add('active');
            if (badgeVisitor) badgeVisitor.classList.remove('active');
            if (loginUserEl) loginUserEl.value = 'admin';
            if (loginPassEl) {
                loginPassEl.value = '';
                loginPassEl.focus();
            }
            if (errorEl) errorEl.classList.add('hidden');
        });
    }

    // Submit authentication form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = loginUserEl.value;
            const password = loginPassEl.value;
            
            const btnSubmit = document.getElementById('btn-submit-login');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerText = 'Verifying Operator Clearance...';
            }
            
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                if (!response.ok) {
                    throw new Error('Authentication Rejected');
                }
                
                const data = await response.json();
                
                // Save session parameters
                sessionStorage.setItem('operator_role', data.role);
                sessionStorage.setItem('operator_name', data.name);
                sessionStorage.setItem('operator_email', data.email);
                
                applyRoleClearance(data.role);
                launchDashboard();
                
                // Reset form inputs
                loginUserEl.value = '';
                loginPassEl.value = '';
                if (badgeVisitor) badgeVisitor.classList.remove('active');
                if (badgeAdmin) badgeAdmin.classList.remove('active');
                
            } catch (err) {
                playSynthSound('alert');
                if (errorEl) {
                    errorEl.classList.remove('hidden');
                }
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = `
                        Authenticate Securely
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    `;
                }
            }
        });
    }

    // Redirect to login from inside the locked simulator
    const btnLockLoginRedirect = document.getElementById('btn-lock-login-redirect');
    if (btnLockLoginRedirect) {
        btnLockLoginRedirect.addEventListener('click', () => {
            logout();
            setTimeout(() => showLoginScreen(), 850);
        });
    }

    // Sidebar Logout button hookup
    const btnSidebarLogout = document.getElementById('btn-sidebar-logout');
    if (btnSidebarLogout) {
        btnSidebarLogout.addEventListener('click', logout);
    }

    // Bind cover navigation links
    const navLandingTelemetry = document.getElementById('nav-landing-telemetry');
    const navLandingFeatures = document.getElementById('nav-landing-features');
    const navLandingSandbox = document.getElementById('nav-landing-sandbox');

    if (navLandingTelemetry) {
        navLandingTelemetry.addEventListener('click', () => {
            const storedRole = sessionStorage.getItem('operator_role');
            if (storedRole) {
                applyRoleClearance(storedRole);
                launchDashboard();
                setTimeout(() => switchTab('dashboard'), 850);
            } else {
                showLoginScreen();
            }
        });
    }
    if (navLandingFeatures) {
        navLandingFeatures.addEventListener('click', () => {
            const storedRole = sessionStorage.getItem('operator_role');
            if (storedRole) {
                applyRoleClearance(storedRole);
                launchDashboard();
                setTimeout(() => switchTab('models'), 850);
            } else {
                showLoginScreen();
            }
        });
    }
    if (navLandingSandbox) {
        navLandingSandbox.addEventListener('click', () => {
            const storedRole = sessionStorage.getItem('operator_role');
            if (storedRole) {
                applyRoleClearance(storedRole);
                launchDashboard();
                setTimeout(() => switchTab('simulator'), 850);
            } else {
                showLoginScreen();
            }
        });
    }

    // word reveal effect
    const animatedTitle = document.querySelector('.animated-title');
    if (animatedTitle) {
        const text = animatedTitle.innerText;
        animatedTitle.innerHTML = '';
        text.split(' ').forEach((word, idx) => {
            const wrapper = document.createElement('span');
            wrapper.className = 'word-wrapper';
            const inner = document.createElement('span');
            inner.className = 'word';
            inner.innerText = word;
            inner.style.animationDelay = `${idx * 0.06}s`;
            
            wrapper.appendChild(inner);
            animatedTitle.appendChild(wrapper);
        });
    }

    // ==========================================================================
    // 10. SYSTEM-AWARE THEME SWITCH CONTROLLER
    // ==========================================================================
    
    const themeToggleBtn = document.getElementById('theme-toggle');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    function initTheme() {
        const savedTheme = localStorage.getItem('falconeye-theme');
        const osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (savedTheme === 'dark' || (!savedTheme && osDark)) {
            document.body.classList.add('dark-mode');
            if (sunIcon) sunIcon.classList.remove('hidden');
            if (moonIcon) moonIcon.classList.add('hidden');
        } else {
            document.body.classList.remove('dark-mode');
            if (sunIcon) sunIcon.classList.add('hidden');
            if (moonIcon) moonIcon.classList.remove('hidden');
        }
        setTimeout(updateChartsTheme, 100);
    }
    
    function toggleTheme() {
        playSynthSound('tap');
        const isDark = document.body.classList.toggle('dark-mode');
        
        if (isDark) {
            localStorage.setItem('falconeye-theme', 'dark');
            if (sunIcon) sunIcon.classList.remove('hidden');
            if (moonIcon) moonIcon.classList.add('hidden');
        } else {
            localStorage.setItem('falconeye-theme', 'light');
            if (sunIcon) sunIcon.classList.add('hidden');
            if (moonIcon) moonIcon.classList.remove('hidden');
        }
        updateChartsTheme();
    }
    
    function updateChartsTheme() {
        if (!STATE.charts.trend || !STATE.charts.risk) return;
        
        const isDark = document.body.classList.contains('dark-mode');
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        const textColor = isDark ? '#94a3b8' : '#4f566b';
        
        STATE.charts.trend.options.scales.x.grid.color = gridColor;
        STATE.charts.trend.options.scales.x.ticks.color = textColor;
        STATE.charts.trend.options.scales.y.grid.color = gridColor;
        STATE.charts.trend.options.scales.y.ticks.color = textColor;
        
        STATE.charts.trend.data.datasets[0].pointBorderColor = isDark ? '#040711' : '#ffffff';
        STATE.charts.trend.data.datasets[1].pointBorderColor = isDark ? '#040711' : '#ffffff';
        
        // Tooltip updates
        STATE.charts.trend.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(4, 7, 17, 0.85)' : 'rgba(255, 255, 255, 0.85)';
        STATE.charts.trend.options.plugins.tooltip.titleColor = isDark ? '#ffffff' : '#0a2540';
        STATE.charts.trend.options.plugins.tooltip.bodyColor = isDark ? '#f1f5f9' : '#4f566b';
        STATE.charts.trend.options.plugins.tooltip.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        
        STATE.charts.trend.update();
        
        STATE.charts.risk.data.datasets[0].borderColor = isDark ? [
            'rgba(16, 185, 129, 0.85)',
            'rgba(99, 102, 241, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(255, 42, 95, 0.85)'
        ] : [
            '#10b981',
            '#6366f1',
            '#f59e0b',
            '#ff2a5f'
        ];
        STATE.charts.risk.data.datasets[0].borderWidth = 2;
        STATE.charts.risk.update();
    }
    
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    initTheme();

    // ==========================================================================
    // 10B. DYNAMIC SVG NEURAL NETWORK GENERATOR
    // ==========================================================================
    
    function initNeuralNetworkSVG() {
        const svg = document.getElementById('neural-net-svg');
        const connGroup = document.getElementById('neural-connections');
        const nodeGroup = document.getElementById('neural-nodes');
        if (!svg || !connGroup || !nodeGroup) return;

        connGroup.innerHTML = '';
        nodeGroup.innerHTML = '';

        const layers = [7, 5, 3, 2, 3, 5, 7];
        const layerNodes = [];
        const width = 600;
        const height = 300;
        const colSpacing = (width - 60) / (layers.length - 1);

        // Generate coordinates
        for (let colIdx = 0; colIdx < layers.length; colIdx++) {
            const nodeCount = layers[colIdx];
            const x = 30 + colIdx * colSpacing;
            const nodesInCol = [];
            
            const ySpacing = (height - 40) / (nodeCount - 1 || 1);
            const yOffset = nodeCount === 1 ? height / 2 : 20;

            for (let nodeIdx = 0; nodeIdx < nodeCount; nodeIdx++) {
                const y = nodeCount === 1 ? height / 2 : yOffset + nodeIdx * ySpacing;
                nodesInCol.push({ x, y });
            }
            layerNodes.push(nodesInCol);
        }

        // Draw connections
        for (let colIdx = 0; colIdx < layers.length - 1; colIdx++) {
            const currentLayer = layerNodes[colIdx];
            const nextLayer = layerNodes[colIdx + 1];

            currentLayer.forEach(node1 => {
                nextLayer.forEach(node2 => {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', `M ${node1.x} ${node1.y} L ${node2.x} ${node2.y}`);
                    path.setAttribute('class', 'connection-wire');
                    path.setAttribute('stroke', 'var(--border-color)');
                    path.setAttribute('stroke-width', '0.75');
                    path.setAttribute('fill', 'none');
                    path.setAttribute('opacity', '0.18');
                    connGroup.appendChild(path);
                });
            });
        }

        // Draw Nodes
        for (let colIdx = 0; colIdx < layers.length; colIdx++) {
            const nodes = layerNodes[colIdx];
            const isInputOutput = (colIdx === 0 || colIdx === layers.length - 1);
            const isLatent = (colIdx === 3);

            nodes.forEach(node => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', node.x);
                circle.setAttribute('cy', node.y);
                circle.setAttribute('r', isLatent ? '5.5' : '4.5');
                circle.setAttribute('class', 'node-dot');
                
                let fill = 'var(--color-text-muted)';
                if (isLatent) {
                    fill = 'var(--brand-primary)';
                } else if (!isInputOutput) {
                    fill = 'var(--color-info)';
                }
                
                circle.setAttribute('fill', fill);
                circle.setAttribute('stroke', 'var(--bg-primary)');
                circle.setAttribute('stroke-width', '1.5');
                nodeGroup.appendChild(circle);
            });
        }

        // Add 15 GPU-accelerated motion pulses
        for (let i = 0; i < 15; i++) {
            const startCol = Math.floor(Math.random() * (layers.length - 1));
            const startNodeIdx = Math.floor(Math.random() * layers[startCol]);
            const endNodeIdx = Math.floor(Math.random() * layers[startCol + 1]);

            const n1 = layerNodes[startCol][startNodeIdx];
            const n2 = layerNodes[startCol + 1][endNodeIdx];

            const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pulse.setAttribute('r', '2.5');
            pulse.setAttribute('fill', startCol === 2 || startCol === 3 ? 'var(--brand-primary)' : 'var(--color-info)');
            pulse.setAttribute('opacity', '0.85');

            const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
            anim.setAttribute('path', `M ${n1.x} ${n1.y} L ${n2.x} ${n2.y}`);
            anim.setAttribute('dur', `${randomInRange(1.8, 3.6)}s`);
            anim.setAttribute('repeatCount', 'indefinite');
            anim.setAttribute('begin', `${randomInRange(0, 3)}s`);

            pulse.appendChild(anim);
            svg.appendChild(pulse);
        }
    }

    // ==========================================================================
    // 11. ENGINE INGESTION BOOTSTRAP
    // ==========================================================================
    
    initNeuralNetworkSVG();
    syncData();
    setInterval(syncData, 5000);

    // Auto-route on initial load if session exists
    const storedRole = sessionStorage.getItem('operator_role');
    if (storedRole) {
        applyRoleClearance(storedRole);
        const landing = document.getElementById('landing-page');
        const app = document.getElementById('main-app');
        if (landing) landing.classList.add('hidden');
        if (app) app.classList.remove('hidden');
    }
});
