// SmartSettled — App Logic (Firebase Firestore + Auth)

let redirectHandled = false;

// Run immediately after Firebase loads
window.addEventListener("load", async () => {
    if (window.handleGoogleRedirect) {
        await window.handleGoogleRedirect();
    }
    redirectHandled = true;
    
    // Manually trigger state evaluation now that redirect is resolved
    handleAuthState(auth.currentUser);
});

let currentUser = null, curGrp = null, people = [], settlementsList = [], expensesList = [];
let pChart = null, bChart = null, sim = null;

// --- Guest Mode ---
let isGuestMode = false;
let guestIdCounter = 1;
let guestData = { groups: [], members: {}, expenses: {}, settlements: {} };

// --- Google Auth Lock ---
let isGoogleSigningIn = false;

function handleAuthState(user) {
    console.log("Handling auth state for:", user ? user.email : "null");

    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');

    if (user) {
        currentUser = user;
        isGuestMode = false;

        if (authScreen) authScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        const guestBanner = document.getElementById('guest-banner');
        if (guestBanner) guestBanner.style.display = 'none';

        lucide.createIcons();
        updateUserDisplay();

        if (typeof loadGrps === "function") loadGrps();

    } else {
        currentUser = null;

        if (!isGuestMode) {
            if (authScreen) authScreen.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            const guestBanner = document.getElementById('guest-banner');
            if (guestBanner) guestBanner.style.display = 'none';
        }
        updateUserDisplay();
    }
}

// --- Auth State ---
auth.onAuthStateChanged(user => {
    // 🚫 IGNORE early trigger before redirect completes
    if (!redirectHandled) return;

    handleAuthState(user);
});

function logout() {
    const user = auth.currentUser;

    if (user) {
        auth.signOut().then(() => {
            window.location.reload();
        });
    } else {
        // guest logout fix
        localStorage.clear();
        window.location.reload();
    }
}

function changeUsername() {
    const newName = prompt("Enter new username:");

    if (!newName || !newName.trim()) return;

    const user = auth.currentUser;

    if (user) {
        user.updateProfile({
            displayName: newName
        }).then(() => {
            alert("Username updated");

            // 🔥 UPDATE UI WITHOUT RELOAD
            updateUserDisplay?.();
        });
    } else {
        // ✅ ALLOW guest username
        localStorage.setItem("guestUsername", newName);

        alert("Username updated (Guest)");

        // update UI instantly
        updateUserDisplay?.();
    }
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg; el.style.display = 'block';
}

async function handleAuth(isSignup) {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    const rememberMe = document.getElementById('remember-me').checked;
    document.getElementById('auth-error').style.display = 'none';
    if (!email || !pass) return showAuthError('Email and password required.');
    try {
        if (isSignup) await signupUser(email, pass, rememberMe);
        else await loginUser(email, pass, rememberMe);
    } catch (e) {
        showAuthError(e.message.replace('Firebase: ', ''));
    }
}

function toggleAuthMode() {
    const t = document.getElementById('auth-title');
    const b = document.getElementById('auth-submit');
    const s = document.getElementById('auth-switch');
    if (t.textContent === 'Sign In') {
        t.textContent = 'Create Account';
        b.textContent = 'Sign Up';
        b.setAttribute('onclick', 'handleAuth(true)');
        s.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode();return false">Sign In</a>';
    } else {
        t.textContent = 'Sign In';
        b.textContent = 'Sign In';
        b.setAttribute('onclick', 'handleAuth(false)');
        s.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode();return false">Sign Up</a>';
    }
}

// --- Forgot Password ---
async function handleForgotPassword() {
    const email = document.getElementById('auth-email').value.trim();
    if (!email) return showAuthError('Enter your email address first.');
    try {
        await sendResetEmail(email);
        document.getElementById('auth-error').style.display = 'none';
        notify(`Reset link sent to ${email}. Please check your inbox and spam folder.`, 'success');
    } catch (e) {
        showAuthError(e.message.replace('Firebase: ', ''));
    }
}

// --- Google Sign-In ---
async function handleGoogleLogin() {
    try {
        await loginWithGoogle(document.getElementById('remember-me').checked);
    } catch (e) {
        showAuthError(e.message);
    }
}

