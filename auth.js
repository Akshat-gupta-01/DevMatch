// ============================================================
//  DevMatch — Auth Page Logic (auth.js)
// ============================================================

function switchTab(tab) {
  ['login', 'signup'].forEach(t => {
    document.getElementById(t + 'Form').classList.toggle('hidden', t !== tab);
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
  });
  document.getElementById('loginError').textContent = '';
  document.getElementById('signupError').textContent = '';
}

function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.textContent = input.type === 'password' ? '👁' : '🙈';
}

function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>${label}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-label">${label}</span><span class="btn-ico">→</span>`;
  }
}

// ---- Handle Login ----
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    return;
  }

  setLoading('loginBtn', true, 'Signing in...');
  try {
    await DB.login(email, password);
    window.location.replace('index.html');
  } catch (err) {
    errEl.textContent = err.message;
    setLoading('loginBtn', false, 'Sign In');
  }
}

// ---- Handle Signup ----
async function handleSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('signupError');
  errEl.textContent = '';

  const name     = document.getElementById('signupName').value.trim();
  const title    = document.getElementById('signupTitle').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const location = document.getElementById('signupLocation').value.trim();
  let github   = document.getElementById('signupGithub').value.trim();
  const expInput = document.querySelector('input[name="exp"]:checked');
  const experience = expInput ? expInput.value : 'Mid-level';

  // Extract username if URL is provided
  if (github.includes('github.com/')) {
    github = github.split('github.com/')[1].split('/')[0];
  }
  github = github.replace('@', '');

  // Validation
  if (!name || !title || !email || !password) {
    errEl.textContent = 'Please fill in all required fields.';
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    return;
  }

  setLoading('signupBtn', true, 'Creating account...');
  try {
    await DB.signUp({ name, title, email, password, location, github, experience });
    window.location.replace('index.html');
  } catch (err) {
    errEl.textContent = err.message;
    setLoading('signupBtn', false, 'Create Account');
  }
}
