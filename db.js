// ============================================================
//  DevMatch — Firebase Database Layer (db.js)
//  Firebase v9 Compat SDK — Real cloud database
// ============================================================

// ---- Firebase Config ----
// Replace these values with your own from https://console.firebase.google.com
// Steps: Create project → Add Web App → Copy config → Enable Auth (Email/Password) → Enable Firestore
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAUNk16MSg264eDvNruT9UgD44fevF230E",
  authDomain: "devmatch-demo.firebaseapp.com",
  projectId: "devmatch-demo",
  storageBucket: "devmatch-demo.firebasestorage.app",
  messagingSenderId: "286315495224",
  appId: "1:286315495224:web:abcef8a080ac0a62ce0bcd",
  measurementId: "G-9EF9M0W3D2"
};

// ---- Firebase Mode Detection ----
// If Firebase is not configured, the app runs in Local Mode (localStorage only)
// Local Mode: Users are visible to others on the SAME browser only
const IS_DEMO_CONFIG = FIREBASE_CONFIG.apiKey.includes('Demo_Replace');

// ============================================================
//  DB — Universal Database Interface
//  Automatically uses Firebase when configured, localStorage otherwise
// ============================================================
const DB = {

  // --- Internal state ---
  _firestore: null,
  _auth: null,
  _mode: IS_DEMO_CONFIG ? 'local' : 'firebase',
  _currentUser: null,

  // ============================================================
  //  INIT
  // ============================================================
  async init() {
    if (this._mode === 'firebase') {
      try {
        firebase.initializeApp(FIREBASE_CONFIG);
        this._firestore = firebase.firestore();
        this._auth = firebase.auth();
        console.log('✅ DevMatch: Running on Firebase (cloud database)');
        return true;
      } catch (e) {
        console.warn('⚠️ Firebase init failed, falling back to local mode:', e);
        this._mode = 'local';
      }
    }
    console.log('ℹ️ DevMatch: Running in Local Mode (localStorage)');
    return false;
  },

  // ============================================================
  //  USER OPERATIONS
  // ============================================================

  getUsers() {
    return JSON.parse(localStorage.getItem('dm_users') || '[]');
  },

  saveUsers(users) {
    localStorage.setItem('dm_users', JSON.stringify(users));
  },

  getUser(id) {
    return this.getUsers().find(u => u.id === id) || null;
  },

  // Get all users EXCEPT the given userId AND those already swiped
  getDiscoverUsers(currentUserId) {
    const users = this.getUsers();
    const swipedIds = this.getSwipedIds(currentUserId);
    return users.filter(u => u.id !== currentUserId && !swipedIds.includes(u.id));
  },

  async saveUserProfile(user) {
    // Save to localStorage (always)
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    this.saveUsers(users);

    // Save to Firestore if in firebase mode
    if (this._mode === 'firebase' && this._firestore) {
      try {
        const ref = this._firestore.collection('users').doc(user.id);
        const { passwordHash, ...publicProfile } = user; // never store hash in Firestore
        await ref.set(publicProfile, { merge: true });
      } catch (e) { console.warn('Firestore write failed:', e); }
    }
    return user;
  },

  // Pull latest user from Firestore (for multi-device sync)
  async syncUserFromCloud(userId) {
    if (this._mode !== 'firebase' || !this._firestore) return this.getUser(userId);
    try {
      const doc = await this._firestore.collection('users').doc(userId).get();
      if (doc.exists) {
        const cloudUser = doc.data();
        const users = this.getUsers();
        const idx = users.findIndex(u => u.id === userId);
        const localUser = idx >= 0 ? users[idx] : {};
        const merged = { ...localUser, ...cloudUser }; // cloud wins
        if (idx >= 0) users[idx] = merged; else users.push(merged);
        this.saveUsers(users);
        return merged;
      }
    } catch (e) { console.warn('Firestore read failed:', e); }
    return this.getUser(userId);
  },

  // Pull all users from Firestore (discover feed)
  async syncAllUsersFromCloud() {
    if (this._mode !== 'firebase' || !this._firestore) return this.getUsers();
    try {
      const snapshot = await this._firestore.collection('users').get();
      const cloudUsers = [];
      snapshot.forEach(doc => cloudUsers.push({ id: doc.id, ...doc.data() }));
      // Merge with local (local has passwordHash)
      const localUsers = this.getUsers();
      cloudUsers.forEach(cloudUser => {
        const local = localUsers.find(u => u.id === cloudUser.id);
        const merged = { ...(local || {}), ...cloudUser };
        const idx = localUsers.findIndex(u => u.id === cloudUser.id);
        if (idx >= 0) localUsers[idx] = merged; else localUsers.push(merged);
      });
      this.saveUsers(localUsers);
      return localUsers;
    } catch (e) {
      console.warn('Firestore sync failed:', e);
      return this.getUsers();
    }
  },

  // ============================================================
  //  SESSION
  // ============================================================

  getSession() {
    return JSON.parse(localStorage.getItem('dm_session') || 'null');
  },

  setSession(userId) {
    localStorage.setItem('dm_session', JSON.stringify({ userId, ts: Date.now() }));
    this._currentUser = this.getUser(userId);
  },

  clearSession() {
    localStorage.removeItem('dm_session');
    this._currentUser = null;
  },

  getCurrentUser() {
    const session = this.getSession();
    if (!session) return null;
    return this.getUser(session.userId);
  },

  // ============================================================
  //  AUTH — Password Hashing
  // ============================================================

  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_devmatch_2024_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // ============================================================
  //  AUTH — Sign Up
  // ============================================================

  async signUp({ name, title, email, password, location, github, experience }) {
    const users = this.getUsers();

    // Check duplicate email
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = await this.hashPassword(password);
    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    const initials = name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
    const colors = ['#00e855','#39ff84','#a8ff3e','#00ffb3','#00d4aa','#66ff99','#00e0cc','#b3ff66'];
    const color = colors[users.length % colors.length];

    const newUser = {
      id,
      name: name.trim(),
      title: title.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      location: location?.trim() || '',
      github: github?.trim() || '',
      experience: experience || 'Mid-level',
      bio: '',
      skills: [],
      lookingFor: [],
      availability: 'Flexible',
      initials,
      color,
      avatar: null, // will be generated from initials client-side
      joinedAt: Date.now(),
      projects: 0,
      profileComplete: false,
    };

    await this.saveUserProfile(newUser);

    // Firebase Auth (if configured)
    if (this._mode === 'firebase' && this._auth) {
      try {
        const cred = await this._auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        // Override the id with Firebase UID for consistency
        newUser.id = cred.user.uid;
        newUser.id = id; // keep local id, firebase UID used separately
      } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
          // Local user created but Firebase rejected — remove local user
          this.removeUser(id);
          throw new Error('An account with this email already exists.');
        }
        console.warn('Firebase Auth signup failed, using local auth:', e);
      }
    }

    this.setSession(newUser.id);
    return newUser;
  },

  // ============================================================
  //  AUTH — Login
  // ============================================================

  async login(email, password) {
    // Try cloud sync first
    if (this._mode === 'firebase') {
      await this.syncAllUsersFromCloud().catch(() => {});
    }

    const users = this.getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) throw new Error('No account found with this email.');

    const passwordHash = await this.hashPassword(password);
    if (user.passwordHash !== passwordHash) throw new Error('Incorrect password.');

    this.setSession(user.id);

    // Firebase Auth login (if configured)
    if (this._mode === 'firebase' && this._auth) {
      try {
        await this._auth.signInWithEmailAndPassword(email, password);
      } catch (e) {
        console.warn('Firebase Auth login failed, using local auth:', e);
      }
    }

    return user;
  },

  async logout() {
    this.clearSession();
    if (this._mode === 'firebase' && this._auth) {
      try { await this._auth.signOut(); } catch (e) {}
    }
    window.location.replace('auth.html');
  },

  removeUser(id) {
    const users = this.getUsers().filter(u => u.id !== id);
    this.saveUsers(users);
  },

  // ============================================================
  //  SWIPES
  // ============================================================

  getSwipedIds(userId) {
    const key = `dm_swipes_${userId}`;
    const data = JSON.parse(localStorage.getItem(key) || '{"right":[],"left":[],"super":[]}');
    return [...data.right, ...data.left, ...data.super];
  },

  getSwipes(userId) {
    const key = `dm_swipes_${userId}`;
    return JSON.parse(localStorage.getItem(key) || '{"right":[],"left":[],"super":[]}');
  },

  recordSwipe(userId, targetId, direction) {
    const key = `dm_swipes_${userId}`;
    const swipes = this.getSwipes(userId);

    // Prevent duplicates
    ['right', 'left', 'super'].forEach(d => {
      swipes[d] = swipes[d].filter(id => id !== targetId);
    });
    swipes[direction].push(targetId);
    localStorage.setItem(key, JSON.stringify(swipes));

    // Check for mutual match
    if (direction === 'right' || direction === 'super') {
      const theirSwipes = this.getSwipes(targetId);
      if (theirSwipes.right.includes(userId) || theirSwipes.super.includes(userId)) {
        this.addMatch(userId, targetId);
        this.addMatch(targetId, userId);
        return true; // it's a match!
      }
    }
    return false;
  },

  // ============================================================
  //  MATCHES
  // ============================================================

  getMatches(userId) {
    return JSON.parse(localStorage.getItem(`dm_matches_${userId}`) || '[]');
  },

  addMatch(userId, matchId) {
    const matches = this.getMatches(userId);
    if (!matches.includes(matchId)) {
      matches.push(matchId);
      localStorage.setItem(`dm_matches_${userId}`, JSON.stringify(matches));
    }
  },

  getMatchedUsers(userId) {
    const matchIds = this.getMatches(userId);
    return matchIds.map(id => this.getUser(id)).filter(Boolean);
  },

  // ============================================================
  //  MESSAGES
  // ============================================================

  getConvoKey(uid1, uid2) {
    return [uid1, uid2].sort().join('__');
  },

  getMessages(uid1, uid2) {
    const key = `dm_msgs_${this.getConvoKey(uid1, uid2)}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  },

  addMessage(fromId, toId, text) {
    const key = `dm_msgs_${this.getConvoKey(fromId, toId)}`;
    const msgs = this.getMessages(fromId, toId);
    const msg = {
      id: Date.now(),
      from: fromId,
      text,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      ts: Date.now(),
    };
    msgs.push(msg);
    localStorage.setItem(key, JSON.stringify(msgs));

    // Sync to Firestore if configured
    if (this._mode === 'firebase' && this._firestore) {
      const convoKey = this.getConvoKey(fromId, toId);
      this._firestore
        .collection('messages')
        .doc(convoKey)
        .collection('msgs')
        .doc(msg.id.toString())
        .set(msg)
        .catch(e => console.warn('Firestore message sync failed:', e));
    }
    return msg;
  },

  listenToMessages(uid1, uid2, callback) {
    if (this._mode === 'firebase' && this._firestore) {
      const convoKey = this.getConvoKey(uid1, uid2);
      return this._firestore
        .collection('messages')
        .doc(convoKey)
        .collection('msgs')
        .orderBy('ts', 'asc')
        .onSnapshot(snapshot => {
          const cloudMsgs = [];
          snapshot.forEach(doc => cloudMsgs.push(doc.data()));
          
          if (cloudMsgs.length > 0) {
            const key = `dm_msgs_${convoKey}`;
            localStorage.setItem(key, JSON.stringify(cloudMsgs));
            callback(cloudMsgs);
          }
        }, err => console.warn('Real-time messages error:', err));
    }
    
    // Fallback for local mode: listen to storage events across tabs
    const storageListener = (e) => {
      if (e.key === `dm_msgs_${this.getConvoKey(uid1, uid2)}`) {
        callback(JSON.parse(e.newValue || '[]'));
      }
    };
    window.addEventListener('storage', storageListener);
    return () => window.removeEventListener('storage', storageListener);
  },

  getUnreadCount(userId) {
    const matches = this.getMatches(userId);
    return matches.reduce((acc, matchId) => {
      const msgs = this.getMessages(matchId, userId);
      return acc + msgs.filter(m => m.from !== userId && !m.read).length;
    }, 0);
  },

  markMessagesAsRead(userId, partnerId) {
    const key = `dm_msgs_${this.getConvoKey(userId, partnerId)}`;
    const msgs = this.getMessages(userId, partnerId);
    let changed = false;
    
    msgs.forEach(m => {
      if (m.from === partnerId && !m.read) {
        m.read = true;
        changed = true;
        if (this._mode === 'firebase' && this._firestore) {
          const convoKey = this.getConvoKey(userId, partnerId);
          this._firestore.collection('messages').doc(convoKey).collection('msgs').doc(m.id.toString())
            .set(m, { merge: true }).catch(() => {});
        }
      }
    });
    
    if (changed) {
      localStorage.setItem(key, JSON.stringify(msgs));
    }
    return changed;
  },

  // ============================================================
  //  PROJECTS
  // ============================================================

  getProjects() {
    return JSON.parse(localStorage.getItem('dm_projects') || '[]');
  },

  saveProject(project) {
    const projects = this.getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) projects[idx] = project; else projects.unshift(project);
    localStorage.setItem('dm_projects', JSON.stringify(projects));

    if (this._mode === 'firebase' && this._firestore) {
      this._firestore.collection('projects').doc(project.id).set(project)
        .catch(e => console.warn('Firestore project sync failed:', e));
    }
    return project;
  },

  async syncProjectsFromCloud() {
    if (this._mode !== 'firebase' || !this._firestore) return this.getProjects();
    try {
      const snapshot = await this._firestore.collection('projects').get();
      const projects = [];
      snapshot.forEach(doc => projects.push({ id: doc.id, ...doc.data() }));
      localStorage.setItem('dm_projects', JSON.stringify(projects));
      return projects;
    } catch (e) {
      return this.getProjects();
    }
  },

  // ============================================================
  //  STATS (for auth page)
  // ============================================================

  getStats() {
    const users = this.getUsers();
    const projects = this.getProjects();
    const totalMatches = users.reduce((acc, u) => acc + this.getMatches(u.id).length, 0);
    return {
      users: users.length,
      projects: projects.length,
      matches: Math.floor(totalMatches / 2),
    };
  },

  // ============================================================
  //  AVATAR HELPER
  // ============================================================

  generateAvatar(initials, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color || '#00e855';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 72px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 100, 108);
    return canvas.toDataURL();
  },

  ensureAvatar(user) {
    if (!user.avatar) {
      user.avatar = this.generateAvatar(user.initials || user.name.slice(0, 2).toUpperCase(), user.color || '#00e855');
    }
    return user;
  },
};

// ============================================================
//  SKILL COLOR MAP (shared utility)
// ============================================================
const SKILL_COLORS = {
  'React': '#61DAFB', 'Vue': '#42B883', 'Angular': '#DD0031',
  'Node.js': '#68A063', 'Python': '#3776AB', 'Django': '#092E20',
  'FastAPI': '#009688', 'Go': '#00ADD8', 'Rust': '#DEA584',
  'TypeScript': '#3178C6', 'JavaScript': '#F7DF1E', 'Java': '#ED8B00',
  'Kotlin': '#7F52FF', 'Swift': '#FA7343', 'Flutter': '#54C5F8',
  'React Native': '#61DAFB', 'Docker': '#2496ED', 'Kubernetes': '#326CE5',
  'AWS': '#FF9900', 'GCP': '#4285F4', 'Firebase': '#FFCA28',
  'MongoDB': '#47A248', 'PostgreSQL': '#336791', 'GraphQL': '#E535AB',
  'AI/ML': '#FF6B6B', 'PyTorch': '#EE4C2C', 'TensorFlow': '#FF6F00',
  'Solidity': '#a8ff3e', 'Web3': '#F16822', 'DevOps': '#00e855',
  'Mobile': '#9C27B0', 'Figma': '#F24E1E', 'Next.js': '#39ff84',
  'Svelte': '#FF3E00', 'Three.js': '#049EF4', 'Redis': '#DC382D',
  'Spring Boot': '#6DB33F', 'Laravel': '#FF2D20', 'Ruby': '#CC342D',
  'C++': '#00599C', 'C#': '#239120', '.NET': '#512BD4',
};

function skillColor(s) {
  return SKILL_COLORS[s] || '#00e855';
}