// --- Guest Mode ---
function enterGuestMode() {
    isGuestMode = true;
    guestIdCounter = 1;
    guestData = { groups: [{ id: 'g1', name: 'My Group', userId: 'guest' }], members: { g1: [] }, expenses: { g1: [] }, settlements: { g1: [] } };
    curGrp = 'g1';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    document.getElementById('guest-banner').style.display = 'block';
    document.getElementById('group-title').innerText = 'My Group';
    people = []; expensesList = []; settlementsList = [];
    lucide.createIcons();
    updateUserDisplay();
    renderGuestGroupList();
    clearUI();
}

function renderGuestGroupList() {
    const listEl = document.getElementById('grp-list');
    listEl.innerHTML = guestData.groups.map(g => {
        const safe = g.name.replace(/'/g, "\\'");
        return `<div class="list-item" onclick="selGrp('${g.id}', '${safe}')" style="cursor:pointer;">${g.name}</div>`;
    }).join("");
}

// --- User Display & UI ---
function updateUserDisplay() {
    const el = document.getElementById('user-display');
    const changeBtn = document.getElementById("change-username");

    if (currentUser) {
        changeBtn?.classList.remove("disabled-option");
    } else {
        changeBtn?.classList.add("disabled-option");
    }

    if (!el) return;
    if (isGuestMode) {
        el.innerHTML = `<div class="avatar-circle">G</div><span>Guest Mode</span>`;
    } else if (currentUser) {
        const name = currentUser.displayName || currentUser.email.split('@')[0];
        const initial = name.charAt(0).toUpperCase();
        el.innerHTML = `<div class="avatar-circle">${initial}</div><span>${name}</span>`;
    } else if (localStorage.getItem("guestUsername")) {
        const guestName = localStorage.getItem("guestUsername");
        el.innerHTML = `<div class="avatar-circle">${guestName.charAt(0).toUpperCase()}</div><span>${guestName}</span>`;
    } else {
        el.innerHTML = '';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

// --- Desktop Glow Effect (Login Page) ---
document.addEventListener('DOMContentLoaded', function() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
        authScreen.addEventListener('mousemove', function(e) {
            const glow = document.getElementById('auth-glow');
            if (glow) {
                glow.style.setProperty('--mouse-x', e.clientX + 'px');
                glow.style.setProperty('--mouse-y', e.clientY + 'px');
            }
        });
    }

    // [ISSUE 4] Logo Click Reload
    const logo = document.getElementById("app-logo");
    if (logo) logo.onclick = () => window.location.reload();

    const container = document.getElementById("app-container");
    if (container) {
        container.addEventListener("mousemove", (e) => {
            const x = e.clientX;
            const y = e.clientY;

            container.style.background = `
                radial-gradient(circle at ${x}px ${y}px, 
                rgba(99,102,241,0.15), 
                transparent 40%)
            `;
        });
    }

    const trigger = document.getElementById("profile-trigger");
    const dropdown = document.getElementById("profile-dropdown");

    if (trigger && dropdown) {
        trigger.addEventListener("click", () => {
            dropdown.classList.toggle("show");
        });
    }

    document.getElementById("change-username")?.addEventListener("click", () => {
        if (!auth.currentUser) {
            alert("Login required to change username");
            return;
        }
        changeUsername();
    });
    document.getElementById("logout-btn")?.addEventListener("click", logout);

    // [ISSUE 5] Mobile Navigation Fix (Call)
    if (!window.navInitialized) {
        setupMobileNavigation();
        window.navInitialized = true;
    }

    lucide.createIcons();
});

function setupMobileNavigation() {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach(item => {
    item.addEventListener("click", function () {
      const sectionId = this.dataset.section;

      if (!sectionId) return;

      // USE EXISTING SYSTEM
      switchSection(sectionId, this);

      // close sidebar (mobile)
      if (window.innerWidth <= 768) {
        document.getElementById("main-sidebar")?.classList.remove("open");
        document.getElementById("sidebar-overlay")?.classList.remove("open");
      }
    });
  });
}

// [ISSUE 3] Refresh Warning (UX Guard)
window.addEventListener("beforeunload", (e) => {
    const rememberMe = document.getElementById("remember-me")?.checked;
    if ((currentUser && !rememberMe) || isGuestMode) {
        e.preventDefault();
        e.returnValue = "";
    }
});

// --- Navigation ---
function switchSection(id, element) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    element.classList.add('active');
    if (id === 'analytics') setTimeout(() => renderCharts(), 100);
    if (id === 'graph-view') setTimeout(() => computeStatus(), 100);
}

