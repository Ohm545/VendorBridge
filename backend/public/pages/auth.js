/**
 * VendorBridge — Auth Pages JavaScript
 * Handles all client-side logic for login, signup, forgot/reset password.
 */

const AuthPages = (() => {

  // ── Config ────────────────────────────────────────────────
  const API_BASE = '';  // same origin

  // ── Utilities ─────────────────────────────────────────────

  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  function showAlert(type, message) {
    ['Success', 'Error', 'Info', 'Warning'].forEach(t => {
      const el = document.getElementById('alert' + t);
      if (el) { el.classList.remove('show'); }
    });
    const el    = document.getElementById('alert' + type);
    const msgEl = document.getElementById('alert' + type + 'Msg');
    if (el && msgEl) {
      msgEl.textContent = message;
      el.classList.add('show');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + 'Error');
    const input   = document.getElementById(fieldId);
    if (errorEl) {
      errorEl.querySelector('span').textContent = message;
      errorEl.style.display = 'flex';
    }
    if (input) {
      input.classList.add('input-error');
      input.classList.remove('input-ok');
    }
  }

  function clearFieldError(fieldId) {
    const errorEl = document.getElementById(fieldId + 'Error');
    const input   = document.getElementById(fieldId);
    if (errorEl) errorEl.style.display = 'none';
    if (input) { input.classList.remove('input-error'); }
  }

  function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.style.display = 'none');
    document.querySelectorAll('input').forEach(el => el.classList.remove('input-error', 'input-ok'));
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validatePassword(pw) {
    const rules = {
      length:    pw.length >= 8,
      uppercase: /[A-Z]/.test(pw),
      lowercase: /[a-z]/.test(pw),
      number:    /[0-9]/.test(pw),
      special:   /[^A-Za-z0-9]/.test(pw),
    };
    return rules;
  }

  function getPasswordStrength(pw) {
    const r = validatePassword(pw);
    const score = Object.values(r).filter(Boolean).length;
    if (score <= 1) return { pct: 15,  label: 'Very Weak',  color: '#dc2626' };
    if (score === 2) return { pct: 35, label: 'Weak',       color: '#d97706' };
    if (score === 3) return { pct: 60, label: 'Fair',       color: '#d97706' };
    if (score === 4) return { pct: 80, label: 'Strong',     color: '#16a34a' };
    return               { pct: 100, label: 'Very Strong', color: '#16a34a' };
  }

  function setupPasswordStrength(inputId, strengthId, fillId, labelId) {
    const input   = document.getElementById(inputId);
    const wrap    = document.getElementById(strengthId);
    const fill    = document.getElementById(fillId);
    const label   = document.getElementById(labelId);
    if (!input || !wrap) return;

    input.addEventListener('input', () => {
      const val = input.value;
      if (!val) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      const s = getPasswordStrength(val);
      fill.style.width      = s.pct + '%';
      fill.style.background = s.color;
      label.textContent     = s.label;
      label.style.color     = s.color;
    });
  }

  function setupTogglePassword(toggleId, inputId) {
    const btn   = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type     = isHidden ? 'text' : 'password';
      btn.innerHTML  = isHidden
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    });
  }

  async function apiPost(endpoint, body) {
    const token = localStorage.getItem('vb_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res  = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return res.json();
  }

  function handleServerErrors(data) {
    if (data.errors && Array.isArray(data.errors)) {
      data.errors.forEach(err => {
        const field = err.path || err.param;
        if (field) showFieldError(field, err.msg);
      });
      return true;
    }
    return false;
  }

  // ── Check URL params on login page (redirect messages) ───
  function checkLoginPageParams() {
    const verified = getParam('verified');
    const error    = getParam('error');
    if (verified === 'true') {
      showAlert('Success', 'Email verified successfully. You can now sign in.');
    } else if (verified === 'already') {
      showAlert('Info', 'Your email is already verified. Please sign in.');
    } else if (error === 'google_failed' || error === 'google_auth_failed') {
      showAlert('Error', 'Google sign-in failed. Please try again or use email/password.');
    }
  }

  // ═══════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════
  function initLogin() {
    checkLoginPageParams();

    const form = document.getElementById('loginForm');
    const btn  = document.getElementById('loginBtn');
    if (!form) return;

    setupTogglePassword('togglePw', 'password');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllErrors();

      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      let valid      = true;

      if (!email) { showFieldError('email', 'Email is required.'); valid = false; }
      else if (!validateEmail(email)) { showFieldError('email', 'Enter a valid email address.'); valid = false; }
      if (!password) { showFieldError('password', 'Password is required.'); valid = false; }
      if (!valid) return;

      setLoading(btn, true);

      try {
        const data = await apiPost('/auth/login', { email, password });

        if (!data.success) {
          if (!handleServerErrors(data)) {
            if (data.code === 'EMAIL_NOT_VERIFIED') {
              showAlert('Warning', data.message + ' <a href="/auth/resend-verification?email=' + encodeURIComponent(email) + '" style="color:inherit;text-decoration:underline;">Resend verification email</a>');
            } else {
              showAlert('Error', data.message || 'Login failed.');
            }
          }
          setLoading(btn, false);
          return;
        }

        // Store token
        localStorage.setItem('vb_token', data.token);
        localStorage.setItem('vb_role',  data.user?.role || '');

        showAlert('Success', 'Login successful! Redirecting...');
        setTimeout(() => { window.location.href = data.redirect || '/procurement/dashboard'; }, 900);

      } catch (err) {
        showAlert('Error', 'Network error. Please check your connection and try again.');
        setLoading(btn, false);
      }
    });
  }

  // ═══════════════════════════════════════════
  // SIGNUP
  // ═══════════════════════════════════════════
  function initSignup() {
    const form = document.getElementById('signupForm');
    const btn  = document.getElementById('signupBtn');
    if (!form) return;

    setupPasswordStrength('password', 'pwStrength', 'pwStrengthFill', 'pwStrengthLabel');
    setupTogglePassword('togglePw', 'password');
    setupTogglePassword('toggleConfirmPw', 'confirm_password');

    // Live confirm password validation
    const confirmInput = document.getElementById('confirm_password');
    const pwInput      = document.getElementById('password');
    if (confirmInput && pwInput) {
      confirmInput.addEventListener('input', () => {
        if (confirmInput.value && confirmInput.value !== pwInput.value) {
          showFieldError('confirm_password', 'Passwords do not match.');
        } else {
          clearFieldError('confirm_password');
          if (confirmInput.value) confirmInput.classList.add('input-ok');
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllErrors();

      const full_name        = document.getElementById('full_name').value.trim();
      const company_name     = document.getElementById('company_name').value.trim();
      const email            = document.getElementById('email').value.trim();
      const password         = document.getElementById('password').value;
      const confirm_password = document.getElementById('confirm_password').value;
      let valid              = true;

      if (!full_name || full_name.length < 2) { showFieldError('full_name', 'Full name must be at least 2 characters.'); valid = false; }
      if (!company_name || company_name.length < 2) { showFieldError('company_name', 'Company name must be at least 2 characters.'); valid = false; }
      if (!email) { showFieldError('email', 'Email is required.'); valid = false; }
      else if (!validateEmail(email)) { showFieldError('email', 'Enter a valid email address.'); valid = false; }

      if (!password) {
        showFieldError('password', 'Password is required.'); valid = false;
      } else {
        const rules = validatePassword(password);
        if (!rules.length)    { showFieldError('password', 'Password must be at least 8 characters.'); valid = false; }
        else if (!rules.uppercase) { showFieldError('password', 'Add at least one uppercase letter.'); valid = false; }
        else if (!rules.lowercase) { showFieldError('password', 'Add at least one lowercase letter.'); valid = false; }
        else if (!rules.number)    { showFieldError('password', 'Add at least one number.'); valid = false; }
        else if (!rules.special)   { showFieldError('password', 'Add at least one special character (!@#$%).'); valid = false; }
      }

      if (!confirm_password) { showFieldError('confirm_password', 'Please confirm your password.'); valid = false; }
      else if (confirm_password !== password) { showFieldError('confirm_password', 'Passwords do not match.'); valid = false; }

      if (!valid) return;

      setLoading(btn, true);

      try {
        const data = await apiPost('/auth/signup', { full_name, company_name, email, password, confirm_password });

        if (!data.success) {
          if (!handleServerErrors(data)) showAlert('Error', data.message || 'Signup failed.');
          setLoading(btn, false);
          return;
        }

        showAlert('Success', data.message || 'Verification email sent. Please verify your email before logging in.');
        form.reset();
        document.getElementById('pwStrength').style.display = 'none';

      } catch (err) {
        showAlert('Error', 'Network error. Please check your connection and try again.');
      }

      setLoading(btn, false);
    });
  }

  // ═══════════════════════════════════════════
  // FORGOT PASSWORD
  // ═══════════════════════════════════════════
  function initForgotPassword() {
    const form = document.getElementById('forgotForm');
    const btn  = document.getElementById('forgotBtn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllErrors();

      const email = document.getElementById('email').value.trim();
      if (!email) { showFieldError('email', 'Email is required.'); return; }
      if (!validateEmail(email)) { showFieldError('email', 'Enter a valid email address.'); return; }

      setLoading(btn, true);

      try {
        const data = await apiPost('/auth/forgot-password', { email });
        if (data.success) {
          showAlert('Success', data.message);
          form.reset();
        } else {
          if (!handleServerErrors(data)) showAlert('Error', data.message || 'Something went wrong.');
        }
      } catch (err) {
        showAlert('Error', 'Network error. Please try again.');
      }

      setLoading(btn, false);
    });
  }

  // ═══════════════════════════════════════════
  // RESET PASSWORD
  // ═══════════════════════════════════════════
  function initResetPassword() {
    const token = getParam('token');

    if (!token) {
      document.getElementById('formState').style.display = 'none';
      document.getElementById('invalidState').style.display = 'block';
      return;
    }

    const tokenInput = document.getElementById('resetToken');
    if (tokenInput) tokenInput.value = token;

    setupPasswordStrength('password', 'pwStrength', 'pwStrengthFill', 'pwStrengthLabel');
    setupTogglePassword('togglePw', 'password');
    setupTogglePassword('toggleConfirmPw', 'confirm_password');

    const form = document.getElementById('resetForm');
    const btn  = document.getElementById('resetBtn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllErrors();

      const password         = document.getElementById('password').value;
      const confirm_password = document.getElementById('confirm_password').value;
      let valid              = true;

      if (!password) {
        showFieldError('password', 'Password is required.'); valid = false;
      } else {
        const rules = validatePassword(password);
        if (!rules.length)    { showFieldError('password', 'Password must be at least 8 characters.'); valid = false; }
        else if (!rules.uppercase) { showFieldError('password', 'Add at least one uppercase letter.'); valid = false; }
        else if (!rules.lowercase) { showFieldError('password', 'Add at least one lowercase letter.'); valid = false; }
        else if (!rules.number)    { showFieldError('password', 'Add at least one number.'); valid = false; }
        else if (!rules.special)   { showFieldError('password', 'Add at least one special character.'); valid = false; }
      }

      if (!confirm_password) { showFieldError('confirm_password', 'Please confirm your password.'); valid = false; }
      else if (confirm_password !== password) { showFieldError('confirm_password', 'Passwords do not match.'); valid = false; }

      if (!valid) return;

      setLoading(btn, true);

      try {
        const data = await apiPost('/auth/reset-password', { token, password, confirm_password });

        if (!data.success) {
          if (!handleServerErrors(data)) {
            showAlert('Error', data.message || 'Reset failed.');
            if (data.message && (data.message.includes('expired') || data.message.includes('Invalid'))) {
              setTimeout(() => {
                document.getElementById('formState').style.display = 'none';
                document.getElementById('invalidState').style.display = 'block';
              }, 2000);
            }
          }
          setLoading(btn, false);
          return;
        }

        showAlert('Success', data.message || 'Password updated successfully.');
        form.reset();
        document.getElementById('pwStrength').style.display = 'none';
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);

      } catch (err) {
        showAlert('Error', 'Network error. Please try again.');
        setLoading(btn, false);
      }
    });
  }

  return { initLogin, initSignup, initForgotPassword, initResetPassword };

})();
