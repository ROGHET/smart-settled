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

    const splashScreen = document.getElementById('splash-screen');
    const authScreen = document.getElementById('auth-screen');
    const appContainer = document.getElementById('app-container');
    const hubScreen = document.getElementById('group-hub-screen');

    // Always hide splash first
    if (splashScreen) splashScreen.style.display = 'none';

    if (user) {
        currentUser = user;
        isGuestMode = false;

        if (authScreen) authScreen.style.display = 'none';
        if (hubScreen) hubScreen.style.display = 'block';
        if (appContainer) appContainer.style.display = 'none';
        
        const guestBanner = document.getElementById('guest-banner');
        if (guestBanner) guestBanner.style.display = 'none';

        lucide.createIcons();
        updateUserDisplay();

        if (typeof loadGrps === "function") loadGrpsForHub();

    } else {
        currentUser = null;

        if (!isGuestMode) {
            if (authScreen) authScreen.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            if (hubScreen) hubScreen.style.display = 'none';
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
        }).then(async () => {
            // Update collaboratorDetails in all groups containing this user
            try {
                const uid = user.uid;
                const snap = await db.collection('groups').where('contributorUids', 'array-contains', uid).get();
                const batch = db.batch();
                snap.forEach(doc => {
                    batch.update(doc.ref, {
                        ['collaboratorDetails.' + uid + '.name']: newName.trim()
                    });
                });
                await batch.commit();
            } catch (e) { console.error('Failed to sync username to groups:', e); }

            notify("Username updated!");
            updateUserDisplay?.();
        });
    } else {
        // ✅ ALLOW guest username
        localStorage.setItem("guestUsername", newName);

        notify("Username updated (Guest)");

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
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('group-hub-screen').style.display = 'none';
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
    listEl.innerHTML = guestData.groups.map((g, idx) => {
        const safe = g.name.replace(/'/g, "\\'");
        return `<div class="list-item grp-item">
            <span class="grp-item-name" onclick="selGrp('${g.id}', '${safe}')">${g.name}</span>
            <button class="grp-action-btn" onclick="editGrpName('${g.id}', '${safe}')" title="Edit"><i data-lucide="pencil" style="width:14px;height:14px;color:var(--text-main)"></i></button>
            <button class="grp-action-btn delete" onclick="deleteSpecificGrp('${g.id}')" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
        </div>`;
    }).join("");
    if (window.lucide) lucide.createIcons();
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

    // --- Mobile Swipe Gestures ---
    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dy > 60) return;
        const sidebar = document.getElementById('main-sidebar');
        if (dx > 60 && touchStartX < 40) toggleSidebar();
        if (dx < -60 && sidebar.classList.contains('open')) toggleSidebar();
    }, { passive: true });

    // --- Close dropdowns on outside click ---
    document.addEventListener('click', e => {
        const pd = document.getElementById('profile-dropdown');
        const pt = document.getElementById('profile-trigger');
        if (pd && pd.classList.contains('show') && !pt.contains(e.target) && !pd.contains(e.target))
            pd.classList.remove('show');
        const sd = document.getElementById('share-dropdown');
        if (sd && sd.classList.contains('show') && !e.target.closest('[onclick*="share-dropdown"]'))
            sd.classList.remove('show');
    });

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
    // Enforce section isolation: hide ALL sections first
    document.querySelectorAll('.section').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
    if (element) element.classList.add('active');
    if (id === 'analytics') setTimeout(() => renderCharts(), 100);
    if (id === 'graph-view') setTimeout(() => computeStatus(), 100);
    if (id === 'settlements') renderSettledExpenses();
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
        const uid = currentUser.uid;
        const ownedSnap = await db.collection('groups').where('userId', '==', uid).get();
        const sharedSnap = await db.collection('groups').where('contributorUids', 'array-contains', uid).get();
        
        const dataMap = new Map();
        ownedSnap.forEach(doc => dataMap.set(doc.id, { id: doc.id, ...doc.data() }));
        sharedSnap.forEach(doc => dataMap.set(doc.id, { id: doc.id, ...doc.data() }));
        
        const data = Array.from(dataMap.values());
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        
        // Fix 1: Patch missing collaboratorDetails for current user
        const userName = currentUser.displayName || currentUser.email.split('@')[0];
        const userEmail = currentUser.email;
        for (const g of data) {
            const details = g.collaboratorDetails || {};
            if (!details[uid]) {
                details[uid] = { name: userName, email: userEmail };
                g.collaboratorDetails = details;
                try {
                    await db.collection('groups').doc(g.id).update({
                        ['collaboratorDetails.' + uid]: { name: userName, email: userEmail }
                    });
                } catch (e) { console.warn('Could not patch collaborator details for', g.id); }
            }
        }
        
        window.allUserGroups = data; // store for reference
        
        const listEl = document.getElementById('grp-list');
        listEl.innerHTML = data.map(g => {
            const safe = (g.name || '').replace(/'/g, "\\'");
            const isOwner = g.userId === uid;
            const iconType = isOwner ? 'folder' : 'users';
            
            // Owners can edit/delete. Shared users can leave.
            const actions = isOwner 
                ? `<button class="grp-action-btn" onclick="editGrpName('${g.id}', '${safe}')" title="Edit"><i data-lucide="pencil" style="width:14px;height:14px;color:var(--text-main)"></i></button>
                   <button class="grp-action-btn delete" onclick="deleteSpecificGrp('${g.id}')" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>`
                : `<button class="grp-action-btn delete" onclick="leaveGrp('${g.id}')" title="Leave Group"><i data-lucide="log-out" style="width:14px;height:14px"></i></button>`;

            return `<div class="list-item grp-item">
                <i data-lucide="${iconType}" style="width:16px;height:16px;color:var(--text-dim)"></i>
                <span class="grp-item-name" onclick="selGrp('${g.id}', '${safe}')">${g.name}</span>
                ${actions}
            </div>`;
        }).join("");
        if (window.lucide) lucide.createIcons();
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

// --- Hub Screen Group Loader ---
async function loadGrpsForHub() {
    if (isGuestMode) return;
    try {
        const uid = currentUser.uid;
        const ownedSnap = await db.collection('groups').where('userId', '==', uid).get();
        const sharedSnap = await db.collection('groups').where('contributorUids', 'array-contains', uid).get();
        const dataMap = new Map();
        ownedSnap.forEach(doc => dataMap.set(doc.id, { id: doc.id, ...doc.data() }));
        sharedSnap.forEach(doc => dataMap.set(doc.id, { id: doc.id, ...doc.data() }));
        const data = Array.from(dataMap.values());
        data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        
        // Patch missing collaborator details
        const userName = currentUser.displayName || currentUser.email.split('@')[0];
        const userEmail = currentUser.email;
        for (const g of data) {
            const details = g.collaboratorDetails || {};
            if (!details[uid]) {
                details[uid] = { name: userName, email: userEmail };
                g.collaboratorDetails = details;
                try { await db.collection('groups').doc(g.id).update({ ['collaboratorDetails.' + uid]: { name: userName, email: userEmail } }); } catch(e) {}
            }
        }
        
        window.allUserGroups = data;
        renderGroupHub(data);
    } catch (err) { console.error(err); }
}

async function renderGroupHub(groups) {
    const grid = document.getElementById('hub-grid');
    if (!groups || !groups.length) {
        grid.innerHTML = '<div class="hub-empty"><p>No groups yet. Create one or join with a code!</p></div>';
        if (window.lucide) lucide.createIcons();
        return;
    }
    // Render cards with loading summaries
    grid.innerHTML = groups.map(g => {
        const safe = (g.name || '').replace(/'/g, "\\'");
        return `<div class="hub-group-card" onclick="enterGroupFromHub('${g.id}', '${safe}')">
            <div class="hub-card-name">${g.name}</div>
            <div class="hub-card-summary" id="hub-summary-${g.id}">Loading...</div>
            <div class="hub-card-actions">
                <button onclick="event.stopPropagation(); shareGroupFromHub('${g.id}')"><i data-lucide="share-2" style="width:12px;height:12px"></i> Share</button>
            </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
    
    // Load summaries async per group
    for (const g of groups) {
        loadHubGroupSummary(g);
    }
}

async function loadHubGroupSummary(group) {
    const el = document.getElementById('hub-summary-' + group.id);
    if (!el) return;
    try {
        const exSnap = await db.collection('expenses').where('groupId', '==', group.id).get();
        const setSnap = await db.collection('settlements').where('groupId', '==', group.id).get();
        const memSnap = await db.collection('members').where('groupId', '==', group.id).get();
        const members = []; memSnap.forEach(doc => members.push(doc.data().name));
        const expenses = []; exSnap.forEach(doc => expenses.push(doc.data()));
        const settlements = []; setSnap.forEach(doc => settlements.push(doc.data()));
        
        if (!expenses.length) { el.textContent = 'No expenses yet'; return; }
        
        // Compute balances
        const balances = {};
        members.forEach(n => balances[n] = 0);
        expenses.forEach(e => {
            if (e.settled && (!e.settledBy || Object.keys(e.settledBy).length === 0)) return;
            const parts = e.participants || [];
            if (!parts.length) return;
            const cs = e.customSplits || {};
            if (Object.keys(cs).length > 0) {
                let tc = 0;
                parts.forEach(p => { const ps = cs[p] !== undefined ? cs[p] : 0; if (ps > 0 && p in balances) balances[p] -= ps; tc += ps; });
                if (e.payer in balances) balances[e.payer] += tc;
            } else {
                const split = e.amount / parts.length;
                parts.forEach(p => { if (p in balances) balances[p] -= split; });
                if (e.payer in balances) balances[e.payer] += e.amount;
            }
        });
        settlements.forEach(s => {
            if (s.payer in balances) balances[s.payer] += s.amount;
            if (s.receiver in balances) balances[s.receiver] -= s.amount;
        });
        
        // Check personal association
        const assoc = group.memberAssociations || {};
        const myMember = Object.entries(assoc).find(([m, uid]) => uid === currentUser?.uid)?.[0];
        
        if (myMember && balances[myMember] !== undefined) {
            const bal = Math.round(balances[myMember] * 100) / 100;
            if (bal < -0.01) el.innerHTML = `<span style="color:#ef4444">You owe ₹${Math.abs(bal).toFixed(2)}</span>`;
            else if (bal > 0.01) el.innerHTML = `<span style="color:#10b981">You are owed ₹${bal.toFixed(2)}</span>`;
            else el.innerHTML = `<span style="color:#10b981">All settled ✓</span>`;
        } else {
            const opt = optimizeDebts(balances);
            el.textContent = opt.length === 0 ? 'All settled ✓' : `${members.length} members · ${expenses.length} expenses`;
        }
    } catch (e) { el.textContent = 'Could not load summary'; }
}

function enterGroupFromHub(id, name) {
    curGrp = id;
    document.getElementById('group-title').innerText = name;
    document.getElementById('group-hub-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    loadGrps();
    switchSection('dashboard', document.querySelector('.nav-item'));
}

function shareGroupFromHub(groupId) {
    const link = `${window.location.origin}?group=${groupId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => notify('Invite link copied!')).catch(() => prompt('Copy this:', link));
    } else { prompt('Copy this:', link); }
}

async function hubCreateGroup() {
    const el = document.getElementById('hub-group-input');
    const name = el.value.trim();
    if (!name) { notify('Enter a group name', 'error'); return; }
    const uid = currentUser.uid;
    const userName = currentUser.displayName || currentUser.email.split('@')[0];
    const userEmail = currentUser.email;
    await db.collection('groups').add({ name, userId: uid, contributorUids: [uid], collaboratorDetails: { [uid]: { name: userName, email: userEmail } }, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    el.value = '';
    await loadGrpsForHub();
    notify('Group created!');
}

async function hubJoinGroup() {
    const el = document.getElementById('hub-group-input');
    const code = el.value.trim();
    if (!code) { notify('Enter a group code', 'error'); return; }
    el.value = '';
    await processGroupJoin(code);
    await loadGrpsForHub();
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
    const uid = currentUser.uid;
    const userName = currentUser.displayName || currentUser.email.split('@')[0];
    const userEmail = currentUser.email;

    await db.collection('groups').add({ 
        name, 
        userId: uid, 
        contributorUids: [uid],
        collaboratorDetails: {
            [uid]: { name: userName, email: userEmail }
        },
        createdAt: firebase.firestore.FieldValue.serverTimestamp() 
    });
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
    
    // Admin check
    const currentGroupData = window.allUserGroups?.find(g => g.id === curGrp);
    if (currentGroupData && currentGroupData.userId !== currentUser.uid) {
        notify("Only the creator can delete the group.", "error");
        return;
    }

    const batch = db.batch();
    const cols = ['members', 'expenses', 'settlements'];
    for (const col of cols) {
        const snap = await db.collection(col).where('groupId', '==', curGrp).get();
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
    
    // Admin check
    const currentGroupData = window.allUserGroups?.find(g => g.id === curGrp);
    if (currentGroupData && currentGroupData.userId !== currentUser.uid) {
        notify("Only the creator can clear group data.", "error");
        return;
    }

    const batch = db.batch();
    const cols = ['members', 'expenses', 'settlements'];
    for (const col of cols) {
        const snap = await db.collection(col).where('groupId', '==', curGrp).get();
        snap.forEach(doc => batch.delete(doc.ref));
    }
    await batch.commit();
    notify("Data Wiped", "error");
    await refresh();
}

async function leaveGrp(groupId) {
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
        const docRef = db.collection('groups').doc(groupId);
        
        // Use a transaction to safely remove user and delete if empty
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (!doc.exists) return;
            const data = doc.data();
            const uids = data.contributorUids || [];
            const newUids = uids.filter(uid => uid !== currentUser.uid);
            
            if (newUids.length === 0) {
                // If last person leaves, we could delete it, but let's just remove the uid.
                // It might be orphaned, or we can handle full deletion here.
                // Since this requires deleting subcollections, and transactions can't easily 
                // do complex queries for subcollections safely, we'll just remove the UID.
                // The group becomes inaccessible, which is fine.
                transaction.update(docRef, { contributorUids: [] });
            } else {
                const details = data.collaboratorDetails || {};
                delete details[currentUser.uid];
                transaction.update(docRef, { 
                    contributorUids: newUids,
                    collaboratorDetails: details
                });
            }
        });
        
        notify("Left the group");
        await loadGrps();
    } catch (e) {
        console.error("Error leaving group", e);
        notify("Failed to leave group", "error");
    }
}

// --- Members ---
async function loadPpl() {
    if (isGuestMode) {
        people = (guestData.members[curGrp] || []).slice();
    } else {
        const snap = await db.collection('members').where('groupId', '==', curGrp).get();
        people = [];
        snap.forEach(doc => people.push(doc.data().name));
    }
    
    // Load member associations
    const currentGroupData = window.allUserGroups?.find(g => g.id === curGrp);
    const associations = (currentGroupData?.memberAssociations) || {};
    window._currentAssociations = associations;
    
    document.getElementById('people-list').innerHTML = people.length ?
        people.map(p => {
            const safeName = p.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            const assocUid = associations[p];
            const isMyAssoc = assocUid === currentUser?.uid;
            const isTaken = assocUid && assocUid !== currentUser?.uid;
            const checkboxDisabled = isTaken ? 'disabled' : '';
            const checkboxChecked = isMyAssoc ? 'checked' : '';
            
            // Show associated user's displayName if available
            let displayName = p;
            if (assocUid && currentGroupData?.collaboratorDetails?.[assocUid]) {
                displayName = currentGroupData.collaboratorDetails[assocUid].name || p;
            }
            
            const assocCheckbox = !isGuestMode ? `<label class="assoc-checkbox-label" title="${isTaken ? 'Claimed by another user' : 'Associate yourself with this member'}">
                <input type="checkbox" class="assoc-checkbox" data-member="${safeName}" ${checkboxChecked} ${checkboxDisabled} onchange="toggleMemberAssociation('${safeName}', this.checked)">
            </label>` : '';
            
            return `<div class="list-item member-item">
                ${assocCheckbox}
                <span class="member-name" style="flex:1">${displayName}${assocUid ? ' <span style="font-size:0.65rem;color:var(--primary-light);">\u2713</span>' : ''}</span>
                <div style="display:flex; gap:10px;">
                    <button class="edit-member-btn" title="Edit name" onclick="editMemberName('${safeName}')">
                        <i data-lucide="pencil" style="width:16px;height:16px;color:var(--text-main);"></i>
                    </button>
                    <button class="edit-member-btn remove-member-btn" title="Remove member" onclick="removeMember('${safeName}')">
                        <i data-lucide="trash-2" style="width:16px;height:16px;"></i>
                    </button>
                </div>
            </div>`;
        }).join("") :
        '<p style="color:var(--text-dim); font-size:0.85rem; padding:10px; text-align:center;">No members yet.</p>';
    if (window.lucide) lucide.createIcons();
    
    // Fix 6: Default "Select Member" for dropdowns
    document.getElementById('ex-payer').innerHTML = 
        '<option value="" disabled selected>Select Member</option>' +
        people.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('user-pdf-sel').innerHTML = 
        '<option value="" disabled selected>Select Member</option>' +
        people.map(p => `<option value="${p}">${p}</option>`).join('');
    
    document.getElementById('ex-parts').innerHTML = people.map(p => `<div class="pill selected" onclick="this.classList.toggle('selected')">${p}</div>`).join("");
}

async function addMem() {
    const el = document.getElementById('member-search');
    const name = el.value.trim();
    if (!curGrp) { notify("Please create or select a group first.", "error"); return; }
    if (!name) { notify("Please enter a member name.", "error"); return; }
    if (isGuestMode) {
        if (!guestData.members[curGrp]) guestData.members[curGrp] = [];
        guestData.members[curGrp].push(name);
        el.value = ""; await refresh(); return;
    }
    await db.collection('members').add({ name: name, groupId: curGrp, userId: currentUser.uid });
    el.value = "";
    await refresh();
}

async function editMemberName(oldName) {
    const newName = prompt("Edit member name:", oldName);
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
    
    const finalName = newName.trim();
    if (people.includes(finalName)) {
        alert("Member name already exists!");
        return;
    }
    
    if (isGuestMode) {
        const idx = guestData.members[curGrp].indexOf(oldName);
        if (idx !== -1) guestData.members[curGrp][idx] = finalName;
        
        guestData.expenses[curGrp]?.forEach(ex => {
            if (ex.payer === oldName) ex.payer = finalName;
            const pIdx = ex.participants.indexOf(oldName);
            if (pIdx !== -1) ex.participants[pIdx] = finalName;
        });
        
        guestData.settlements[curGrp]?.forEach(s => {
            if (s.payer === oldName) s.payer = finalName;
            if (s.receiver === oldName) s.receiver = finalName;
        });
    } else {
        const batch = db.batch();
        const uid = currentUser.uid;
        
        // 1. Members
        const memSnap = await db.collection('members').where('userId','==',uid).where('groupId','==',curGrp).where('name','==',oldName).get();
        memSnap.forEach(doc => batch.update(doc.ref, { name: finalName }));
        
        // 2. Expenses
        const exSnap = await db.collection('expenses').where('userId','==',uid).where('groupId','==',curGrp).get();
        exSnap.forEach(doc => {
            const data = doc.data();
            let changed = false;
            const updateData = {};
            if (data.payer === oldName) { updateData.payer = finalName; changed = true; }
            if (data.participants && data.participants.includes(oldName)) {
                updateData.participants = data.participants.map(p => p === oldName ? finalName : p);
                changed = true;
            }
            if (changed) batch.update(doc.ref, updateData);
        });
        
        // 3. Settlements
        const setSnap = await db.collection('settlements').where('userId','==',uid).where('groupId','==',curGrp).get();
        setSnap.forEach(doc => {
            const data = doc.data();
            let changed = false;
            const updateData = {};
            if (data.payer === oldName) { updateData.payer = finalName; changed = true; }
            if (data.receiver === oldName) { updateData.receiver = finalName; changed = true; }
            if (changed) batch.update(doc.ref, updateData);
        });
        
        await batch.commit();
    }
    await refresh();
}

async function removeMember(name) {
    if (!confirm(`Remove "${name}" from the group?`)) return;
    if (isGuestMode) {
        guestData.members[curGrp] = (guestData.members[curGrp] || []).filter(m => m !== name);
    } else {
        const snap = await db.collection('members')
            .where('groupId', '==', curGrp)
            .where('name', '==', name).get();
        const batch = db.batch();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
    notify(`${name} removed`, 'error');
    await refresh();
}

function addMemberPrompt() {
    // Mobile: focus the input field so keyboard opens
    const el = document.getElementById('member-search');
    if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function collapseGroup() {
    document.getElementById('grp-modal').style.display = 'none';
}


// --- Expenses ---
async function loadEx() {
    if (isGuestMode) {
        expensesList = (guestData.expenses[curGrp] || []).slice();
    } else {
        const snap = await db.collection('expenses').where('groupId', '==', curGrp).get();
        expensesList = [];
        snap.forEach(doc => expensesList.push({ id: doc.id, ...doc.data() }));
        expensesList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    renderExpenseList(expensesList);
}

// --- Determine logged-in user's member name in current group ---
function getCurrentMemberName() {
    if (!currentUser) return null;
    const displayName = (currentUser.displayName || currentUser.email?.split('@')[0] || '').trim();
    if (people.includes(displayName)) return displayName;
    const lower = displayName.toLowerCase();
    return people.find(p => p.toLowerCase() === lower) || null;
}

function renderExpenseList(list) {
    const container = document.getElementById('ex-history');
    if (!list.length) {
        container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:2rem;">No expenses yet.</p>';
        return;
    }
    container.innerHTML = list.map((e, idx) => {
        const date = e.createdAt?.toDate ? e.createdAt.toDate().toISOString().split('T')[0] : (e.date || '');
        const isFullySettled = e.settled === true;
        const settledClass = isFullySettled ? ' settled-expense' : '';
        const parts = e.participants || [];
        const settledBy = e.settledBy || {};
        const customSplits = e.customSplits || {};
        const defaultSplit = parts.length ? e.amount / parts.length : 0;
        const nonPayerParts = parts.filter(p => p !== e.payer);

        // Participant status rows (read-only info)
        let statusRows = '';
        if (nonPayerParts.length > 0) {
            statusRows = '<div class="participant-rows">' + nonPayerParts.map(p => {
                const split = customSplits[p] !== undefined ? customSplits[p] : defaultSplit;
                const isPersonSettled = settledBy[p] === true || split === 0;
                if (isPersonSettled) {
                    return `<div class="participant-row"><span class="p-name">${p}</span><span class="settled-badge-sm">\u2713 \u20b9${split.toFixed(2)} Settled</span></div>`;
                }
                return `<div class="participant-row"><span class="p-name">${p}</span><span style="color:var(--accent);font-size:0.75rem;">owes \u20b9${split.toFixed(2)}</span></div>`;
            }).join('') + '</div>';
        }

        // Single settle button
        let settleBtn = '';
        if (nonPayerParts.length > 0) {
            const safeId = String(e.id || idx).replace(/'/g, "\\'");
            const myName = getCurrentMemberName();
            const allDashboardSettled = nonPayerParts.every(p => settledBy[p] === true);
            let shouldGreyOut = isFullySettled || allDashboardSettled;
            
            // Fix 5: Grey out if all accounts settled on dashboard
            if (window._allSettled) shouldGreyOut = true;
            
            // Grey out if I am logged in, not the payer, and I already settled my share
            if (!shouldGreyOut && myName && myName !== e.payer && settledBy[myName]) {
                shouldGreyOut = true;
            }

            if (shouldGreyOut) {
                settleBtn = `<div class="settle-all-row"><button class="settle-expense-btn" disabled style="opacity:0.35;cursor:not-allowed;border-color:var(--text-dim);color:var(--text-dim);">\u2713 Settled</button></div>`;
            } else {
                settleBtn = `<div class="settle-all-row"><button class="settle-expense-btn" onclick="settleExpense('${safeId}')">Settle</button></div>`;
            }
        }

        return `<div class="list-item expense-card${settledClass}">
            <div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div><strong>${e.description || 'Exp'}</strong><br><small style="color:var(--text-dim)">Paid by ${e.payer}</small></div>
                    <div style="text-align:right"><strong>\u20b9${e.amount}</strong><br><small style="font-size:0.7rem">${date}</small></div>
                </div>
                ${statusRows}${settleBtn}
            </div>
        </div>`;
    }).join('');
}



function filterExpenses() {
    const q = (document.getElementById('ex-search')?.value || '').toLowerCase().trim();
    if (!q) { renderExpenseList(expensesList); return; }
    renderExpenseList(expensesList.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.payer || '').toLowerCase().includes(q)
    ));
}




async function addEx() {
    const p = document.getElementById('ex-payer').value;
    const a = parseFloat(document.getElementById('ex-amt').value);
    const d = document.getElementById('ex-desc').value.trim() || 'Expense';
    if (!p || p === '') return notify("Please select who paid!", "error");
    let parts = Array.from(document.querySelectorAll('#ex-parts .pill.selected')).map(el => el.innerText);
    if (!a || !parts.length) return notify("Missing amount or split!", "error");

    const cs = window._unequalSplits || {};
    const hasCustom = Object.keys(cs).length > 0;
    
    if (hasCustom) {
        // Filter out zero amount members
        parts = parts.filter(person => (cs[person] || 0) > 0);
        Object.keys(cs).forEach(person => { if ((cs[person] || 0) <= 0) delete cs[person]; });
    }

    if (!parts.length) return notify("All split amounts are zero!", "error");

    const expensePayload = { payer:p, amount:a, description:d, participants:parts };
    if (hasCustom) expensePayload.customSplits = { ...cs };
    window._unequalSplits = {}; // always reset

    if (isGuestMode) {
        if (!guestData.expenses[curGrp]) guestData.expenses[curGrp] = [];
        guestData.expenses[curGrp].push({ id:'e'+(++guestIdCounter), ...expensePayload, date:new Date().toISOString().split('T')[0] });
    } else {
        await db.collection('expenses').add({
            groupId: curGrp, userId: currentUser.uid, ...expensePayload,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
        const snap = await db.collection('settlements').where('groupId', '==', curGrp).get();
        settlementsList = [];
        snap.forEach(doc => settlementsList.push({ id: doc.id, ...doc.data() }));
        settlementsList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }
    filterSettle();
}

function filterSettle() {
    const q = document.getElementById('settle-search').value.toLowerCase();
    // Search settlements
    const filteredSettlements = settlementsList.filter(s => 
        s.payer.toLowerCase().includes(q) || s.receiver.toLowerCase().includes(q)
    );
    // Also search expenses (settled and unsettled)
    const filteredExpenses = expensesList.filter(e => 
        (e.description || '').toLowerCase().includes(q) || 
        (e.payer || '').toLowerCase().includes(q)
    );
    const container = document.getElementById('settle-history');
    let html = '';
    // Settlements
    if (filteredSettlements.length) {
        html += filteredSettlements.map(s => {
            const date = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : '';
            const noteStr = s.note ? ` <span style="color:var(--text-dim);font-size:0.75rem">for ${s.note}</span>` : '';
            return `<div class="list-item">
                <div><strong>${s.payer} paid ${s.receiver}</strong>${noteStr}<br><small style="color:var(--text-dim)">${date}</small></div>
                <div style="color:var(--primary-light)">₹${s.amount}</div>
            </div>`;
        }).join("");
    }
    // Expenses matching search
    if (filteredExpenses.length && q) {
        html += `<div style="padding:8px 0 4px 0; font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">Matching Expenses</div>`;
        html += filteredExpenses.map(e => {
            const date = e.createdAt?.toDate ? e.createdAt.toDate().toISOString().split('T')[0] : (e.date || '');
            const status = e.settled ? '<span style="color:#10b981; font-size:0.7rem;">SETTLED</span>' : '<span style="color:var(--accent); font-size:0.7rem;">ACTIVE</span>';
            return `<div class="list-item">
                <div><strong>${e.description || 'Exp'}</strong><br><small style="color:var(--text-dim)">Paid by ${e.payer}</small></div>
                <div style="text-align:right"><strong>₹${e.amount}</strong><br>${status} <small style="font-size:0.65rem">${date}</small></div>
            </div>`;
        }).join("");
    }
    if (!html) html = '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">No results found.</p>';
    container.innerHTML = html;
    // Also render settled expenses list
    renderSettledExpenses();
}

// --- Helper: add a settlement record (without triggering full refresh) ---
async function addSettlementRecord(from, to, amount, note) {
    if (isGuestMode) {
        if (!guestData.settlements[curGrp]) guestData.settlements[curGrp] = [];
        guestData.settlements[curGrp].push({ id:'s'+(++guestIdCounter), payer:from, receiver:to, amount, note: note||'', date:new Date().toLocaleString() });
    } else {
        await db.collection('settlements').add({
            groupId: curGrp, userId: currentUser.uid, payer: from, receiver: to, amount,
            note: note || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }
}

async function settleNow(f, t, a) {
    await addSettlementRecord(f, t, a);
    await bulkSettleExpensesByPair(f, t);
    notify("Payment Recorded!");
    await refresh();
}

// --- Bulk-settle all expense relations between debtor and creditor ---
async function bulkSettleExpensesByPair(debtor, creditor) {
    const toUpdate = [];
    for (const expense of expensesList) {
        if (expense.settled) continue;
        if (expense.payer !== creditor) continue;
        const parts = expense.participants || [];
        if (!parts.includes(debtor)) continue;
        const settledBy = expense.settledBy || {};
        if (settledBy[debtor]) continue;
        const newSettledBy = { ...settledBy, [debtor]: true };
        const nonPayerParts = parts.filter(p => p !== creditor);
        const allSettled = nonPayerParts.every(p => newSettledBy[p]);
        if (isGuestMode) {
            expense.settledBy = newSettledBy;
            if (allSettled) expense.settled = true;
        } else {
            const updateData = { settledBy: newSettledBy };
            if (allSettled) updateData.settled = true;
            toUpdate.push({ id: expense.id, data: updateData });
        }
    }
    if (!isGuestMode && toUpdate.length > 0) {
        const batch = db.batch();
        toUpdate.forEach(({ id, data }) => batch.update(db.collection('expenses').doc(id), data));
        await batch.commit();
    }
}

// --- Per-user expense settlement ---
async function settleExpensePerson(expId, personName) {
    const expense = expensesList.find(e => e.id === String(expId));
    if (!expense || expense.settled) return;
    const parts = expense.participants || [];
    const payer = expense.payer;
    const settledBy = { ...(expense.settledBy || {}) };
    const customSplits = expense.customSplits || {};
    const defaultSplit = expense.amount / (parts.length || 1);

    let peopleToSettle = [];
    if (personName === payer) {
        // Payer clicks: settle all outstanding participants
        peopleToSettle = parts.filter(p => p !== payer && !settledBy[p]);
    } else {
        if (settledBy[personName]) { notify("Already settled!", "error"); return; }
        peopleToSettle = [personName];
    }
    if (!peopleToSettle.length) { notify("Nothing to settle!", "error"); return; }

    for (const person of peopleToSettle) {
        const amt = customSplits[person] !== undefined ? customSplits[person] : defaultSplit;
        settledBy[person] = true;
        if (amt > 0) await addSettlementRecord(person, payer, amt, expense.description);
    }

    const nonPayerParts = parts.filter(p => p !== payer);
    const allSettled = nonPayerParts.every(p => settledBy[p]);

    if (isGuestMode) {
        const guestExp = (guestData.expenses[curGrp] || []).find(e => e.id === String(expId));
        if (guestExp) { guestExp.settledBy = settledBy; if (allSettled) guestExp.settled = true; }
    } else {
        const updateData = { settledBy };
        if (allSettled) updateData.settled = true;
        await db.collection('expenses').doc(String(expId)).update(updateData);
    }
    notify("Settled!");
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
    const spendingPerMember = {}; // Track actual spending for "Share" chart
    people.forEach(n => { balances[n] = 0.0; spendingPerMember[n] = 0.0; });
    let totalSpent = 0;
    let totalSpentAll = 0; // Includes settled for dashboard display
    expensesList.forEach(e => {
        totalSpentAll += e.amount;
        if (e.payer in spendingPerMember) spendingPerMember[e.payer] += e.amount;
        
        // Legacy settled flag: if settled and no settledBy map, it means it was settled 
        // without settlement records. We must skip it so debt disappears.
        // If it has settledBy, it has corresponding settlement records, so we process it.
        if (e.settled && (!e.settledBy || Object.keys(e.settledBy).length === 0)) return; 

        const parts = e.participants || [];
        if (!parts.length) return;
        totalSpent += e.amount;
        const customSplits = e.customSplits || {};
        const hasCustom = Object.keys(customSplits).length > 0;
        if (hasCustom) {
            let totalCustom = 0;
            parts.forEach(p => {
                const ps = customSplits[p] !== undefined ? customSplits[p] : 0;
                if (ps > 0 && p in balances) balances[p] -= ps;
                totalCustom += ps;
            });
            if (e.payer in balances) balances[e.payer] += totalCustom;
        } else {
            const split = e.amount / parts.length;
            parts.forEach(p => { if (p in balances) balances[p] -= split; });
            if (e.payer in balances) balances[e.payer] += e.amount;
        }
    });
    settlementsList.forEach(s => {
        if (s.payer in balances) balances[s.payer] += s.amount;
        if (s.receiver in balances) balances[s.receiver] -= s.amount;
    });
    let highSpender = '-', mostOwed = '-', maxB = 0.01, minB = -0.01;
    for (const [name, bal] of Object.entries(balances)) {
        if (bal > maxB) { maxB = bal; highSpender = name; }
        if (bal < minB) { minB = bal; mostOwed = name; }
    }
    if (Object.keys(balances).length === 0) { highSpender = '-'; mostOwed = '-'; }
    const optimized = optimizeDebts(balances);
    
    // Fix 5: Set global flag for settle button greying
    window._allSettled = optimized.length === 0;

    document.getElementById('st-total').innerText = `₹${totalSpentAll.toLocaleString()}`;
    document.getElementById('st-best').innerText = highSpender;
    document.getElementById('st-debtor').innerText = mostOwed;
    document.getElementById('st-count').innerText = expensesList.length;

    const optList = document.getElementById('optimized-list');
    optList.innerHTML = optimized.length ? optimized.map(t => {
        const sf = t.from.replace(/'/g, "\\'"), st = t.to.replace(/'/g, "\\'");
        return `<div class="list-item">
            <span>${t.from} <i data-lucide="arrow-right" style="width:14px;height:14px;margin:0 4px;vertical-align:middle;color:var(--text-dim)"></i> ${t.to} <strong style="color:var(--primary-light)">₹${t.amount}</strong></span>
            <button class="btn btn-primary btn-sm" onclick="settleNow('${sf}', '${st}', ${t.amount})">Mark Paid</button>
        </div>`;
    }).join("") : '<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); padding:1rem; border-radius:12px; color:#10b981; font-size:0.9rem; text-align:center;">All accounts settled!</div>';

    // Personal summary banner (Feature 1 - association)
    const personalEl = document.getElementById('personal-summary');
    if (personalEl) {
        const assoc = window._currentAssociations || {};
        const myMember = Object.entries(assoc).find(([m, uid]) => uid === currentUser?.uid)?.[0];
        if (myMember && balances[myMember] !== undefined) {
            const bal = Math.round(balances[myMember] * 100) / 100;
            window._myBalance = bal;
            if (bal < -0.01) {
                personalEl.innerHTML = `<span class="banner-icon">💸</span> You owe <strong style="color:#ef4444;margin:0 4px;">₹${Math.abs(bal).toFixed(2)}</strong>`;
                personalEl.style.display = 'flex';
            } else if (bal > 0.01) {
                personalEl.innerHTML = `<span class="banner-icon">💰</span> You are owed <strong style="color:#10b981;margin:0 4px;">₹${bal.toFixed(2)}</strong>`;
                personalEl.style.display = 'flex';
            } else {
                personalEl.innerHTML = `<span class="banner-icon">🎉</span> You're all settled!`;
                personalEl.style.display = 'flex';
            }
        } else {
            personalEl.style.display = 'none';
        }
    }

    lucide.createIcons();
    if (document.getElementById('graph-view').classList.contains('active')) renderGraph(optimized);
    if (document.getElementById('analytics').classList.contains('active')) renderCharts(balances, spendingPerMember);
    renderUsersTab();
    window._lastBalances = balances;
    window._lastOptimized = optimized;
    window._lastSpending = spendingPerMember;
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
    svg.append("defs").append("marker")
        .attr("id", "arr")
        .attr("markerUnits", "userSpaceOnUse")
        .attr("markerWidth", 10).attr("markerHeight", 10)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 25).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#6366f1");
    const link = svg.selectAll("line").data(edges).join("line").attr("stroke", "rgba(99,102,241,0.4)").attr("stroke-width", 2).attr("marker-end", "url(#arr)");
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
async function renderCharts(balances, spendingPerMember) {
    const ctxP = document.getElementById('pie'), ctxB = document.getElementById('bar');
    if (!ctxP || ctxP.clientWidth === 0) return;
    if (!balances) balances = window._lastBalances || {};
    if (!spendingPerMember) spendingPerMember = window._lastSpending || {};
    
    const names = Object.keys(balances);
    if (!names.length) return;
    
    if (pChart) pChart.destroy();
    if (bChart) bChart.destroy();
    
    // Share chart shows total spending contribution
    const spendingVals = names.map(n => spendingPerMember[n] || 0);
    pChart = new Chart(ctxP, { 
        type: 'doughnut', 
        data: { 
            labels: names, 
            datasets: [{ 
                data: spendingVals, 
                backgroundColor: ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#8b5cf6'], 
                borderColor: 'transparent' 
            }] 
        }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: 'Outfit' } } },
                tooltip: { callbacks: { label: function(context) { return ' ₹' + context.raw.toFixed(2); } } }
            } 
        } 
    });
    
    // Bar chart shows current net position
    const vals = Object.values(balances);
    bChart = new Chart(ctxB, { 
        type: 'bar', 
        data: { 
            labels: names, 
            datasets: [{ 
                data: vals, 
                backgroundColor: vals.map(v => v >= 0 ? '#10b981' : '#ef4444'), 
                borderRadius: 8 
            }] 
        }, 
        options: { 
            responsive: true, maintainAspectRatio: false, 
            scales: { 
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }, 
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } } 
            }, 
            plugins: { legend: { display: false } } 
        } 
    });
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

// ========== NEW FEATURES ==========

// --- Per-Expense Settlement (settles entire transaction by creating settlement records for unsettled shares) ---
async function settleExpense(expId) {
    const expense = expensesList.find(e => e.id === String(expId));
    if (!expense || expense.settled) return;

    const customSplits = expense.customSplits || {};
    const defaultSplit = (expense.participants && expense.participants.length) ? expense.amount / expense.participants.length : 0;
    const settledBy = expense.settledBy || {};
    
    const batch = !isGuestMode ? db.batch() : null;
    const now = new Date().toLocaleString();

    for (const p of (expense.participants || [])) {
        if (p === expense.payer) continue;
        if (settledBy[p]) continue; // already settled
        
        const split = customSplits[p] !== undefined ? customSplits[p] : defaultSplit;
        if (split <= 0) continue;

        if (isGuestMode) {
            if (!guestData.settlements[curGrp]) guestData.settlements[curGrp] = [];
            guestData.settlements[curGrp].push({ id:'s'+(++guestIdCounter), payer:p, receiver:expense.payer, amount:split, note: 'Settled ' + (expense.description||'Exp'), date:now });
            settledBy[p] = true;
        } else {
            const sRef = db.collection('settlements').doc();
            batch.set(sRef, {
                groupId: curGrp, userId: currentUser.uid, payer: p, receiver: expense.payer, amount: split,
                note: 'Settled ' + (expense.description||'Exp'),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            settledBy[p] = true;
        }
    }

    if (isGuestMode) {
        expense.settled = true;
        expense.settledBy = settledBy;
        expense.settledAt = new Date().toISOString();
    } else {
        const eRef = db.collection('expenses').doc(String(expId));
        batch.update(eRef, {
            settled: true,
            settledBy: settledBy,
            settledAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await batch.commit();
    }
    notify('Expense settled!');
    await refresh();
}

// --- Render settled expenses in Settlements tab ---
function renderSettledExpenses() {
    const container = document.getElementById('settled-expenses-list');
    if (!container) return;
    const settled = expensesList.filter(e => e.settled === true);
    const partial = expensesList.filter(e => !e.settled && e.settledBy && Object.keys(e.settledBy).length > 0);
    const all = [...settled, ...partial];
    if (!all.length) {
        container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">No settled expenses yet.</p>';
        return;
    }
    container.innerHTML = all.map(e => {
        const isFull = e.settled === true;
        const date = e.settledAt
            ? (typeof e.settledAt === 'string' ? new Date(e.settledAt).toLocaleDateString() : (e.settledAt.toDate ? e.settledAt.toDate().toLocaleDateString() : ''))
            : (e.createdAt?.toDate ? e.createdAt.toDate().toLocaleDateString() : (e.date || ''));
        const badge = isFull
            ? `<span style="background:rgba(16,185,129,0.2);color:#10b981;font-size:0.65rem;padding:2px 7px;border-radius:5px;">SETTLED</span>`
            : `<span style="background:rgba(245,158,11,0.2);color:#f59e0b;font-size:0.65rem;padding:2px 7px;border-radius:5px;">PARTIAL</span>`;
        const settledNames = Object.keys(e.settledBy || {}).join(', ');
        return `<div class="list-item" style="opacity:${isFull ? '0.7' : '0.9'};">
            <div><strong>${e.description || 'Exp'}</strong> ${badge}<br>
            <small style="color:var(--text-dim)">Paid by ${e.payer}${settledNames ? ' \xb7 Settled: ' + settledNames : ''}</small></div>
            <div style="text-align:right"><strong style="color:#10b981">\u20b9${e.amount}</strong><br><small style="font-size:0.65rem; color:var(--text-dim)">${date}</small></div>
        </div>`;
    }).join('');
}


// --- FIX 4: Group Edit Name ---
async function editGrpName(groupId, oldName) {
    const newName = prompt("Edit group name:", oldName);
    if (!newName || newName.trim() === "" || newName.trim() === oldName) return;
    const finalName = newName.trim();

    if (isGuestMode) {
        const group = guestData.groups.find(g => g.id === groupId);
        if (group) group.name = finalName;
        if (curGrp === groupId) document.getElementById('group-title').innerText = finalName;
        renderGuestGroupList();
    } else {
        await db.collection('groups').doc(groupId).update({ name: finalName });
        if (curGrp === groupId) document.getElementById('group-title').innerText = finalName;
        await loadGrps();
    }
    notify("Group renamed!");
}

// --- FIX 4: Delete specific group from modal ---
async function deleteSpecificGrp(groupId) {
    if (!confirm("Delete this group and all its data?")) return;

    if (isGuestMode) {
        guestData.groups = guestData.groups.filter(g => g.id !== groupId);
        delete guestData.members[groupId];
        delete guestData.expenses[groupId];
        delete guestData.settlements[groupId];
        if (curGrp === groupId) {
            curGrp = guestData.groups.length ? guestData.groups[0].id : null;
            document.getElementById('group-title').innerText = curGrp ? guestData.groups[0].name : 'Create a Group';
            people = []; expensesList = []; settlementsList = [];
            clearUI();
        }
        renderGuestGroupList();
        notify("Group Deleted", "error");
        return;
    }

    const uid = currentUser.uid;
    const batch = db.batch();
    const cols = ['members', 'expenses', 'settlements'];
    for (const col of cols) {
        const snap = await db.collection(col).where('userId', '==', uid).where('groupId', '==', groupId).get();
        snap.forEach(doc => batch.delete(doc.ref));
    }
    batch.delete(db.collection('groups').doc(groupId));
    await batch.commit();
    if (curGrp === groupId) curGrp = null;
    notify("Group Deleted", "error");
    await loadGrps();
}

// --- FIX 8: Group Sharing (Invite Link) ---
function generateInviteLink() {
    if (!curGrp) return null;
    return `${window.location.origin}?group=${curGrp}`;
}

function shareGroup(type) {
    if (isGuestMode) { notify("Please log in to share groups.", "error"); return; }
    if (!curGrp) { notify("Select a group first!", "error"); return; }
    
    let textToCopy = "";
    let successMsg = "";
    
    if (type === 'link') {
        textToCopy = generateInviteLink();
        successMsg = "Invite link copied to clipboard!";
    } else if (type === 'id') {
        textToCopy = curGrp;
        successMsg = "Group ID copied to clipboard!";
    } else {
        return;
    }
    
    if (!textToCopy) return;

    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            notify(successMsg);
        }).catch(() => {
            prompt("Copy this:", textToCopy);
        });
    } else {
        prompt("Copy this:", textToCopy);
    }
}

async function joinGrpById() {
    if (isGuestMode) { notify("Cannot join shared groups in guest mode.", "error"); return; }
    const el = document.getElementById('new-grp-name');
    const groupId = el ? el.value.trim() : '';
    if (!groupId) { notify("Enter a group code first", "error"); return; }
    if (el) el.value = '';
    await processGroupJoin(groupId);
}

async function processGroupJoin(sharedGroupId) {
    try {
        const docRef = db.collection('groups').doc(sharedGroupId);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const groupData = doc.data();
            const uids = groupData.contributorUids || [];
            const userName = currentUser.displayName || currentUser.email.split('@')[0];
            
            // Always refresh collaborator details for current user
            const details = groupData.collaboratorDetails || {};
            details[currentUser.uid] = { name: userName, email: currentUser.email };
            
            if (!uids.includes(currentUser.uid)) {
                uids.push(currentUser.uid);
            }
            
            await docRef.update({
                contributorUids: uids,
                collaboratorDetails: details
            });
            
            curGrp = sharedGroupId;
            document.getElementById('group-title').innerText = groupData.name || 'Shared Group';
            
            // Clean URL if we joined via link
            if (window.location.search.includes('group=')) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            await loadGrps(); // reload list
            notify(`Joined group: ${groupData.name || 'Shared Group'}`);
        } else {
            notify("Shared group not found. Invalid ID or Link.", "error");
        }
    } catch (err) {
        console.error("Error loading shared group:", err);
        notify("Could not load shared group.", "error");
    }
}

// --- FIX 8: Handle shared group link on load ---
async function handleSharedGroupLink() {
    const params = new URLSearchParams(window.location.search);
    const sharedGroupId = params.get("group");

    if (!sharedGroupId) return;

    // Wait for auth to resolve
    const waitForAuth = () => new Promise(resolve => {
        if (currentUser || isGuestMode) return resolve();
        const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            resolve();
        });
        // Timeout fallback
        setTimeout(resolve, 3000);
    });

    await waitForAuth();
    
    if (isGuestMode) {
        notify("Please log in to join a shared group.", "error");
        return;
    }

    await processGroupJoin(sharedGroupId);
}

// --- Users Tab Rendering ---
function renderUsersTab() {
    const container = document.getElementById('collaborators-list');
    if (!container) return;
    
    if (isGuestMode) {
        container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">Guest mode uses local data. No online collaborators.</p>';
        return;
    }
    
    const currentGroupData = window.allUserGroups?.find(g => g.id === curGrp);
    if (!currentGroupData) {
        container.innerHTML = '<p style="color:var(--text-dim); text-align:center; padding:1.5rem;">Group data not found.</p>';
        return;
    }
    
    const details = currentGroupData.collaboratorDetails || {};
    
    // Ensure admin is always in the list (handles legacy groups created before this feature)
    const uids = Array.from(new Set([...(currentGroupData.contributorUids || []), currentGroupData.userId]));
    
    // Check for duplicate names
    const nameCounts = {};
    const nameAssignments = {};
    
    uids.forEach(uid => {
        const info = details[uid] || { name: 'Unknown User' };
        const name = info.name;
        if (!nameCounts[name]) {
            nameCounts[name] = 1;
            nameAssignments[uid] = name;
        } else {
            nameCounts[name]++;
            nameAssignments[uid] = `${name} (User ${nameCounts[name]})`;
            // Retroactively update the first one if it's the second occurrence
            if (nameCounts[name] === 2) {
                const firstUid = uids.find(u => details[u]?.name === name && u !== uid);
                if (firstUid) nameAssignments[firstUid] = `${name} (User 1)`;
            }
        }
    });
    
    container.innerHTML = uids.map(uid => {
        const info = details[uid] || { email: 'Unknown' };
        const displayName = nameAssignments[uid];
        const isMe = uid === currentUser.uid;
        const amIAdmin = currentUser.uid === currentGroupData.userId;
        const isAdmin = uid === currentGroupData.userId;
        
        let badges = '';
        if (isAdmin) badges += '<span style="background:rgba(245,158,11,0.2); color:#f59e0b; font-size:0.65rem; padding:2px 6px; border-radius:4px; margin-left:8px;">Admin</span>';
        if (isMe) badges += '<span style="background:rgba(99,102,241,0.2); color:#818cf8; font-size:0.65rem; padding:2px 6px; border-radius:4px; margin-left:8px;">You</span>';
        
        let actionButtons = '';
        
        // Fix 2: Host kick/remove member
        if (amIAdmin && !isMe) {
            actionButtons += `<button class="kick-member-btn" title="Remove from group" onclick="kickCollaborator('${uid}', '${displayName.replace(/'/g, "\\'")}')"><i data-lucide="user-minus" style="width:16px;height:16px;"></i></button>`;
        }
        
        // Feature 3: Payment reminder
        if (!isMe && window._lastBalances) {
            // Find which member this user is associated with
            const assoc = currentGroupData.memberAssociations || {};
            const memberName = Object.entries(assoc).find(([m, u]) => u === uid)?.[0];
            const myName = Object.entries(assoc).find(([m, u]) => u === currentUser.uid)?.[0];
            
            if (memberName && myName) {
                // Determine if this user owes ME specifically by looking at optimized debts
                const owesMe = (window._lastOptimized || []).find(t => t.from === memberName && t.to === myName);
                if (owesMe) {
                    actionButtons += `<button class="remind-btn" id="remind-${uid}" onclick="sendPaymentReminder('${uid}', '${displayName.replace(/'/g, "\\'")}', '${info.email}', ${owesMe.amount}, '${myName.replace(/'/g, "\\'")}')">Remind</button>`;
                }
            }
        }
        
        return `<div class="list-item">
            <div style="display:flex; align-items:center; gap:12px; flex:1;">
                <div class="avatar-circle" style="width:36px; height:36px; font-size:1rem;">${displayName.charAt(0).toUpperCase()}</div>
                <div>
                    <strong>${displayName}</strong>${badges}<br>
                    <small style="color:var(--text-dim)">${info.email}</small>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                ${actionButtons}
            </div>
        </div>`;
    }).join("");
    if (window.lucide) lucide.createIcons();
}

// Run shared group handler after load
window.addEventListener("load", () => {
    // Delay to let auth resolve first
    setTimeout(handleSharedGroupLink, 1500);
});

// --- Total Spent counter (include settled for display) ---
function getTotalSpentIncludingSettled() {
    return expensesList.reduce((sum, e) => sum + e.amount, 0);
}

// ========== UNEQUAL SPLIT ==========
window._unequalSplits = {};

function openUnequalSplitModal() {
    const descVal = document.getElementById('ex-desc').value.trim() || 'Expense';
    const amount = parseFloat(document.getElementById('ex-amt').value) || 0;
    const payer = document.getElementById('ex-payer').value;
    const allParts = Array.from(document.querySelectorAll('#ex-parts .pill.selected')).map(el => el.innerText);
    // Validate required fields
    if (!amount) { notify("Enter the expense amount first!", "error"); return; }
    if (!allParts.length) { notify("Select participants first!", "error"); return; }
    // Show all participants including payer
    const parts = allParts;
    if (!parts.length) { notify("Add participants!", "error"); return; }

    document.getElementById('unequal-total-amt').textContent = amount.toFixed(2);
    document.getElementById('unequal-remaining').textContent = amount.toFixed(2);
    document.getElementById('unequal-remaining').style.color = 'var(--text-main)';

    const rowsEl = document.getElementById('unequal-rows');
    rowsEl.innerHTML = parts.map(p => `
        <div class="unequal-row">
            <label class="unequal-label">${p}</label>
            <input type="number" class="unequal-input" data-person="${p}" placeholder="0.00" min="0" step="0.01" oninput="updateUnequalRemaining()">
        </div>`).join('');

    const confirmBtn = document.getElementById('unequal-confirm');
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.45';
    document.getElementById('unequal-modal').style.display = 'flex';
    if (window.lucide) lucide.createIcons();
}

function updateUnequalRemaining() {
    const amount = parseFloat(document.getElementById('ex-amt').value) || 0;
    const inputs = Array.from(document.querySelectorAll('.unequal-input'));
    
    // Check for user-edited inputs vs auto-filled
    // Wait, simpler approach: just find empty inputs
    let entered = 0;
    let emptyInputs = [];
    
    inputs.forEach(input => {
        // If it was auto-filled previously but now we're recalculating, we might want to clear it if others changed?
        // Let's just calculate based on what's explicitly typed. If it has a value, count it.
        const val = parseFloat(input.value);
        if (isNaN(val)) {
            emptyInputs.push(input);
        } else {
            entered += val;
        }
    });
    
    let remaining = Math.round((amount - entered) * 100) / 100;
    
    // Fix 8: Autofill last member
    if (emptyInputs.length === 1 && remaining > 0) {
        // Auto-fill the last remaining input visually, but add a class to track it
        const lastInput = emptyInputs[0];
        lastInput.value = remaining.toFixed(2);
        lastInput.classList.add('auto-filled');
        // Recalculate remaining as 0
        entered += remaining;
        remaining = 0;
    } else {
        // If there are multiple empty, or we exceeded, clear any previously auto-filled
        inputs.forEach(input => {
            if (input.classList.contains('auto-filled')) {
                // If the user hasn't modified it, clear it
                // Actually, if we trigger input, it removes the class
                input.value = '';
                input.classList.remove('auto-filled');
            }
        });
        
        // Recalculate properly after clearing
        entered = 0;
        inputs.forEach(input => {
            const val = parseFloat(input.value);
            if (!isNaN(val)) entered += val;
        });
        remaining = Math.round((amount - entered) * 100) / 100;
        
        // Try autofill one more time in case clearing an autofill left 1 empty again
        emptyInputs = inputs.filter(input => isNaN(parseFloat(input.value)));
        if (emptyInputs.length === 1 && remaining > 0) {
            emptyInputs[0].value = remaining.toFixed(2);
            emptyInputs[0].classList.add('auto-filled');
            entered += remaining;
            remaining = 0;
        }
    }

    const remEl = document.getElementById('unequal-remaining');
    const confirmBtn = document.getElementById('unequal-confirm');
    const warningEl = document.getElementById('unequal-warning');

    if (remaining < -0.009) {
        remEl.textContent = Math.abs(remaining).toFixed(2);
        remEl.style.color = '#ef4444';
        if (warningEl) { warningEl.textContent = '⚠ Exceeded total amount'; warningEl.style.display = 'block'; }
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.45';
    } else if (Math.abs(remaining) < 0.01) {
        remEl.textContent = '0.00';
        remEl.style.color = '#10b981';
        if (warningEl) warningEl.style.display = 'none';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    } else {
        remEl.textContent = remaining.toFixed(2);
        remEl.style.color = 'var(--text-main)';
        if (warningEl) warningEl.style.display = 'none';
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.45';
    }
}
// Add event listener to clear auto-fill status on manual edit
document.addEventListener('input', e => {
    if (e.target.classList && e.target.classList.contains('unequal-input')) {
        e.target.classList.remove('auto-filled');
    }
});

function closeUnequalModal() {
    document.getElementById('unequal-modal').style.display = 'none';
}

function confirmUnequalSplit() {
    window._unequalSplits = {};
    document.querySelectorAll('.unequal-input').forEach(input => {
        const val = parseFloat(input.value) || 0;
        window._unequalSplits[input.dataset.person] = val;
    });
    closeUnequalModal();
    // Record expense immediately
    addEx();
}

// ========== FEATURE 2: KICK MEMBER ==========
async function kickCollaborator(uid, displayName) {
    if (!confirm(`Are you sure you want to kick ${displayName}? They will lose access to the group.`)) return;
    try {
        const docRef = db.collection('groups').doc(curGrp);
        await db.runTransaction(async (t) => {
            const doc = await t.get(docRef);
            if (!doc.exists) return;
            const data = doc.data();
            const uids = data.contributorUids || [];
            const details = data.collaboratorDetails || {};
            
            t.update(docRef, {
                contributorUids: uids.filter(u => u !== uid),
                collaboratorDetails: (delete details[uid], details)
            });
        });
        notify(`Kicked ${displayName}`);
        await refresh();
    } catch (e) {
        console.error("Kick error:", e);
        notify("Could not kick member", "error");
    }
}

// ========== FEATURE 3: PAYMENT REMINDER ==========
let _lastRemindTime = 0;
function sendPaymentReminder(uid, displayName, email, amount, myName) {
    const now = Date.now();
    if (now - _lastRemindTime < 30000) {
        notify("Please wait 30 seconds before sending another reminder.", "error");
        return;
    }
    
    // Disable button temporarily to prevent spam clicks
    const btn = document.getElementById(`remind-${uid}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Sent \u2713";
        setTimeout(() => { btn.disabled = false; btn.textContent = "Remind"; }, 30000);
    }
    
    _lastRemindTime = now;
    
    const groupName = document.getElementById('group-title').innerText;
    const link = `${window.location.origin}?group=${curGrp}`;
    
    const subject = encodeURIComponent(`Payment Reminder: SmartSettled - ${groupName}`);
    const body = encodeURIComponent(
        `Hi ${displayName},\n\n` +
        `This is a friendly reminder that you owe ₹${amount} to ${myName} in the group "${groupName}".\n\n` +
        `You can view the details and settle up here:\n${link}\n\n` +
        `Thanks,\n${myName} (via SmartSettled)`
    );
    
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    notify("Opened email client");
}

// ========== FEATURE 1: MEMBER ASSOCIATION ==========
async function toggleMemberAssociation(memberName, checked) {
    try {
        const docRef = db.collection('groups').doc(curGrp);
        const doc = await docRef.get();
        if (!doc.exists) return;
        
        let assoc = doc.data().memberAssociations || {};
        
        if (checked) {
            // Un-associate from any other member first
            for (const [m, u] of Object.entries(assoc)) {
                if (u === currentUser.uid) delete assoc[m];
            }
            assoc[memberName] = currentUser.uid;
        } else {
            delete assoc[memberName];
        }
        
        await docRef.update({ memberAssociations: assoc });
        
        // Update local reference and UI instantly
        const grp = window.allUserGroups?.find(g => g.id === curGrp);
        if (grp) grp.memberAssociations = assoc;
        window._currentAssociations = assoc;
        
        await loadPpl(); // Re-render members to update checkboxes
        computeStatus(); // Re-render dashboard summary
        
        notify(checked ? `Claimed member: ${memberName}` : `Unclaimed member: ${memberName}`);
    } catch (e) {
        console.error("Association error:", e);
        notify("Could not update association", "error");
    }
}

// ========== FEATURE 4: BUG REPORT ==========
function openBugReport() {
    document.getElementById('bug-title').value = '';
    document.getElementById('bug-desc').value = '';
    document.getElementById('bug-error').style.display = 'none';
    document.getElementById('bug-report-modal').style.display = 'flex';
}

function closeBugReport() {
    document.getElementById('bug-report-modal').style.display = 'none';
}

function submitBugReport() {
    const title = document.getElementById('bug-title').value.trim();
    const desc = document.getElementById('bug-desc').value.trim();
    const errEl = document.getElementById('bug-error');
    
    if (!title || !desc) {
        errEl.textContent = "Please fill out both title and description.";
        errEl.style.display = 'block';
        return;
    }
    
    const contextInfo = `Group ID: ${curGrp || 'None'}\n` +
                        `User ID: ${currentUser ? currentUser.uid : 'Guest'}\n` +
                        `Is Guest Mode: ${isGuestMode}\n` +
                        `User Agent: ${navigator.userAgent}`;
                        
    const subject = encodeURIComponent(`SmartSettled Bug: ${title}`);
    const body = encodeURIComponent(`Bug Description:\n${desc}\n\n\n--- Debug Info ---\n${contextInfo}`);
    
    // Multiple recipients separated by comma
    const recipients = "harshitrawat3125@gmail.com,rawatharshit3424@gmail.com";
    
    window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
    
    closeBugReport();
    notify("Bug report opened in your email client");
}