function notify(msg, type = 'success') {
    if (typeof Toastify === 'undefined') { alert(msg); return; }
    Toastify({
        text: msg, duration: 3000, gravity: "top", position: "right",
        style: { background: type === 'success' ? "linear-gradient(to right, #6366f1, #818cf8)" : "#ef4444", borderRadius: "10px" }
    }).showToast();
}

function toggleGrp() {
    const m = document.getElementById('grp-modal');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function clearUI() {
    document.getElementById('st-total').innerText = "₹0";
    document.getElementById('st-best').innerText = "-";
    document.getElementById('st-debtor').innerText = "-";
    document.getElementById('st-count').innerText = "0";
    document.getElementById('optimized-list').innerHTML = '<div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:12px; color:var(--text-dim); font-size:0.9rem; text-align:center;">Select or Create a group to see settlements.</div>';
    document.getElementById('people-list').innerHTML = '<p style="color:var(--text-dim); font-size:0.85rem; padding:10px; text-align:center;">No members.</p>';
    document.getElementById('ex-history').innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:2rem;">No history.</p>';
    document.getElementById('settle-history').innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">No history.</p>';
    if (pChart) { pChart.destroy(); pChart = null; }
    if (bChart) { bChart.destroy(); bChart = null; }
    if (sim) { sim.stop(); d3.select("#graph-container").selectAll("*").remove(); }
}

// --- Refresh ---
async function refresh() {
    if (!curGrp) { clearUI(); return; }
    await loadPpl();
    await loadEx();
    await loadSettlements();
    computeStatus();
}

// --- Groups ---
async function loadGrps() {
    if (isGuestMode) { renderGuestGroupList(); await refresh(); return; }
    try {
        const snap = await db.collection('groups').where('userId', '==', currentUser.uid).get();
        const data = [];
        snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        const listEl = document.getElementById('grp-list');
        listEl.innerHTML = data.map(g => {
            const safe = (g.name || '').replace(/'/g, "\\'");
            return `<div class="list-item" onclick="selGrp('${g.id}', '${safe}')" style="cursor:pointer;">${g.name}</div>`;
        }).join("");
        if (data.length > 0) {
            const current = curGrp ? data.find(g => g.id === curGrp) : null;
            const picked = current || data[0];
            curGrp = picked.id;
            document.getElementById('group-title').innerText = picked.name;
            await refresh();
        } else {
            curGrp = null;
            document.getElementById('group-title').innerText = "Create a Group";
            clearUI();
        }
    } catch (err) { console.error(err); }
}

async function selGrp(id, name) {
    curGrp = id;
    document.getElementById('group-title').innerText = name;
    toggleGrp();
    await refresh();
    switchSection('dashboard', document.querySelector('.nav-item'));
}

async function addGrp() {
    const el = document.getElementById('new-grp-name');
    const name = el.value.trim();
    if (!name) return;
    if (isGuestMode) {
        const id = 'g' + (++guestIdCounter);
        guestData.groups.push({ id, name, userId: 'guest' });
        guestData.members[id] = []; guestData.expenses[id] = []; guestData.settlements[id] = [];
        el.value = ""; curGrp = id;
        document.getElementById('group-title').innerText = name;
        renderGuestGroupList(); clearUI(); return;
    }
    await db.collection('groups').add({ name, userId: currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    el.value = "";
    await loadGrps();
}

async function deleteGrp() {
    if (!curGrp || !confirm("Permanently delete this group and all its data?")) return;
    if (isGuestMode) {
        guestData.groups = guestData.groups.filter(g => g.id !== curGrp);
        delete guestData.members[curGrp]; delete guestData.expenses[curGrp]; delete guestData.settlements[curGrp];
        curGrp = guestData.groups.length ? guestData.groups[0].id : null;
        if (curGrp) document.getElementById('group-title').innerText = guestData.groups[0].name;
        else document.getElementById('group-title').innerText = 'Create a Group';
        notify("Group Deleted", "error"); renderGuestGroupList(); people=[]; expensesList=[]; settlementsList=[]; clearUI(); return;
    }
    const uid = currentUser.uid;
    const batch = db.batch();
    const cols = ['members', 'expenses', 'settlements'];
    for (const col of cols) {
        const snap = await db.collection(col).where('userId', '==', uid).where('groupId', '==', curGrp).get();
        snap.forEach(doc => batch.delete(doc.ref));
    }
    batch.delete(db.collection('groups').doc(curGrp));
    await batch.commit();
    curGrp = null;
    notify("Group Deleted", "error");
    await loadGrps();
}

async function clearGrpData() {
    if (!curGrp || !confirm("Wipe all members and expenses from this group?")) return;
    if (isGuestMode) {
        guestData.members[curGrp] = []; guestData.expenses[curGrp] = []; guestData.settlements[curGrp] = [];
        people=[]; expensesList=[]; settlementsList=[]; notify("Data Wiped", "error"); computeStatus(); clearUI(); return;
    }
    const uid = currentUser.uid;
    const batch = db.batch();
    const cols = ['members', 'expenses', 'settlements'];
    for (const col of cols) {
        const snap = await db.collection(col).where('userId', '==', uid).where('groupId', '==', curGrp).get();
        snap.forEach(doc => batch.delete(doc.ref));
    }
    await batch.commit();
    notify("Data Wiped", "error");
    await refresh();
}

// --- Members ---
async function loadPpl() {
    if (isGuestMode) {
        people = (guestData.members[curGrp] || []).slice();
    } else {
        const snap = await db.collection('members').where('userId', '==', currentUser.uid).where('groupId', '==', curGrp).get();
        people = [];
        snap.forEach(doc => people.push(doc.data().name));
    }
    document.getElementById('people-list').innerHTML = people.length ?
        people.map(p => `<div class="list-item"><span>${p}</span></div>`).join("") :
        '<p style="color:var(--text-dim); font-size:0.85rem; padding:10px; text-align:center;">No members yet.</p>';
    ['ex-payer', 'user-pdf-sel'].forEach(id => {
        document.getElementById(id).innerHTML = people.map(p => `<option value="${p}">${p}</option>`).join("");
    });
    document.getElementById('ex-parts').innerHTML = people.map(p => `<div class="pill selected" onclick="this.classList.toggle('selected')">${p}</div>`).join("");
}

async function addMem() {
    const el = document.getElementById('member-search');
    if (!el.value.trim()) return;
    if (isGuestMode) {
        if (!guestData.members[curGrp]) guestData.members[curGrp] = [];
        guestData.members[curGrp].push(el.value.trim());
        el.value = ""; await refresh(); return;
    }
    await db.collection('members').add({ name: el.value.trim(), groupId: curGrp, userId: currentUser.uid });
    el.value = "";
    await refresh();
}

// --- Expenses ---
async function loadEx() {
    if (isGuestMode) {
        expensesList = (guestData.expenses[curGrp] || []).slice();
    } else {
        const snap = await db.collection('expenses').where('userId', '==', currentUser.uid).where('groupId', '==', curGrp).get();
        expensesList = [];
        snap.forEach(doc => expensesList.push({ id: doc.id, ...doc.data() }));
        expensesList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    const container = document.getElementById('ex-history');
    container.innerHTML = expensesList.length ? expensesList.map(e => {
        const date = e.createdAt?.toDate ? e.createdAt.toDate().toISOString().split('T')[0] : (e.date || '');
        return `<div class="list-item">
            <div><strong>${e.description || 'Exp'}</strong><br><small style="color:var(--text-dim)">Paid by ${e.payer}</small></div>
            <div style="text-align:right"><strong>₹${e.amount}</strong><br><small style="font-size:0.7rem">${date}</small></div>
        </div>`;
    }).join("") : '<p style="color:var(--text-dim); text-align:center; padding:2rem;">No expenses yet.</p>';
}

async function addEx() {
    const p = document.getElementById('ex-payer').value;
    const a = parseFloat(document.getElementById('ex-amt').value);
    const d = document.getElementById('ex-desc').value;
    const parts = Array.from(document.querySelectorAll('#ex-parts .pill.selected')).map(el => el.innerText);
    if (!a || !parts.length) return notify("Missing amount or split!", "error");
    if (isGuestMode) {
        if (!guestData.expenses[curGrp]) guestData.expenses[curGrp] = [];
        guestData.expenses[curGrp].push({ id: 'e'+(++guestIdCounter), payer:p, amount:a, description:d, participants:parts, date:new Date().toISOString().split('T')[0] });
    } else {
        await db.collection('expenses').add({
            groupId: curGrp, userId: currentUser.uid, payer: p, amount: a,
            description: d, participants: parts, createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    document.getElementById('ex-amt').value = "";
    document.getElementById('ex-desc').value = "";
    await refresh();
}

// --- Settlements ---
async function loadSettlements() {
    if (isGuestMode) {
        settlementsList = (guestData.settlements[curGrp] || []).slice();
    } else {
        const snap = await db.collection('settlements').where('userId', '==', currentUser.uid).where('groupId', '==', curGrp).get();
        settlementsList = [];
        snap.forEach(doc => settlementsList.push({ id: doc.id, ...doc.data() }));
        settlementsList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    filterSettle();
}

function filterSettle() {
    const q = document.getElementById('settle-search').value.toLowerCase();
    const filtered = settlementsList.filter(s => s.payer.toLowerCase().includes(q) || s.receiver.toLowerCase().includes(q));
    const container = document.getElementById('settle-history');
    container.innerHTML = filtered.length ? filtered.map(s => {
        const date = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : '';
        return `<div class="list-item">
            <div><strong>${s.payer} paid ${s.receiver}</strong><br><small style="color:var(--text-dim)">${date}</small></div>
            <div style="color:var(--primary-light)">₹${s.amount}</div>
        </div>`;
    }).join("") : '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">No settlements found.</p>';
}

async function settleNow(f, t, a) {
    if (isGuestMode) {
        if (!guestData.settlements[curGrp]) guestData.settlements[curGrp] = [];
        guestData.settlements[curGrp].push({ id:'s'+(++guestIdCounter), payer:f, receiver:t, amount:a, date:new Date().toLocaleString() });
    } else {
        await db.collection('settlements').add({
            groupId: curGrp, userId: currentUser.uid, payer: f, receiver: t, amount: a,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
    notify("Payment Recorded!");
    await refresh();
}

// --- Core Algorithm ---
function optimizeDebts(balances) {
    const creditors = [], debtors = [];
    for (const [name, bal] of Object.entries(balances)) {
        if (bal > 0.01) creditors.push([name, bal]);
        else if (bal < -0.01) debtors.push([name, -bal]);
    }
    const transactions = [];
    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
        const settleAmt = Math.min(creditors[i][1], debtors[j][1]);
        if (settleAmt > 0.01) {
            transactions.push({ from: debtors[j][0], to: creditors[i][0], amount: Math.round(settleAmt * 100) / 100 });
        }
        creditors[i][1] -= settleAmt;
        debtors[j][1] -= settleAmt;
        if (creditors[i][1] < 0.01) i++;
        if (debtors[j][1] < 0.01) j++;
    }
    return transactions;
}

// --- Status (computed client-side) ---
function computeStatus() {
    const balances = {};
    people.forEach(n => balances[n] = 0.0);
    let totalSpent = 0;
    expensesList.forEach(e => {
        totalSpent += e.amount;
        const parts = e.participants || [];
        if (parts.length) {
            const split = e.amount / parts.length;
            parts.forEach(p => { if (p in balances) balances[p] -= split; });
            if (e.payer in balances) balances[e.payer] += e.amount;
        }
    });
    settlementsList.forEach(s => {
        if (s.payer in balances) balances[s.payer] += s.amount;
        if (s.receiver in balances) balances[s.receiver] -= s.amount;
    });
    let highSpender = '-', mostOwed = '-', maxB = -Infinity, minB = Infinity;
    for (const [name, bal] of Object.entries(balances)) {
        if (bal > maxB) { maxB = bal; highSpender = name; }
        if (bal < minB) { minB = bal; mostOwed = name; }
    }
    if (Object.keys(balances).length === 0) { highSpender = '-'; mostOwed = '-'; }
    const optimized = optimizeDebts(balances);

    document.getElementById('st-total').innerText = `₹${totalSpent.toLocaleString()}`;
    document.getElementById('st-best').innerText = highSpender;
    document.getElementById('st-debtor').innerText = mostOwed;
    document.getElementById('st-count').innerText = expensesList.length;

    const optList = document.getElementById('optimized-list');
    optList.innerHTML = optimized.length ? optimized.map(t => {
        const sf = t.from.replace(/'/g, "\\'"), st = t.to.replace(/'/g, "\\'");
        return `<div class="list-item">
            <span>${t.from} → ${t.to} <strong style="color:var(--primary-light)">₹${t.amount}</strong></span>
            <button class="btn btn-primary btn-sm" onclick="settleNow('${sf}', '${st}', ${t.amount})">Mark Paid</button>
        </div>`;
    }).join("") : '<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:1rem; border-radius:12px; color:#10b981; font-size:0.9rem; text-align:center;">All accounts settled!</div>';

    lucide.createIcons();
    if (document.getElementById('graph-view').classList.contains('active')) renderGraph(optimized);
    if (document.getElementById('analytics').classList.contains('active')) renderCharts(balances);
    window._lastBalances = balances;
    window._lastOptimized = optimized;
}

// --- Graph ---
function renderGraph(links) {
    const cont = document.getElementById('graph-container');
    if (!cont || cont.clientWidth === 0) return;
    cont.innerHTML = "";
    const w = cont.clientWidth, h = cont.clientHeight;
    const svg = d3.select("#graph-container").append("svg").attr("width", w).attr("height", h);
    const nodes = people.map(p => ({ id: p }));
    const edges = links.map(l => ({ source: l.from, target: l.to, val: l.amount }));
    sim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(edges).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-600))
        .force("center", d3.forceCenter(w / 2, h / 2))
        .force("x", d3.forceX(w / 2).strength(0.05))
        .force("y", d3.forceY(h / 2).strength(0.05));
    svg.append("defs").append("marker").attr("id", "arr").attr("viewBox", "0 -5 10 10").attr("refX", 25).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#6366f1");
    const link = svg.selectAll("line").data(edges).join("line").attr("stroke", "rgba(99,102,241,0.3)").attr("stroke-width", d => Math.sqrt(d.val) / 2 + 1).attr("marker-end", "url(#arr)");
    const node = svg.selectAll("g").data(nodes).join("g").call(d3.drag()
        .on("start", e => { if (!e.active) sim.alphaTarget(0.3).restart(); e.subject.fx = e.x; e.subject.fy = e.y; })
        .on("drag", e => { e.subject.fx = e.x; e.subject.fy = e.y; })
        .on("end", e => { if (!e.active) sim.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }));
    node.append("circle").attr("r", 15).attr("fill", "var(--primary)").attr("stroke", "#fff").attr("stroke-width", 2);
    node.append("text").text(d => d.id).attr("x", 20).attr("y", 5).attr("fill", "#fff").attr("font-size", "12px").attr("font-weight", "600");
    sim.on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

// --- Charts ---
async function renderCharts(balances) {
    const ctxP = document.getElementById('pie'), ctxB = document.getElementById('bar');
    if (!ctxP || ctxP.clientWidth === 0) return;
    if (!balances) balances = window._lastBalances || {};
    const names = Object.keys(balances), vals = Object.values(balances);
    if (!names.length) return;
    if (pChart) pChart.destroy();
    if (bChart) bChart.destroy();
    pChart = new Chart(ctxP, { type: 'doughnut', data: { labels: names, datasets: [{ data: vals.map(v => Math.abs(v)), backgroundColor: ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#8b5cf6'], borderColor: 'transparent' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } } } } });
    bChart = new Chart(ctxB, { type: 'bar', data: { labels: names, datasets: [{ data: vals, backgroundColor: vals.map(v => v >= 0 ? '#10b981' : '#ef4444'), borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { ticks: { color: '#94a3b8' }, grid: { display: false } } }, plugins: { legend: { display: false } } } });
}

// --- PDF Export (jsPDF) ---
async function expAll() {
    if (!curGrp || people.length === 0) return notify("No data to export!", "error");
    notify("Generating report...", "success");
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const groupName = document.getElementById('group-title').innerText;
        const balances = window._lastBalances || {};
        const totalSpent = expensesList.reduce((s, e) => s + e.amount, 0);
        // Title
        doc.setFontSize(22); doc.setTextColor(37, 99, 235);
        doc.text(`Settlement Report - ${groupName}`, 14, 22);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 30);
        // Summary table
        doc.setFontSize(14); doc.setTextColor(0);
        doc.text("Financial Summary", 14, 42);
        doc.autoTable({ startY: 46, head: [['Metric', 'Value']], body: [
            ['Group', groupName], ['Total Expenses', `Rs. ${totalSpent.toFixed(2)}`],
            ['Members', String(people.length)], ['Transactions', String(expensesList.length + settlementsList.length)]
        ], theme: 'grid', headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }, styles: { textColor: [0, 0, 0] } });
        // Graph snapshot
        const svgEl = document.querySelector("#graph-container svg");
        if (svgEl) {
            try {
                const clone = svgEl.cloneNode(true);
                clone.setAttribute("width", 1200); clone.setAttribute("height", 700);
                const xml = new XMLSerializer().serializeToString(clone);
                const svg64 = btoa(unescape(encodeURIComponent(xml)));
                const canvas = document.createElement("canvas");
                canvas.width = 1200; canvas.height = 700;
                const ctx = canvas.getContext("2d");
                const img = new Image();
                img.src = 'data:image/svg+xml;base64,' + svg64;
                await new Promise(r => img.onload = r);
                ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, 1200, 700);
                ctx.drawImage(img, 0, 0);
                const imgData = canvas.toDataURL("image/png");
                const y = doc.lastAutoTable.finalY + 10;
                doc.setFontSize(14); doc.text("Debt Visualization Graph", 14, y);
                doc.addImage(imgData, 'PNG', 14, y + 4, 180, 100);
            } catch (ge) { console.warn("Graph capture failed:", ge); }
        }
        // Balance table
        let ty = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 80) + (svgEl ? 120 : 10);
        if (ty > 250) { doc.addPage(); ty = 20; }
        doc.setFontSize(14); doc.setTextColor(0);
        doc.text("Detailed Balances", 14, ty);
        const balRows = Object.entries(balances).map(([n, b]) => [n, `${b >= 0 ? '+' : ''}${b.toFixed(2)}`]);
        doc.autoTable({ startY: ty + 4, head: [['User', 'Net Balance (Rs.)']], body: balRows, theme: 'grid', headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }, styles: { textColor: [0, 0, 0] } });
        doc.save(`report_${groupName.replace(/\s+/g, '_')}.pdf`);
        notify("PDF Generated!");
    } catch (e) { console.error(e); notify("PDF generation failed.", "error"); }
}

async function expUser() {
    if (!curGrp) return notify("Select a group first!", "error");
    const userName = document.getElementById('user-pdf-sel').value;
    if (!userName) return notify("Select a member!", "error");
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let personalSpent = 0, personalOwed = 0;
        const rows = [];
        expensesList.forEach(e => {
            const parts = e.participants || [];
            const date = e.createdAt?.toDate ? e.createdAt.toDate().toISOString().split('T')[0] : '';
            if (e.payer === userName) {
                rows.push([date, e.description || 'Exp', `Paid Rs. ${e.amount.toFixed(2)}`]);
                personalSpent += e.amount;
            } else if (parts.includes(userName)) {
                const split = e.amount / parts.length;
                rows.push([date, `Shared (${e.payer})`, `Owed Rs. ${split.toFixed(2)}`]);
                personalOwed += split;
            }
        });
        settlementsList.forEach(s => {
            const date = s.createdAt?.toDate ? s.createdAt.toDate().toISOString().split('T')[0] : '';
            if (s.payer === userName) rows.push([date, `Payment to ${s.receiver}`, `Settled Rs. ${s.amount.toFixed(2)}`]);
            else if (s.receiver === userName) rows.push([date, `Payment from ${s.payer}`, `Received Rs. ${s.amount.toFixed(2)}`]);
        });
        doc.setFontSize(22); doc.setTextColor(37, 99, 235);
        doc.text(`Personal Activity - ${userName}`, 14, 22);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 30);
        doc.autoTable({ startY: 38, head: [['Metric', 'Value']], body: [
            ['User', userName], ['Total Paid/Settled', `Rs. ${personalSpent.toFixed(2)}`],
            ['Total Owed', `Rs. ${personalOwed.toFixed(2)}`], ['Net Position', `Rs. ${(personalSpent - personalOwed).toFixed(2)}`]
        ], theme: 'grid', headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }, styles: { textColor: [0, 0, 0] } });
        const y2 = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(14); doc.setTextColor(0);
        doc.text("Transaction Details", 14, y2);
        doc.autoTable({ startY: y2 + 4, head: [['Date', 'Description', 'Detail']], body: rows.length ? rows : [['—', 'No activity', '—']], theme: 'grid', headStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0] }, styles: { textColor: [0, 0, 0] } });
        doc.save(`report_${userName}.pdf`);
        notify("User PDF Generated!");
    } catch (e) { console.error(e); notify("PDF generation failed.", "error"); }
}
