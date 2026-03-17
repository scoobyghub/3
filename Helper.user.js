// ==UserScript==
// @name         TMN TDS Auto v14.04
// @namespace    http://tampermonkey.net/
// @version      14.04
// @description  v14.04 — Human delays, OC/DTM 5-layer dedup, FOUC fix
// @author       You
// @match        *://www.tmn2010.net/login.aspx*
// @match        *://www.tmn2010.net/authenticated/*
// @match        *://www.tmn2010.net/Login.aspx*
// @match        *://www.tmn2010.net/Authenticated/*
// @match        *://www.tmn2010.net/Default.aspx*
// @match        *://www.tmn2010.net/default.aspx*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      api.telegram.org
// @updateURL    https://raw.githubusercontent.com/scoobyghub/3/refs/heads/main/Helper.meta.js
// @downloadURL  https://raw.githubusercontent.com/scoobyghub/3/refs/heads/main/Helper.user.js
// ==/UserScript==

/* AUTO-CONFIRM - Same as working alooo sabzi.txt */
(function () {
    try {
        const script = document.createElement('script');
        script.textContent = `
            window.confirm = function(msg) {
                console.log('[TMN][AUTO-CONFIRM]:', msg);
                return true;
            };
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (e) {
        console.warn('[TMN] Failed to inject auto-confirm override:', e);
    }
})();

(function () {
  'use strict';

  // ---------------------------
  // PAGE EXCLUSIONS — don't run automation UI on these pages
  // ---------------------------
  const EXCLUDED_PAGES = [
    '/authenticated/forum.aspx',
    '/authenticated/personal.aspx',
    '/authenticated/store.aspx?p=b'
  ];
  const currentPathLower = (window.location.pathname + window.location.search).toLowerCase();
  if (EXCLUDED_PAGES.some(page => currentPathLower.includes(page.toLowerCase()))) {
    console.log('[TMN] Excluded page — automation disabled on', currentPathLower);
    return; // Exit entire script
  }

  // ---------------------------
  // Minimal global CSS so host container sits above the page (always on top)
  // ---------------------------
  GM_addStyle(`
    #tmn-automation-host {
      position: fixed !important;
      top: 12px;
      right: 12px;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      visibility: hidden !important;
    }
    #tmn-automation-host.tmn-ready {
      visibility: visible !important;
    }
  `);

  // ---------------------------

  // ============================================================
  // AUTO-LOGIN CONFIGURATION
  // ============================================================
  const LOGIN_CONFIG = {
  USERNAME: GM_getValue('loginUsername', "username"),
  PASSWORD: GM_getValue('loginPassword', "password"),
  AUTO_SUBMIT_ENABLED: GM_getValue('autoSubmitEnabled', true),
  MAX_LOGIN_ATTEMPTS: 3,
  AUTO_SUBMIT_DELAY: 3000
};

  // ---------------------------
  // Logout Alert Configuration (defined early so it's available on login page)
  // ---------------------------
  const logoutAlertConfig = {
    tabFlash: GM_getValue('logoutTabFlash', true),
    browserNotify: GM_getValue('logoutBrowserNotify', true)
  };

  function saveLogoutAlertConfig() {
    GM_setValue('logoutTabFlash', logoutAlertConfig.tabFlash);
    GM_setValue('logoutBrowserNotify', logoutAlertConfig.browserNotify);
  }

  // Tab title flash state
  let titleFlashInterval = null;
  const originalTitle = document.title;

  function flashTabTitle() {
    if (titleFlashInterval) return; // Already flashing
    let toggle = false;
    titleFlashInterval = setInterval(() => {
      document.title = toggle ? '🔴 LOGIN NEEDED' : originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  function stopFlashTabTitle() {
    if (titleFlashInterval) {
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
      document.title = originalTitle;
    }
  }

  function showLogoutBrowserNotification() {
    if (Notification.permission === 'granted') {
      new Notification('TMN2010 Session Expired', {
        body: 'Click to switch to tab and log back in',
        requireInteraction: true,
        icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
      });
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          new Notification('TMN2010 Session Expired', {
            body: 'Click to switch to tab and log back in',
            requireInteraction: true
          });
        }
      });
    }
  }

  function triggerLogoutAlerts() {
    if (logoutAlertConfig.tabFlash) {
      flashTabTitle();
    }
    if (logoutAlertConfig.browserNotify) {
      showLogoutBrowserNotification();
    }
  }

  // ============================================================
  // CHECK IF WE'RE ON DEFAULT PAGE (SESSION REFRESH) - REDIRECT TO LOGIN
  // ============================================================
  const currentPath = window.location.pathname.toLowerCase();
  const currentSearch = window.location.search.toLowerCase();

  if (currentPath.includes("/default.aspx") && currentSearch.includes("show=1")) {
    console.log("[TMN] On Default.aspx?show=1 - waiting 6 seconds then redirecting to login...");
    // Create overlay to show status
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed", top: "10px", right: "10px",
      background: "rgba(0,0,0,0.85)", color: "#fff",
      padding: "12px", borderRadius: "8px",
      fontFamily: "system-ui, sans-serif", fontSize: "14px",
      zIndex: "9999", textAlign: "center",
      minWidth: "250px", border: "2px solid #f59e0b"
    });
    overlay.innerHTML = "🔄 <b>Session Refresh</b><br>Redirecting to login in <span id='tmn-countdown'>6</span>s...";
    document.body.appendChild(overlay);

    let countdown = 6;
    const countdownEl = document.getElementById('tmn-countdown');
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdownEl) countdownEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        window.location.href = 'https://www.tmn2010.net/login.aspx';
      }
    }, 1000);

    return; // Don't run rest of script
  }

  // ============================================================
  // CHECK IF WE'RE ON LOGIN PAGE - HANDLE AUTO-LOGIN FIRST
  // ============================================================
  const isLoginPage = currentPath.includes("/login.aspx");

  if (isLoginPage) {
    // Trigger logout alerts (tab flash, browser notification) when redirected to login page
    triggerLogoutAlerts();

    // AUTO-LOGIN CODE
    const USERNAME_ID = "ctl00_main_txtUsername";
    const PASSWORD_ID = "ctl00_main_txtPassword";
    const LOGIN_BTN_ID = "ctl00_main_btnLogin";
    const TOKEN_SEL = "textarea[name='g-recaptcha-response'], #g-recaptcha-response";
    const ERROR_SEL = ".TMNErrorFont";

    const LS_LOGIN_ATTEMPTS = "tmnLoginAttempts";
    const LS_LOGIN_PAUSED = "tmnLoginPaused";
    const LS_LAST_TOKEN = "tmnLastTokenUsed";

    let loginAttempts = parseInt(localStorage.getItem(LS_LOGIN_ATTEMPTS) || "0", 10);
    let loginPaused = localStorage.getItem(LS_LOGIN_PAUSED) === "true";
    let lastTokenUsed = localStorage.getItem(LS_LAST_TOKEN) || "";
    let submitTimer = null;
    let countdownTimer = null;
    let loginOverlay = null;
    let submitLocked = false;  // Once countdown starts, block all re-scheduling
    let submitEndTime = 0;     // Fixed timestamp when submit will fire

    function log(...args) {
      console.log("[TMN AutoLogin]", ...args);
    }

    function updateLoginOverlay(message) {
      if (!loginOverlay) {
        loginOverlay = document.createElement("div");
        Object.assign(loginOverlay.style, {
          position: "fixed", top: "10px", right: "10px",
          background: "rgba(0,0,0,0.85)", color: "#fff",
          padding: "12px", borderRadius: "8px",
          fontFamily: "system-ui, sans-serif", fontSize: "14px",
          zIndex: "9999", whiteSpace: "pre-line",
          lineHeight: "1.4em", textAlign: "center",
          minWidth: "250px", border: "2px solid #007bff"
        });
        document.body.appendChild(loginOverlay);
      }
      console.log("[TMN AutoLogin]", message);
      loginOverlay.textContent = `TMN TDS AutoLogin v14.04\n${message}`;
    }

    function clearTimers() {
      if (submitTimer) { clearTimeout(submitTimer); submitTimer = null; }
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
      submitLocked = false;
      submitEndTime = 0;
    }

    function resetLoginState() {
      if (loginPaused || loginAttempts >= LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS) {
        log("Resetting login state on login page");
        localStorage.setItem(LS_LOGIN_ATTEMPTS, "0");
        localStorage.setItem(LS_LOGIN_PAUSED, "false");
        loginAttempts = 0;
        loginPaused = false;
      }
    }

    function getCaptchaToken() {
      const element = document.querySelector(TOKEN_SEL);
      return element && typeof element.value === "string" ? element.value.trim() : "";
    }

    function isCaptchaCompleted() {
      const recaptchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');
      if (recaptchaResponse && recaptchaResponse.value && recaptchaResponse.value.length > 0) {
        return true;
      }
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const usernameField = document.getElementById(USERNAME_ID);
      const passwordField = document.getElementById(PASSWORD_ID);
      if (loginBtn && !loginBtn.disabled &&
          usernameField && usernameField.value.length > 0 &&
          passwordField && passwordField.value.length > 0) {
        return true;
      }
      return false;
    }

    function fillCredentials() {
      if (LOGIN_CONFIG.USERNAME === "your_username_here" || LOGIN_CONFIG.PASSWORD === "your_password_here") {
        updateLoginOverlay("⚠️ Please set your USERNAME and PASSWORD\nin the script configuration.");
        return false;
      }
      const usernameField = document.getElementById(USERNAME_ID);
      const passwordField = document.getElementById(PASSWORD_ID);
      if (usernameField && passwordField) {
        usernameField.value = LOGIN_CONFIG.USERNAME;
        passwordField.value = LOGIN_CONFIG.PASSWORD;
        log("Credentials filled successfully");
        return true;
      }
      return false;
    }

    function canAutoLogin() {
      if (LOGIN_CONFIG.USERNAME === "your_username_here" || LOGIN_CONFIG.PASSWORD === "your_password_here") {
        return false;
      }
      if (!LOGIN_CONFIG.AUTO_SUBMIT_ENABLED) {
        updateLoginOverlay("🟢 Credentials filled.\nAuto-submit disabled.\nSolve captcha manually.");
        return false;
      }
      return true;
    }

    function attemptLogin() {
      // Don't clear timers yet — check if we can actually submit first
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const currentToken = getCaptchaToken();
      if (!loginBtn || loginBtn.disabled || !currentToken) {
        // Token may have flickered — retry up to 3 times over 1.5s before giving up
        if (!attemptLogin._retries) attemptLogin._retries = 0;
        attemptLogin._retries++;
        if (attemptLogin._retries <= 3) {
          log(`Login not ready on attempt ${attemptLogin._retries}/3 — retrying in 500ms...`);
          updateLoginOverlay(`⚠️ Verifying captcha... retry ${attemptLogin._retries}/3`);
          setTimeout(attemptLogin, 500);
          return;
        }
        // Gave up — reset everything
        attemptLogin._retries = 0;
        clearTimers();
        updateLoginOverlay("⚠️ Login not ready - waiting for new captcha...");
        return;
      }
      attemptLogin._retries = 0;
      clearTimers();
      loginAttempts++;
      localStorage.setItem(LS_LOGIN_ATTEMPTS, loginAttempts.toString());
      lastTokenUsed = currentToken;
      localStorage.setItem(LS_LAST_TOKEN, lastTokenUsed);
      updateLoginOverlay(`🔐 Submitting login ${loginAttempts}/${LOGIN_CONFIG.MAX_LOGIN_ATTEMPTS}...`);
      loginBtn.click();
    }

    function scheduleAutoSubmit(delay = LOGIN_CONFIG.AUTO_SUBMIT_DELAY) {
      if (submitLocked) {
        log("Submit already locked — ignoring duplicate schedule request");
        return;
      }
      clearTimers();
      submitLocked = true;
      submitEndTime = Date.now() + delay;
      // Display uses the fixed end time — can never jump backwards
      function updateCountdownDisplay() {
        const remaining = Math.ceil((submitEndTime - Date.now()) / 1000);
        if (remaining > 0) {
          updateLoginOverlay(`✅ Captcha completed – submitting in ${remaining}s...`);
        }
      }
      updateCountdownDisplay();
      countdownTimer = setInterval(updateCountdownDisplay, 500); // Update twice per second for smoother display
      submitTimer = setTimeout(() => {
        clearInterval(countdownTimer);
        countdownTimer = null;
        attemptLogin();
      }, delay);
    }

    function checkLoginPage() {
      // If submit countdown is locked in, don't touch anything — just let it finish
      if (submitLocked) { return; }

      const errorElement = document.querySelector(ERROR_SEL);
      if (errorElement) {
        const errorMsg = (errorElement.textContent || "").trim().toLowerCase();
        if (errorMsg.includes("incorrect validation") || errorMsg.includes("invalid")) {
          // Login failed — clear everything and redirect Home → Login for a fresh session
          clearTimers();
          lastTokenUsed = "";
          localStorage.removeItem(LS_LAST_TOKEN);
          localStorage.setItem(LS_LOGIN_ATTEMPTS, "0");
          localStorage.setItem(LS_LOGIN_PAUSED, "false");
          const errorType = errorMsg.includes("incorrect validation") ? "Incorrect Validation" : "Invalid credentials";
          updateLoginOverlay(`❌ ${errorType}\n🔄 Redirecting Home for fresh session...`);
          log(`Login error: ${errorType} — redirecting to Default.aspx?show=1`);
          setTimeout(() => {
            window.location.href = 'https://www.tmn2010.net/Default.aspx?show=1';
          }, 2000);
          return;
        }
      }
      if (!canAutoLogin()) { return; }
      const loginBtn = document.getElementById(LOGIN_BTN_ID);
      const captchaCompleted = isCaptchaCompleted();
      const currentToken = getCaptchaToken();
      if (loginBtn && !loginBtn.disabled && captchaCompleted && currentToken && currentToken !== lastTokenUsed) {
        if (!submitTimer) {
          updateLoginOverlay("✅ Captcha completed - auto-submitting...");
          scheduleAutoSubmit(LOGIN_CONFIG.AUTO_SUBMIT_DELAY + Math.floor(Math.random() * 2000));
        }
      } else {
        if (submitTimer && (!captchaCompleted || !currentToken || (loginBtn && loginBtn.disabled))) {
          clearTimers();
          if (!captchaCompleted) {
            updateLoginOverlay("⏳ Waiting for captcha completion...");
          } else if (!currentToken) {
            updateLoginOverlay("⏳ Waiting for captcha token...");
          } else {
            updateLoginOverlay("⏳ Waiting for login button...");
          }
        }
      }
    }

    function initializeAutoLogin() {
      log("TMN AutoLogin initialized");
      resetLoginState();
      const credentialsFilled = fillCredentials();
      if (!credentialsFilled) { return; }
      if (canAutoLogin()) {
        updateLoginOverlay("🟢 Auto-login enabled.\nSolve captcha to continue...");
        const checkInterval = setInterval(checkLoginPage, 1000);
        window.addEventListener('beforeunload', () => {
          clearInterval(checkInterval);
          clearTimers();
        });
      }
    }

    // Initialize auto-login
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAutoLogin);
    } else {
      setTimeout(initializeAutoLogin, 500);
    }

    // Exit early - don't run main automation on login page
    return;
  }

  // ============================================================
  // RESET LOGIN ATTEMPTS WHEN SUCCESSFULLY AUTHENTICATED
  // ============================================================
  if (currentPath.includes("/authenticated/")) {
    const loginAttempts = parseInt(localStorage.getItem("tmnLoginAttempts") || "0", 10);
    const loginPaused = localStorage.getItem("tmnLoginPaused") === "true";
    if (loginAttempts > 0 || loginPaused) {
      console.log("[TMN] Successfully logged in - resetting login attempts");
      localStorage.setItem("tmnLoginAttempts", "0");
      localStorage.setItem("tmnLoginPaused", "false");
      localStorage.removeItem("tmnLastTokenUsed");
    }
  }

// ============================================================
// CAPTCHA HANDLER FOR AUTHENTICATED PAGES
// ============================================================
if (currentPath.includes("/authenticated/")) {
  function handleAuthenticatedCaptcha() {
    const captchaFrame = document.querySelector('iframe[src*="recaptcha"]');
    const captchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');

    if (captchaFrame || captchaResponse) {
      const token = captchaResponse?.value?.trim();

      if (token && token.length > 0) {
        // Captcha completed - find and click submit
        const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]') ||
                         document.getElementById('ctl00_main_btnVerify') ||
                         Array.from(document.querySelectorAll('input, button')).find(b =>
                           b.value?.toLowerCase().includes('verify') ||
                           b.textContent?.toLowerCase().includes('verify')
                         );

        if (submitBtn && !submitBtn.disabled) {
          console.log('[TMN] Captcha completed - submitting...');
          setTimeout(() => submitBtn.click(), 1000);
        }
      }
    }
  }

  setInterval(handleAuthenticatedCaptcha, 1000);
}

  // Config + State
  // ---------------------------
  const config = {
    crimeInterval: GM_getValue('crimeInterval', 125),
    gtaInterval: GM_getValue('gtaInterval', 245),
    jailbreakInterval: GM_getValue('jailbreakInterval', 3),
    jailCheckInterval: GM_getValue('jailCheckInterval', 5),
    boozeInterval: GM_getValue('boozeInterval', 120),
    boozeBuyAmount: GM_getValue('boozeBuyAmount', 5),
    boozeSellAmount: GM_getValue('boozeSellAmount', 1),
    healthCheckInterval: GM_getValue('healthCheckInterval', 30),
    garageInterval: GM_getValue('garageInterval', 300),
    minHealthThreshold: GM_getValue('minHealthThreshold', 90),
    targetHealth: GM_getValue('targetHealth', 100)
  };

  // ---------------------------
  // Human-like Delays (anti-detection)
  // ---------------------------
  const DELAYS = {
    quick: [1100, 1900],
    normal: [1200, 3000],
    slow: [2500, 6000],
    error: [5000, 15000]
  };

  function randomDelay(range = DELAYS.normal) {
    const r = Array.isArray(range) ? range : DELAYS.normal;
    const min = Math.max(0, Number(r[0] || 0));
    const max = Math.max(min, Number(r[1] || min));
    const u = (Math.random() + Math.random() + Math.random()) / 3;
    let ms = Math.floor(min + (max - min) * u);
    ms += Math.floor((Math.random() - 0.5) * 240);
    if (Math.random() < 0.03) ms += 400 + Math.floor(Math.random() * 1200);
    return Math.max(0, ms);
  }

  function humanDelay(range = DELAYS.normal) {
    return new Promise(resolve => setTimeout(resolve, randomDelay(range)));
  }

  function humanPause(range = DELAYS.normal, thinkChance = 0.08) {
    let r = range;
    if (Math.random() < thinkChance) {
      r = [Math.max(1800, range[0] * 1.6), Math.max(4200, range[1] * 1.8)];
    }
    return humanDelay(r);
  }
    // ---------------------------
  // Telegram Configuration
  // ---------------------------
  const telegramConfig = {
    botToken: GM_getValue('telegramBotToken', ''),
    chatId: GM_getValue('telegramChatId', ''),
    enabled: GM_getValue('telegramEnabled', false),
    notifyCaptcha: GM_getValue('notifyCaptcha', true),
    notifyMessages: GM_getValue('notifyMessages', true),
    lastMessageCheck: GM_getValue('lastMessageCheck', 0),
    messageCheckInterval: GM_getValue('messageCheckInterval', 60),
    notifySqlCheck: GM_getValue('notifySqlCheck', true),
    notifyLogout: GM_getValue('notifyLogout', true)
};

  function saveTelegramConfig() {
    GM_setValue('telegramBotToken', telegramConfig.botToken);
    GM_setValue('telegramChatId', telegramConfig.chatId);
    GM_setValue('telegramEnabled', telegramConfig.enabled);
    GM_setValue('notifyCaptcha', telegramConfig.notifyCaptcha);
    GM_setValue('notifyMessages', telegramConfig.notifyMessages);
    GM_setValue('lastMessageCheck', telegramConfig.lastMessageCheck);
    GM_setValue('messageCheckInterval', telegramConfig.messageCheckInterval);
    GM_setValue('notifySqlCheck', telegramConfig.notifySqlCheck);
    GM_setValue('notifyLogout', telegramConfig.notifyLogout);
  }

  let state = {
    autoCrime: GM_getValue('autoCrime', false),
    autoGTA: GM_getValue('autoGTA', false),
    autoJail: GM_getValue('autoJail', false),
    autoBooze: GM_getValue('autoBooze', false),
    autoHealth: GM_getValue('autoHealth', false),
    autoGarage: GM_getValue('autoGarage', false),
    lastCrime: GM_getValue('lastCrime', 0),
    lastGTA: GM_getValue('lastGTA', 0),
    lastJail: GM_getValue('lastJail', 0),
    lastBooze: GM_getValue('lastBooze', 0),
    lastHealth: GM_getValue('lastHealth', 0),
    lastGarage: GM_getValue('lastGarage', 0),
    selectedCrimes: GM_getValue('selectedCrimes', [1,3,5]),
    selectedGTAs: GM_getValue('selectedGTAs', [5]),
    playerName: GM_getValue('playerName', ''),
    inJail: GM_getValue('inJail', false),
    panelCollapsed: {
      crime: GM_getValue('crimeCollapsed', false),
      gta: GM_getValue('gtaCollapsed', false),
      booze: GM_getValue('boozeCollapsed', false)
    },
    panelMinimized: GM_getValue('panelMinimized', false),
    isPerformingAction: false,
    lastJailCheck: GM_getValue('lastJailCheck', 0),
    currentAction: GM_getValue('currentAction', ''),
    needsRefresh: GM_getValue('needsRefresh', false),
    pendingAction: GM_getValue('pendingAction', ''),
    buyingHealth: GM_getValue('buyingHealth', false),
    autoOC: GM_getValue('autoOC', false),
    autoDTM: GM_getValue('autoDTM', false),
    notifyOCDTMReady: GM_getValue('notifyOCDTMReady', true)
  };

  let automationPaused = false;

  function saveState() {
    GM_setValue('autoCrime', state.autoCrime);
    GM_setValue('autoGTA', state.autoGTA);
    GM_setValue('autoJail', state.autoJail);
    GM_setValue('autoBooze', state.autoBooze);
    GM_setValue('autoHealth', state.autoHealth);
    GM_setValue('autoGarage', state.autoGarage);
    GM_setValue('lastCrime', state.lastCrime);
    GM_setValue('lastGTA', state.lastGTA);
    GM_setValue('lastJail', state.lastJail);
    GM_setValue('lastBooze', state.lastBooze);
    GM_setValue('lastHealth', state.lastHealth);
    GM_setValue('lastGarage', state.lastGarage);
    GM_setValue('selectedCrimes', state.selectedCrimes);
    GM_setValue('selectedGTAs', state.selectedGTAs);
    GM_setValue('playerName', state.playerName);
    GM_setValue('inJail', state.inJail);
    GM_setValue('crimeCollapsed', state.panelCollapsed.crime);
    GM_setValue('gtaCollapsed', state.panelCollapsed.gta);
    GM_setValue('boozeCollapsed', state.panelCollapsed.booze);
    GM_setValue('panelMinimized', state.panelMinimized);
    GM_setValue('lastJailCheck', state.lastJailCheck);
    GM_setValue('currentAction', state.currentAction);
    GM_setValue('needsRefresh', state.needsRefresh);
    GM_setValue('pendingAction', state.pendingAction);
    GM_setValue('buyingHealth', state.buyingHealth);
    GM_setValue('autoOC', state.autoOC);
    GM_setValue('autoDTM', state.autoDTM);
    GM_setValue('notifyOCDTMReady', state.notifyOCDTMReady);
  }

  // ---------------------------
  // Tab Manager - Prevents multiple tabs from conflicting
  // Single tab enforcement: Only one tab can run automation at a time
  // ---------------------------
  const LS_TAB_MASTER = "tmnMasterTab";
  const LS_TAB_HEARTBEAT = "tmnTabHeartbeat";
  const LS_SCRIPT_CHECK_ACTIVE = "tmnScriptCheckActive";
  const LS_TAB_LOCK = "tmnTabLock"; // Additional lock for atomic operations

  class TabManager {
    constructor() {
      this.tabId = this.generateTabId();
      this.heartbeatInterval = null;
      this.isMasterTab = false;
      this.HEARTBEAT_INTERVAL = 2000; // 2 seconds - more frequent heartbeat
      this.MASTER_TIMEOUT = 6000; // 6 seconds - faster takeover if master dies
      this.initialized = false;
    }

    generateTabId() {
      return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    checkMasterStatus() {
      const currentMaster = localStorage.getItem(LS_TAB_MASTER);
      const lastHeartbeat = parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10);
      const now = Date.now();

      // Check if we are the current master
      if (currentMaster === this.tabId) {
        this.isMasterTab = true;
        // Update heartbeat
        localStorage.setItem(LS_TAB_HEARTBEAT, now.toString());
        return true;
      }

      // If no master or master hasn't sent heartbeat recently, try to become master
      if (!currentMaster || (now - lastHeartbeat) > this.MASTER_TIMEOUT) {
        // Use lock to prevent race condition when multiple tabs try to become master
        const lock = localStorage.getItem(LS_TAB_LOCK);
        if (!lock || (now - parseInt(lock, 10)) > 1000) {
          localStorage.setItem(LS_TAB_LOCK, now.toString());
          // Double-check after setting lock
          setTimeout(() => {
            const stillNoMaster = !localStorage.getItem(LS_TAB_MASTER) ||
              (Date.now() - parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10)) > this.MASTER_TIMEOUT;
            if (stillNoMaster) {
              this.becomeMaster();
            }
          }, 100);
        }
        return this.isMasterTab;
      }

      // Another tab is master
      this.isMasterTab = false;
      return false;
    }

    becomeMaster() {
      this.isMasterTab = true;
      localStorage.setItem(LS_TAB_MASTER, this.tabId);
      localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
      console.log(`[TMN] Tab ${this.tabId.substr(0, 12)}... became master`);
      this.startHeartbeat();
    }

    startHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }

      this.heartbeatInterval = setInterval(() => {
        if (this.isMasterTab) {
          const currentMaster = localStorage.getItem(LS_TAB_MASTER);
          // Verify we're still the master before updating heartbeat
          if (currentMaster === this.tabId) {
            localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
          } else {
            console.log("[TMN] Lost master status, stopping heartbeat");
            this.stopHeartbeat();
            this.isMasterTab = false;
          }
        }
      }, this.HEARTBEAT_INTERVAL);
    }

    stopHeartbeat() {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    }

    releaseMaster() {
      if (this.isMasterTab) {
        // Only clear if we're still the master
        const currentMaster = localStorage.getItem(LS_TAB_MASTER);
        if (currentMaster === this.tabId) {
          localStorage.removeItem(LS_TAB_MASTER);
          localStorage.removeItem(LS_TAB_HEARTBEAT);
        }
        this.stopHeartbeat();
        this.isMasterTab = false;
        console.log("[TMN] Released master tab status");
      }
    }

    // Force this tab to become master (used when user explicitly wants this tab active)
    forceMaster() {
      localStorage.setItem(LS_TAB_MASTER, this.tabId);
      localStorage.setItem(LS_TAB_HEARTBEAT, Date.now().toString());
      this.isMasterTab = true;
      this.startHeartbeat();
      console.log(`[TMN] Tab ${this.tabId.substr(0, 12)}... forced to become master`);
    }

    hasActiveMaster() {
      const currentMaster = localStorage.getItem(LS_TAB_MASTER);
      const lastHeartbeat = parseInt(localStorage.getItem(LS_TAB_HEARTBEAT) || "0", 10);
      const now = Date.now();

      return currentMaster &&
        currentMaster !== this.tabId &&
        (now - lastHeartbeat) <= this.MASTER_TIMEOUT;
    }

    getMasterTabId() {
      return localStorage.getItem(LS_TAB_MASTER);
    }
  }

  // Create tab manager instance
  const tabManager = new TabManager();

  // ---------------------------
  // Auto-Resume Script Check Configuration
  // ---------------------------
  const autoResumeConfig = {
    enabled: GM_getValue('autoResumeEnabled', true),
    lastScriptCheckTime: 0
  };

  function saveAutoResumeConfig() {
    GM_setValue('autoResumeEnabled', autoResumeConfig.enabled);
  }

  // ---------------------------
  // Stats Collection Configuration
  // ---------------------------
  const statsCollectionConfig = {
    enabled: GM_getValue('statsCollectionEnabled', true),
    interval: GM_getValue('statsCollectionInterval', 60), // 1 minutes default
    lastCollection: GM_getValue('lastStatsCollection', 0),
    cachedStats: GM_getValue('cachedGameStats', null)
  };

  function saveStatsCollectionConfig() {
    GM_setValue('statsCollectionEnabled', statsCollectionConfig.enabled);
    GM_setValue('statsCollectionInterval', statsCollectionConfig.interval);
    GM_setValue('lastStatsCollection', statsCollectionConfig.lastCollection);
    GM_setValue('cachedGameStats', statsCollectionConfig.cachedStats);
  }

  // ---------------------------
  // Enhanced Reset Function - Clears ALL stored values
  // ---------------------------
  function resetStorage() {
    if (confirm('Are you sure you want to reset ALL settings and timers? This cannot be undone.')) {
      // Comprehensive list of ALL possible stored values
      const allKeys = [
        // State values
        'autoCrime', 'autoGTA', 'autoJail', 'autoBooze', 'lastCrime', 'lastGTA', 'lastJail', 'lastBooze',
        'selectedCrimes', 'selectedGTAs', 'playerName', 'inJail', 'crimeCollapsed', 'gtaCollapsed',
        'boozeCollapsed', 'panelMinimized', 'lastJailCheck', 'currentAction', 'needsRefresh', 'pendingAction',
        'autoOC', 'autoDTM',

        // Config values
        'crimeInterval', 'gtaInterval', 'jailbreakInterval', 'jailCheckInterval', 'boozeInterval',
        'boozeBuyAmount', 'boozeSellAmount',

        // Action tracking
        'actionStartTime',



        // Auto-Resume Config
        'autoResumeEnabled',

        // Stats Collection Config
        'statsCollectionEnabled', 'statsCollectionInterval', 'lastStatsCollection', 'cachedGameStats',

        // Health threshold config
        'minHealthThreshold', 'targetHealth',

        // Cached display values
      ];

      // Clear localStorage tab manager keys
      localStorage.removeItem('tmnMasterTab');
      localStorage.removeItem('tmnTabHeartbeat');
      localStorage.removeItem('tmnScriptCheckActive');

      // Clear OC/DTM timer keys
      localStorage.removeItem('tmnDTMTimerStatus');
      localStorage.removeItem('tmnOCTimerStatus');

      // Clear each value individually
      allKeys.forEach(key => GM_setValue(key, undefined));

      // Also try to clear any unexpected values by getting all known values and resetting them
      try {
        const knownValues = GM_getValue('knownValues', []);
        knownValues.forEach(key => GM_setValue(key, undefined));
        GM_setValue('knownValues', []);
      } catch (e) {
        console.log('No additional values to clear');
      }

      alert('ALL settings and data have been reset! Refreshing the page...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  // Crime and GTA definitions
  const crimeOptions = [
    { id: 1, name: "Credit card fraud", element: "ctl00_main_btnCrime1" },
    { id: 2, name: "Rob gas station", element: "ctl00_main_btnCrime2" },
    { id: 3, name: "Sell illegal weapons", element: "ctl00_main_btnCrime3" },
    { id: 4, name: "Rob a store", element: "ctl00_main_btnCrime4" },
    { id: 5, name: "Rob a bank", element: "ctl00_main_btnCrime5" }
  ];

  const gtaOptions = [
    { id: 1, name: "Public parking lot", value: "1" },
    { id: 2, name: "Building parking lot", value: "2" },
    { id: 3, name: "Residential place", value: "3" },
    { id: 4, name: "Pick Pocket Keys", value: "4" },
    { id: 5, name: "Car jack from street", value: "5" }
  ];

  // ---------------------------
  // ---------------------------
  // Status Bar Parser (shared utility)
  // ---------------------------
  function parseStatusBar() {
    const stats = {
      city: '', rank: '', rankPercent: 0, network: '', money: 0,
      health: 0, fmj: 0, jhp: 0, credits: 0, updateTime: '', timestamp: Date.now()
    };
    try {
      const cityEl = document.getElementById('ctl00_userInfo_lblcity');
      if (cityEl) stats.city = cityEl.textContent.trim();
      const rankEl = document.getElementById('ctl00_userInfo_lblrank');
      if (rankEl) stats.rank = rankEl.textContent.trim();
      const rankPercEl = document.getElementById('ctl00_userInfo_lblRankbarPerc');
      if (rankPercEl) {
        const percText = rankPercEl.textContent.trim();
        const match = percText.match(/\(([\d]+)[.,]?(\d+)?%\)/);
        if (match) {
          stats.rankPercent = parseFloat(match[1] + '.' + (match[2] || '00'));
        } else {
          const fb = percText.match(/([\d]+[.,][\d]+)%/);
          if (fb) stats.rankPercent = parseFloat(fb[1].replace(',', '.'));
        }
      }
      const moneyEl = document.getElementById('ctl00_userInfo_lblcash');
      if (moneyEl) stats.money = parseInt(moneyEl.textContent.trim().replace(/[$,]/g, '')) || 0;
      const healthEl = document.getElementById('ctl00_userInfo_lblhealth');
      if (healthEl) stats.health = parseInt(healthEl.textContent.trim().replace('%', '')) || 0;
      const networkEl = document.getElementById('ctl00_userInfo_lblnetwork');
      if (networkEl) stats.network = networkEl.textContent.trim();
      const fmjEl = document.getElementById('ctl00_userInfo_lblfmj');
      if (fmjEl) stats.fmj = parseInt(fmjEl.textContent.trim()) || 0;
      const jhpEl = document.getElementById('ctl00_userInfo_lbljhp');
      if (jhpEl) stats.jhp = parseInt(jhpEl.textContent.trim()) || 0;
      const creditsEl = document.getElementById('ctl00_userInfo_lblcredits');
      if (creditsEl) stats.credits = parseInt(creditsEl.textContent.trim()) || 0;
      const updateTimeEl = document.getElementById('ctl00_userInfo_lblUpdateTime');
      if (updateTimeEl) stats.updateTime = updateTimeEl.textContent.trim();
    } catch (e) {
      console.warn('Error parsing status bar:', e);
      return null;
    }
    return stats;
  }

  // ---------------------------
  // Helper Functions
  // ---------------------------
  let shadowRoot = null;

  function updateStatus(msg) {
    if (shadowRoot) {
      const el = shadowRoot.querySelector("#tmn-status");
      const jailIcon = state.inJail ? "🔒" : "✅";

      const pendingInfo = state.pendingAction ? `<br>Pending: ${state.pendingAction}` : '';
      const fullStatus = `Status: ${escapeHtml(msg)}<br>Player: ${escapeHtml(state.playerName)}<br>Jail: ${jailIcon}${pendingInfo}<br>Last Crime: ${formatTime(state.lastCrime)}<br>Last GTA: ${formatTime(state.lastGTA)}<br>Last Booze: ${formatTime(state.lastBooze)}`;

      if (el) el.innerHTML = fullStatus;
    }
    console.log('[TMN Auto]', msg);
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

// ---------------------------
  // Telegram Functions (COMPLETE)
  // ---------------------------

  function sendTelegramMessage(message) {
    console.log('[Telegram] Attempting to send message...');

    if (!telegramConfig.enabled) {
      console.log('[Telegram] Notifications are disabled in settings');
      return;
    }

    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      console.error('[Telegram] Bot Token or Chat ID is missing!');
      return;
    }

    const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        chat_id: telegramConfig.chatId,
        text: message,
        parse_mode: 'HTML'
      }),
      onload: function(response) {
        if (response.status === 200) {
          console.log('[Telegram] âœ“ Message sent successfully!');
        } else {
          console.error('[Telegram] âœ— Failed to send message:', response.status);
          console.error('[Telegram] Response:', response.responseText);
        }
      },
      onerror: function(error) {
        console.error('[Telegram] âœ— Network error:', error);
      }
    });
  }

  function testTelegramConnection() {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      alert('Please configure both Bot Token and Chat ID first!');
      return;
    }

    sendTelegramMessage('🎮 <b>TMN 2010 Automation</b>\n\nTelegram notifications are working!\n\nYou will receive alerts for:\n• Script checks (captcha)\n• New messages\n• SQL script checks\n• Logout/timeout\n• Low health alerts');
    alert('Test message sent! Check console (F12) and your Telegram.');
  }

  // Health alert tracking
  let lastHealthAlertTime = 0;
  const HEALTH_ALERT_INTERVAL = 10000; // 10 seconds between alerts

  function checkForLowHealth() {
    if (!telegramConfig.enabled) return false;

    const health = getHealthPercent();
    const now = Date.now();

    // Check if health is below threshold
    if (health < config.minHealthThreshold) {
      // Only send alert every 10 seconds
      if (now - lastHealthAlertTime >= HEALTH_ALERT_INTERVAL) {
        lastHealthAlertTime = now;

        console.log(`[Telegram] Low health detected: ${health}%`);

        // Send alert IMMEDIATELY (never delay)
        sendTelegramMessage(
          '🏥 <b>LOW HEALTH ALERT!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Current Health: <b>${health}%</b>\n` +
          `Threshold: ${config.minHealthThreshold}%\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          (state.autoHealth ?
            '💊 Auto-buy is ON - attempting to restore health' :
            '⚠️ Auto-buy is OFF - scripts may stop!')
        );

        // Then try to fetch and send mail content as a follow-up (fire and forget)
        setTimeout(() => {
          fetchLatestMailContent().then(mailText => {
            if (mailText) {
              sendTelegramMessage(
                `📬 <b>Latest Mail:</b>\n<pre>${escapeHtml(mailText.substring(0, 500))}</pre>`
              );
            }
          }).catch(() => {}); // Silently fail
        }, 5000);

        console.log('[Telegram] Low health alert sent');
        return true;
      }
    } else {
      // Reset alert timer when health is OK
      lastHealthAlertTime = 0;
    }

    return false;
  }

  let captchaNotificationSent = false;

  function checkForCaptcha() {
    if (!telegramConfig.enabled || !telegramConfig.notifyCaptcha) {
      return false;
    }

    if (isOnCaptchaPage()) {
      if (!captchaNotificationSent) {
        console.log('[Telegram] Captcha detected! Sending notification...');

        sendTelegramMessage(
          '⚠️ <b>Script Check Required!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          '🛑 All automation is PAUSED\n' +
          '👉 Please complete the captcha to resume'
        );

        captchaNotificationSent = true;
        console.log('[Telegram] Captcha notification sent');
      }
      return true;
    } else {
      captchaNotificationSent = false;
    }

    return false;
  }

  let lastMessageCount = 0;

  function checkForNewMessages() {
    if (!telegramConfig.enabled || !telegramConfig.notifyMessages) {
      return false;
    }

    const now = Date.now();

    let hasNewMessage = false;
    let messageCount = 0;

    // Method 1: Check the message span element (MOST RELIABLE)
    const msgSpan = document.querySelector('span[id*="imgMessages"]');
    if (msgSpan) {
      const titleAttr = msgSpan.getAttribute('title');
      const classAttr = msgSpan.getAttribute('class');

      // Get count from title attribute
      if (titleAttr && titleAttr !== '0') {
        messageCount = parseInt(titleAttr) || 0;
        if (messageCount > 0) {
          hasNewMessage = true;
          console.log('[Telegram] Detected messages from span title:', messageCount);
        }
      }

      // Also check class for message indicator (message1, message2, etc.)
      if (!hasNewMessage && classAttr) {
        const classMatch = classAttr.match(/message(\d+)/);
        if (classMatch) {
          messageCount = parseInt(classMatch[1]) || 1;
          hasNewMessage = true;
          console.log('[Telegram] Detected messages from span class:', messageCount);
        }
      }
    }

    // Method 2: Check page title for "X new mails"
    if (!hasNewMessage) {
      const pageTitle = document.title;
      const titleMatch = pageTitle.match(/(\d+)\s+new\s+mails?/i);
      if (titleMatch) {
        hasNewMessage = true;
        messageCount = parseInt(titleMatch[1]);
        console.log('[Telegram] Detected messages from page title:', messageCount);
      }
    }

    // Method 3: Check for the new_message_1.gif image
    if (!hasNewMessage) {
      const newMessageImg = document.querySelector('img[src*="new_message_1.gif"]');
      if (newMessageImg) {
        hasNewMessage = true;
        messageCount = 1;
        console.log('[Telegram] Detected new message icon');
      }
    }

    // Only send notification if message count INCREASED (new messages arrived)
    if (hasNewMessage && messageCount > lastMessageCount) {
      // Check cooldown only after confirming new messages
      if (now - telegramConfig.lastMessageCheck < telegramConfig.messageCheckInterval * 1000) {
        console.log('[Telegram] New messages detected but on cooldown');
        return false;
      }

      const newMessageCount = messageCount - lastMessageCount;
      console.log('[Telegram] NEW messages arrived! Previous:', lastMessageCount, 'Current:', messageCount, 'New:', newMessageCount);

      telegramConfig.lastMessageCheck = now;
      saveTelegramConfig();
      lastMessageCount = messageCount;

      const messageText = newMessageCount > 1
        ? `You have ${newMessageCount} new messages!`
        : 'You have a new message!';

      // Send notification IMMEDIATELY (never delay the alert)
      sendTelegramMessage(
        '📬 <b>New Message Alert!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n` +
        messageText + '\n' +
        `Total unread: ${messageCount}\n\n` +
        '🔗 Check your mailbox at TMN2010'
      );

      // Then try to fetch and send mail content as a follow-up (fire and forget)
      setTimeout(() => {
        fetchLatestMailContent().then(mailText => {
          if (mailText) {
            sendTelegramMessage(
              `📝 <b>Mail Content:</b>\n<pre>${escapeHtml(mailText.substring(0, 500))}</pre>`
            );
          }
        }).catch(() => {}); // Silently fail - the main alert already went through
      }, 5000);

      console.log('[Telegram] New message notification sent');
      return true;
    } else if (hasNewMessage) {
      // Update count but don't send notification (messages already seen)
      lastMessageCount = messageCount;
    } else {
      // No messages - reset counter
      lastMessageCount = 0;
    }

    return false;
  }

  let sqlCheckNotificationSent = false;

  function checkForSqlScriptCheck() {
    if (!telegramConfig.enabled || !telegramConfig.notifySqlCheck) {
      return false;
    }

    // Method 1: Check for "Important message" div
    const importantMsgDiv = document.querySelector('div.NewGridTitle');
    const hasImportantMessage = importantMsgDiv && importantMsgDiv.textContent.includes('Important message');

    // Method 2: Check page content for SQL script check indicators
    const pageText = document.body.textContent;
    const hasSqlCheck = pageText.includes('SQL Script Check') ||
                        pageText.includes('SQL what your favourite') ||
                        pageText.includes('tell SQL what');

    if ((hasImportantMessage || hasSqlCheck) && !sqlCheckNotificationSent) {
      console.log('[Telegram] SQL Script Check detected! Sending notification...');

      // Try to extract the question
      let question = 'Please answer the admin question';
      const paragraphs = document.querySelectorAll('p, div');
      for (let p of paragraphs) {
        const text = p.textContent;
        if (text.includes('SQL') && text.includes('?')) {
          question = text.trim();
          break;
        }
      }

      sendTelegramMessage(

        '❗ <b>SQL SCRIPT CHECK!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        '🛑 Admin SQL needs a response!\n' +
        `Question: ${question}\n\n` +
        '👉 Please answer the question to continue'
      );

      sqlCheckNotificationSent = true;
      console.log('[Telegram] SQL script check notification sent');
      return true;
    } else if (!hasImportantMessage && !hasSqlCheck) {
      // Reset flag when no longer on SQL check page
      sqlCheckNotificationSent = false;
    }

    return false;
  }

let logoutNotificationSent = false;

  function checkForLogout() {
    if (!telegramConfig.enabled || !telegramConfig.notifyLogout) {
      return false;
    }

    const currentUrl = window.location.href.toLowerCase();

    // ONLY trigger on actual login page, not authenticated pages
    const isLoginPage = currentUrl.includes('login.aspx');

    // Must be on login.aspx to proceed
    if (!isLoginPage) {
      // Reset flag when on authenticated pages
      if (currentUrl.includes('/authenticated/')) {
        logoutNotificationSent = false;
        // Stop tab flash if we've logged back in
        stopFlashTabTitle();
      }
      return false;
    }

    // Now we're definitely on login.aspx - check if it's auto logout
    const isAutoLogout = currentUrl.includes('act=out') || currentUrl.includes('auto=true');

    // Double-check with login form elements
    const hasLoginForm = document.querySelector('input[name="ctl00$main$txtUsername"]') !== null ||
                         document.querySelector('input[type="password"]') !== null ||
                         document.querySelector('input[value="Login"]') !== null;

    if (hasLoginForm && !logoutNotificationSent) {
      console.log('[Telegram] ACTUAL Logout/Login page detected! Sending notification...');
      console.log('[Telegram] URL:', currentUrl);
      console.log('[Telegram] Is auto logout:', isAutoLogout);

      const logoutType = isAutoLogout ? 'AUTO LOGOUT' : 'LOGOUT';
      const reason = isAutoLogout ?
        'You have been automatically logged out (session timeout)' :
        'You have been logged out';

      sendTelegramMessage(
        `🚪 <b>${logoutType} DETECTED!</b>\n\n` +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        reason + '\n\n' +
        '🔑 Please log back in to resume automation'
      );

      // Trigger tab flash and browser notifications
      triggerLogoutAlerts();

      logoutNotificationSent = true;
      console.log('[Telegram] Logout notification sent');
      return true;
    }

    return false;
  }

  // END OF TELEGRAM FUNCTIONS

  // ---------------------------
  // Auto-Resume Script Check Functions
  // ---------------------------
  let scriptCheckMonitorActive = false;
  let scriptCheckSubmitAttempted = false;

  function startScriptCheckMonitor() {
    if (!autoResumeConfig.enabled || scriptCheckMonitorActive) return;

    scriptCheckMonitorActive = true;
    scriptCheckSubmitAttempted = false;
    console.log('[TMN] Starting script check monitor for auto-resume...');

    const monitor = setInterval(() => {
      // Check if we're still on script check page
      if (!isOnCaptchaPage()) {
        console.log('[TMN] Script check page cleared - resuming automation');
        clearInterval(monitor);
        scriptCheckMonitorActive = false;
        localStorage.removeItem(LS_SCRIPT_CHECK_ACTIVE);

        // Resume automation
        automationPaused = false;
        updateStatus('Script check completed - automation resumed');
        return;
      }

      // Check if captcha is completed
      const captchaResponse = document.querySelector('textarea[name="g-recaptcha-response"]');
      const token = captchaResponse?.value?.trim();

      if (token && token.length > 0 && !scriptCheckSubmitAttempted) {
        console.log('[TMN] Captcha completed - auto-submitting...');
        scriptCheckSubmitAttempted = true;

        // Find and click submit button
        const submitBtn = document.querySelector('#ctl00_main_MyScriptTest_btnSubmit') ||
                          document.querySelector('#ctl00_main_btnVerify') ||
                          document.querySelector('input[type="submit"], button[type="submit"]') ||
                          Array.from(document.querySelectorAll('input, button')).find(b =>
                            b.value?.toLowerCase().includes('verify') ||
                            b.value?.toLowerCase().includes('submit') ||
                            b.textContent?.toLowerCase().includes('verify') ||
                            b.textContent?.toLowerCase().includes('submit')
                          );

        if (submitBtn && !submitBtn.disabled) {
          setTimeout(() => {
            submitBtn.click();
            console.log('[TMN] Script check form auto-submitted');
          }, 3000 + Math.random() * 2000);
        }
      }
    }, 1500);

    // Timeout after 10 minutes
    setTimeout(() => {
      if (scriptCheckMonitorActive) {
        console.log('[TMN] Script check monitor timeout');
        clearInterval(monitor);
        scriptCheckMonitorActive = false;
      }
    }, 600000);
  }

  // ---------------------------
  // Stats Collection Functions
  // ---------------------------
  const STATS_URL = '/authenticated/statistics.aspx?p=p';

  function shouldCollectStats() {
    if (!statsCollectionConfig.enabled) return false;
    if (state.inJail || state.isPerformingAction || automationPaused) return false;

    const now = Date.now();
    const timeSinceLastCollection = now - statsCollectionConfig.lastCollection;
    return timeSinceLastCollection >= statsCollectionConfig.interval * 1000;
  }

  function parseStatisticsPage() {
    const stats = {
      timestamp: Date.now(),
      crimes: {},
      gta: {},
      booze: {},
      general: {}
    };

    try {
      // Parse crimes statistics
      const crimeTable = document.querySelector('#ctl00_main_gvCrimes');
      if (crimeTable) {
        const rows = crimeTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
          if (index === 0) return; // Skip header
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const crimeName = cells[0]?.textContent?.trim();
            const attempts = parseInt(cells[1]?.textContent?.trim()) || 0;
            const success = parseInt(cells[2]?.textContent?.trim()) || 0;
            if (crimeName) {
              stats.crimes[crimeName] = { attempts, success };
            }
          }
        });
      }

      // Parse GTA statistics
      const gtaTable = document.querySelector('#ctl00_main_gvGTA');
      if (gtaTable) {
        const rows = gtaTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
          if (index === 0) return; // Skip header
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const gtaType = cells[0]?.textContent?.trim();
            const attempts = parseInt(cells[1]?.textContent?.trim()) || 0;
            const success = parseInt(cells[2]?.textContent?.trim()) || 0;
            if (gtaType) {
              stats.gta[gtaType] = { attempts, success };
            }
          }
        });
      }

      // Get general stats from status bar
      const currentStats = parseStatusBar();
      if (currentStats) {
        stats.general = {
          rank: currentStats.rank,
          rankPercent: currentStats.rankPercent,
          money: currentStats.money,
          health: currentStats.health,
          city: currentStats.city,
          fmj: currentStats.fmj,
          jhp: currentStats.jhp,
          credits: currentStats.credits
        };
      }

      console.log('[TMN] Statistics parsed:', stats);
      return stats;
    } catch (e) {
      console.error('[TMN] Error parsing statistics page:', e);
      return null;
    }
  }

  async function collectStatistics() {
    if (!shouldCollectStats()) return false;

    const currentPage = getCurrentPage();

    // If we're on the stats page, parse and save
    if (window.location.pathname.toLowerCase().includes('statistics.aspx') &&
        window.location.search.toLowerCase().includes('p=p')) {
      const stats = parseStatisticsPage();
      if (stats) {
        statsCollectionConfig.cachedStats = stats;
        statsCollectionConfig.lastCollection = Date.now();
        saveStatsCollectionConfig();
        updateStatus('Statistics collected successfully');
        console.log('[TMN] Statistics cached');
        return true;
      }
    }

    return false;
  }

  function getCachedStats() {
    return statsCollectionConfig.cachedStats;
  }

  // ---------------------------
  // DTM & OC Timer System
  // ---------------------------
  const DTM_URL = '/authenticated/organizedcrime.aspx?p=dtm';
  const OC_URL = '/authenticated/organizedcrime.aspx';

  // Fetch DTM timer data from DTM page
  async function fetchDTMTimerData() {
    try {
      const fullURL = `${window.location.origin}${DTM_URL}&_=${Date.now()}`;
      console.log('[TMN] Fetching DTM timer data...');

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for DTM cooldown message
      const msgElement = doc.querySelector('#ctl00_lblMsg');
      if (msgElement) {
        const msgText = msgElement.textContent || "";
        const cooldownMatch = msgText.match(/You cannot do a DTM at this moment, you have to wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);

        if (cooldownMatch) {
          const hours = parseInt(cooldownMatch[1], 10) || 0;
          const minutes = parseInt(cooldownMatch[2], 10) || 0;
          const seconds = parseInt(cooldownMatch[3], 10) || 0;
          const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

          return {
            canDTM: false,
            hours, minutes, seconds, totalSeconds,
            message: msgText.trim(),
            lastUpdate: Date.now()
          };
        }
      }

      // Check if DTM is available
      const dtmStartDiv = doc.querySelector('.NewGridTitle');
      if (dtmStartDiv && dtmStartDiv.textContent.includes('Start a Drugs Transportation Mission')) {
        return {
          canDTM: true,
          hours: 0, minutes: 0, seconds: 0, totalSeconds: 0,
          message: "Available",
          lastUpdate: Date.now()
        };
      }

      return null;
    } catch (err) {
      console.error('[TMN] Error fetching DTM timer:', err);
      return null;
    }
  }

  // Fetch OC timer data from OC page
  async function fetchOCTimerData() {
    try {
      const fullURL = `${window.location.origin}${OC_URL}?_=${Date.now()}`;
      console.log('[TMN] Fetching OC timer data...');

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Check for OC cooldown message
      const msgElement = doc.querySelector('#ctl00_lblMsg');
      if (msgElement) {
        const msgText = msgElement.textContent || "";
        const cooldownMatch = msgText.match(/You cannot do an Organized Crime at this moment, you have to wait (\d+) hours? (\d+) minutes? and (\d+) seconds?/i);

        if (cooldownMatch) {
          const hours = parseInt(cooldownMatch[1], 10) || 0;
          const minutes = parseInt(cooldownMatch[2], 10) || 0;
          const seconds = parseInt(cooldownMatch[3], 10) || 0;
          const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

          return {
            canOC: false,
            hours, minutes, seconds, totalSeconds,
            message: msgText.trim(),
            lastUpdate: Date.now()
          };
        }
      }

      // Check if OC is available
      const ocStartDiv = doc.querySelector('.NewGridTitle');
      if (ocStartDiv && ocStartDiv.textContent.includes('Start an Organized Crime')) {
        return {
          canOC: true,
          hours: 0, minutes: 0, seconds: 0, totalSeconds: 0,
          message: "Available",
          lastUpdate: Date.now()
        };
      }

      return null;
    } catch (err) {
      console.error('[TMN] Error fetching OC timer:', err);
      return null;
    }
  }

  // Store timer data with expiry calculation
  function storeDTMTimerData(timerData) {
    if (!timerData) return;
    const dtmTimerStatus = {
      ...timerData,
      fetchTime: Date.now(),
      expiresAt: Date.now() + (timerData.totalSeconds * 1000)
    };
    localStorage.setItem('tmnDTMTimerStatus', JSON.stringify(dtmTimerStatus));
  }

  function storeOCTimerData(timerData) {
    if (!timerData) return;
    const ocTimerStatus = {
      ...timerData,
      fetchTime: Date.now(),
      expiresAt: Date.now() + (timerData.totalSeconds * 1000)
    };
    localStorage.setItem('tmnOCTimerStatus', JSON.stringify(ocTimerStatus));
  }

  // Get current timer status with real-time countdown
  function getDTMTimerStatus() {
    const stored = localStorage.getItem('tmnDTMTimerStatus');
    if (!stored) return null;

    try {
      const timerData = JSON.parse(stored);
      const now = Date.now();
      const remainingMs = Math.max(0, timerData.expiresAt - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      if (remainingSeconds <= 0) {
        return { canDTM: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, message: "Available" };
      }

      return {
        canDTM: false,
        hours: Math.floor(remainingSeconds / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60,
        totalSeconds: remainingSeconds
      };
    } catch (e) {
      return null;
    }
  }

  function getOCTimerStatus() {
    const stored = localStorage.getItem('tmnOCTimerStatus');
    if (!stored) return null;

    try {
      const timerData = JSON.parse(stored);
      const now = Date.now();
      const remainingMs = Math.max(0, timerData.expiresAt - now);
      const remainingSeconds = Math.floor(remainingMs / 1000);

      if (remainingSeconds <= 0) {
        return { canOC: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, message: "Available" };
      }

      return {
        canOC: false,
        hours: Math.floor(remainingSeconds / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60,
        totalSeconds: remainingSeconds
      };
    } catch (e) {
      return null;
    }
  }

  // Format timer display with color indicator
  function formatTimerDisplay(timerStatus, readyKey) {
    if (!timerStatus) return { text: "Unknown", color: "gray", ready: false };

    const isReady = timerStatus[readyKey];
    if (isReady || timerStatus.totalSeconds <= 0) {
      return { text: "Available", color: "green", ready: true };
    }

    const { hours, minutes } = timerStatus;
    let text;
    if (hours > 0) {
      text = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } else if (minutes > 0) {
      text = `${minutes}m`;
    } else {
      text = "< 1m";
    }

    return { text, color: "red", ready: false };
  }

  // Collect both timers
  async function collectOCDTMTimers() {
    if (state.inJail || automationPaused) return;

    try {
      const [dtmData, ocData] = await Promise.all([
        fetchDTMTimerData(),
        fetchOCTimerData()
      ]);

      if (dtmData) storeDTMTimerData(dtmData);
      if (ocData) storeOCTimerData(ocData);

      console.log('[TMN] OC/DTM timers collected');
      updateTimerDisplay();
    } catch (e) {
      console.error('[TMN] Error collecting OC/DTM timers:', e);
    }
  }

  // Timer refresh interval (every 60 seconds for fetching, every 5 seconds for display)
  let timerDisplayInterval = null;
  let timerFetchInterval = null;

  // Cached display values to prevent flickering - only update DOM when values change
  // These persist the last known values so we don't show "..." on every page load
  const cachedDisplayValues = {
    dtm: GM_getValue('cachedDtmDisplay', ''),
    oc: GM_getValue('cachedOcDisplay', ''),
    travel: GM_getValue('cachedTravelDisplay', ''),
    health: GM_getValue('cachedHealthDisplay', ''),
    protection: GM_getValue('cachedProtectionDisplay', '')
  };

  // Cache element references to avoid repeated DOM queries
  let timerElements = {
    dtm: null,
    oc: null,
    travel: null,
    health: null,
    protection: null
  };

  // Update timer display in UI - only updates DOM if value changed (prevents flicker)
  function updateTimerDisplay() {
    if (!shadowRoot) return;

    // Cache element references on first call
    if (!timerElements.dtm) {
      timerElements.dtm = shadowRoot.querySelector('#tmn-dtm-timer');
      timerElements.oc = shadowRoot.querySelector('#tmn-oc-timer');
      timerElements.travel = shadowRoot.querySelector('#tmn-travel-timer');
      timerElements.health = shadowRoot.querySelector('#tmn-health-monitor');
    }

    const dtmStatus = getDTMTimerStatus();
    const ocStatus = getOCTimerStatus();
    const travelStatus = getTravelTimerStatus();

    const dtmDisplay = formatTimerDisplay(dtmStatus, 'canDTM');
    const ocDisplay = formatTimerDisplay(ocStatus, 'canOC');
    const travelDisplay = formatTravelTimerDisplay(travelStatus);

    // Only update DOM if value changed to prevent flicker
    const newDtmHtml = `<span style="color:${dtmDisplay.color === 'green' ? '#10b981' : dtmDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${dtmDisplay.text}`;
    if (timerElements.dtm && cachedDisplayValues.dtm !== newDtmHtml) {
      cachedDisplayValues.dtm = newDtmHtml;
      GM_setValue('cachedDtmDisplay', newDtmHtml);
      timerElements.dtm.innerHTML = newDtmHtml;
    }

    const newOcHtml = `<span style="color:${ocDisplay.color === 'green' ? '#10b981' : ocDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${ocDisplay.text}`;
    if (timerElements.oc && cachedDisplayValues.oc !== newOcHtml) {
      cachedDisplayValues.oc = newOcHtml;
      GM_setValue('cachedOcDisplay', newOcHtml);
      timerElements.oc.innerHTML = newOcHtml;
    }

    const travelColor = travelDisplay.color === 'green' ? '#10b981' : travelDisplay.color === 'amber' ? '#f59e0b' : travelDisplay.color === 'red' ? '#ef4444' : '#9ca3af';
    const newTravelHtml = `<span style="color:${travelColor};">●</span> ${travelDisplay.text}`;
    if (timerElements.travel && cachedDisplayValues.travel !== newTravelHtml) {
      cachedDisplayValues.travel = newTravelHtml;
      GM_setValue('cachedTravelDisplay', newTravelHtml);
      timerElements.travel.innerHTML = newTravelHtml;
    }

    // Also update health display
    updateHealthDisplay();

    // Update protection countdown
    updateProtectionDisplay();

    // Check if OC/DTM just became ready and send Telegram alert
    try { checkOCDTMReadyAlerts(); } catch (e) {}
  }

  function getHealthColor(healthPercent) {
    if (healthPercent >= 100) return '#10b981';
    if (healthPercent > 60) return '#f59e0b';
    return '#ef4444';
  }

  function updateHealthDisplay() {
    if (!shadowRoot) return;
    if (!timerElements.health) {
      timerElements.health = shadowRoot.querySelector('#tmn-health-monitor');
    }
    const currentStats = parseStatusBar();
    if (timerElements.health && currentStats) {
      const health = currentStats.health || 0;
      const color = getHealthColor(health);
      const newHealthHtml = `<span style="color:${color};">●</span> ${health}%`;
      if (cachedDisplayValues.health !== newHealthHtml) {
        cachedDisplayValues.health = newHealthHtml;
        GM_setValue('cachedHealthDisplay', newHealthHtml);
        timerElements.health.innerHTML = newHealthHtml;
      }
    }
  }

  function startTimerUpdates() {
    // Immediately restore cached values to prevent flash of "..."
    if (shadowRoot) {
      const dtmEl = shadowRoot.querySelector('#tmn-dtm-timer');
      const ocEl = shadowRoot.querySelector('#tmn-oc-timer');
      const travelEl = shadowRoot.querySelector('#tmn-travel-timer');
      const healthEl = shadowRoot.querySelector('#tmn-health-monitor');

      if (dtmEl && cachedDisplayValues.dtm) dtmEl.innerHTML = cachedDisplayValues.dtm;
      if (ocEl && cachedDisplayValues.oc) ocEl.innerHTML = cachedDisplayValues.oc;
      if (travelEl && cachedDisplayValues.travel) travelEl.innerHTML = cachedDisplayValues.travel;
      if (healthEl && cachedDisplayValues.health) healthEl.innerHTML = cachedDisplayValues.health;
      const protEl = shadowRoot.querySelector('#tmn-protection-timer');
      if (protEl && cachedDisplayValues.protection) protEl.innerHTML = cachedDisplayValues.protection;
    }

    // Update display every 5 seconds
    if (!timerDisplayInterval) {
      timerDisplayInterval = setInterval(updateTimerDisplay, 5000);
    }

    // Fetch new data every 60 seconds
    if (!timerFetchInterval) {
      timerFetchInterval = setInterval(() => {
        if (!state.inJail && !automationPaused && !state.isPerformingAction) {
          collectOCDTMTimers();
          fetchTravelTimerData();
        }
      }, 60000);
    }

    // Initial fetch after a short delay
    setTimeout(collectOCDTMTimers, 3000);
    setTimeout(fetchTravelTimerData, 4000);
    setTimeout(fetchProtectionStatus, 5000);

    // Refresh protection status every 5 minutes (doesn't change often)
    setInterval(fetchProtectionStatus, 300000);
  }

  // ---------------------------
  // Travel Timer System (display only — no auto-travel)
  // ---------------------------
  const TRAVEL_URL = '/authenticated/travel.aspx';

  async function fetchTravelTimerData() {
    try {
      const fullURL = `${window.location.origin}${TRAVEL_URL}?_=${Date.now()}`;
      const response = await fetch(fullURL, {
        method: 'GET', headers: { 'Cache-Control': 'no-cache' }, credentials: 'same-origin'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const allText = doc.body.textContent || "";
      const lowerText = allText.toLowerCase();

      // Debug: log first 300 chars of travel page for troubleshooting
      console.log('[TMN][TRAVEL] Page text:', allText.substring(0, 300).replace(/\s+/g, ' '));

      // Pattern 1: "X hours Y minutes Z seconds before you can travel"
      let cooldownMatch = allText.match(/(\d+)\s*hours?\s*(\d+)\s*minutes?\s*(?:and\s*)?(\d+)?\s*seconds?\s*before you can travel/i);

      // Pattern 2: "You must wait X minutes" or "wait X minutes and Y seconds"
      if (!cooldownMatch) {
        const waitMatch = allText.match(/(?:must|have to)\s*wait\s*(?:(\d+)\s*hours?)?\s*(?:(\d+)\s*minutes?)?\s*(?:(?:and\s*)?(\d+)\s*seconds?)?/i);
        if (waitMatch && (waitMatch[1] || waitMatch[2] || waitMatch[3])) {
          cooldownMatch = [null, waitMatch[1] || '0', waitMatch[2] || '0', waitMatch[3] || '0'];
        }
      }

      // Pattern 3: "X minutes and Y seconds" anywhere near "travel"
      if (!cooldownMatch) {
        const timeMatch = allText.match(/(\d+)\s*minutes?\s*(?:and\s*)?(\d+)\s*seconds?/i);
        if (timeMatch && (lowerText.includes('travel') || lowerText.includes('cooldown') || lowerText.includes('wait'))) {
          cooldownMatch = [null, '0', timeMatch[1], timeMatch[2]];
        }
      }

      if (cooldownMatch) {
        const h = parseInt(cooldownMatch[1], 10) || 0;
        const m = parseInt(cooldownMatch[2], 10) || 0;
        const s = parseInt(cooldownMatch[3], 10) || 0;
        const totalSeconds = h * 3600 + m * 60 + s;

        if (totalSeconds > 0) {
          const jetAvailable = lowerText.includes('private jet') &&
                              (lowerText.includes('now available') || lowerText.includes('jet travel is now'));
          storeTravelTimerData({ normalCooldownRemaining: totalSeconds, jetAvailable, canTravelNormal: false, lastUpdate: Date.now() });
          console.log(`[TMN][TRAVEL] Cooldown: ${h}h ${m}m ${s}s`);
          updateTimerDisplay();
          return;
        }
      }

      // Check if can actually travel (page shows destination selection)
      const canTravelNow = lowerText.includes('select a destination') ||
                          lowerText.includes('where would you like') ||
                          doc.querySelector('select[name*="city"]') !== null ||
                          doc.querySelector('input[value*="Travel"]') !== null;

      if (canTravelNow) {
        storeTravelTimerData({ normalCooldownRemaining: 0, jetAvailable: true, canTravelNormal: true, lastUpdate: Date.now() });
        console.log('[TMN][TRAVEL] Can travel now');
      } else {
        // Unknown state — don't update, keep existing timer running down
        console.log('[TMN][TRAVEL] Could not determine travel status — keeping existing timer');
      }
      updateTimerDisplay();
    } catch (err) {
      console.error('[TMN] Error fetching travel timer:', err);
    }
  }

  function storeTravelTimerData(timerData) {
    if (!timerData) return;
    localStorage.setItem('tmnTravelTimerStatus', JSON.stringify({ ...timerData, fetchTime: Date.now() }));
  }

  function getTravelTimerStatus() {
    const stored = localStorage.getItem('tmnTravelTimerStatus');
    if (!stored) return null;
    try {
      const d = JSON.parse(stored);
      const elapsed = Math.floor((Date.now() - d.fetchTime) / 1000);
      const planeCd = Math.max(0, (d.normalCooldownRemaining || 0) - elapsed);
      const jetCd = Math.max(0, planeCd - (25 * 60));
      return { canTravelNormal: planeCd <= 0, canTravelJet: jetCd <= 0, planeCooldownRemaining: planeCd, jetCooldownRemaining: jetCd };
    } catch (e) { return null; }
  }

  function formatTravelTimerDisplay(ts) {
    if (!ts) return { text: "...", color: "gray" };
    if (ts.canTravelNormal) return { text: "Plane", color: "green" };
    if (ts.canTravelJet) { const m = Math.ceil(ts.planeCooldownRemaining / 60); return { text: `Jet (${m}m)`, color: "amber" }; }
    const m = Math.ceil(ts.jetCooldownRemaining / 60);
    return { text: `${m}m`, color: "red" };
  }

  // ---------------------------
  // New Player Protection Timer
  // ---------------------------
  const LS_PROTECTION_END = 'tmnProtectionEndTs';
  const LS_PROTECTION_STATUS = 'tmnProtectionStatus'; // 'active', 'expired', 'left', 'none'

  async function fetchProtectionStatus() {
    try {
      const statsURL = `${window.location.origin}/authenticated/statistics.aspx?p=p&_=${Date.now()}`;
      console.log('[TMN][PROT] Fetching stats page:', statsURL);
      const response = await fetch(statsURL, {
        method: 'GET', headers: { 'Cache-Control': 'no-cache' }, credentials: 'same-origin'
      });
      if (!response.ok) {
        console.log('[TMN][PROT] Stats page fetch failed:', response.status);
        return;
      }
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // Debug: log all span IDs containing "Protection" or "protection"
      const allSpans = doc.querySelectorAll('span[id*="rotection"], span[id*="lblNew"]');
      console.log(`[TMN][PROT] Found ${allSpans.length} protection-related spans`);
      allSpans.forEach(s => console.log(`[TMN][PROT]   id="${s.id}" text="${s.textContent.trim().substring(0, 80)}"`));

      // Also check for the div
      const protDiv = doc.querySelector('.NewGridTitle');
      if (protDiv) console.log(`[TMN][PROT] NewGridTitle: "${protDiv.textContent.trim()}"`);

      // Check for protection end date element
      const protEl = doc.getElementById('ctl00_main_lblNewPlayerProtectionEndDate');
      if (protEl) {
        const text = protEl.textContent.trim();
        console.log(`[TMN][PROT] Protection element found: "${text}"`);

        // Preferred: parse "(HH:MM:SS remaining)" or "(Xd HH:MM:SS remaining)" directly
        // This avoids timezone issues between game server and local browser
        const remainMatch = text.match(/\((?:(\d+)d\s*)?(\d+):(\d{2}):(\d{2})\s*remaining\)/i);
        if (remainMatch) {
          const days = parseInt(remainMatch[1] || '0', 10);
          const hours = parseInt(remainMatch[2], 10);
          const mins = parseInt(remainMatch[3], 10);
          const secs = parseInt(remainMatch[4], 10);
          const remainingMs = ((days * 24 + hours) * 3600 + mins * 60 + secs) * 1000;
          const endTs = Date.now() + remainingMs;
          localStorage.setItem(LS_PROTECTION_END, String(endTs));
          localStorage.setItem(LS_PROTECTION_STATUS, 'active');
          console.log(`[TMN][PROT] Protection remaining: ${days}d ${hours}h ${mins}m ${secs}s`);
          updateProtectionDisplay();
          return;
        }

        // Fallback: parse the end date but treat it as UTC to avoid timezone drift
        const dateMatch = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (dateMatch) {
          const [, dd, mm, yyyy, HH, MM, SS] = dateMatch;
          // Use UTC to match game server time
          const endTs = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS));
          localStorage.setItem(LS_PROTECTION_END, String(endTs));
          localStorage.setItem(LS_PROTECTION_STATUS, 'active');
          console.log(`[TMN][PROT] Protection ends (UTC): ${new Date(endTs).toUTCString()}`);
          updateProtectionDisplay();
          return;
        } else {
          console.log('[TMN][PROT] Could not parse date from:', text);
        }
      } else {
        console.log('[TMN][PROT] Protection element NOT found by ID');
        // Try alternative: search page text for the date pattern near "protection"
        const pageText = doc.body.textContent || '';
        const protMatch = pageText.match(/protection.*?(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i);
        if (protMatch) {
          const [, dd, mm, yyyy, HH, MM, SS] = protMatch;
          const endTs = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS)).getTime();
          localStorage.setItem(LS_PROTECTION_END, String(endTs));
          localStorage.setItem(LS_PROTECTION_STATUS, 'active');
          console.log(`[TMN][PROT] Found via text search — ends: ${new Date(endTs).toLocaleString()}`);
          updateProtectionDisplay();
          return;
        }
      }

      // Check if protection banner exists but no timer
      const pageText = doc.body.textContent || '';
      if (/new player protection is on/i.test(pageText) || /protection.*remaining/i.test(pageText)) {
        console.log('[TMN][PROT] Protection text found but no parseable date');
        if (!localStorage.getItem(LS_PROTECTION_END)) {
          localStorage.setItem(LS_PROTECTION_STATUS, 'active');
        }
        updateProtectionDisplay();
        return;
      }

      // No protection found on stats page
      const existing = localStorage.getItem(LS_PROTECTION_STATUS);
      if (existing === 'active') {
        // Was active, now gone — either expired or left early
        const endTs = parseInt(localStorage.getItem(LS_PROTECTION_END) || '0', 10);
        if (endTs > 0 && Date.now() < endTs) {
          localStorage.setItem(LS_PROTECTION_STATUS, 'left');
          console.log('[TMN][PROT] Protection left early');
        } else {
          localStorage.setItem(LS_PROTECTION_STATUS, 'expired');
          console.log('[TMN][PROT] Protection expired');
        }
      } else if (!existing) {
        localStorage.setItem(LS_PROTECTION_STATUS, 'none');
      }
    } catch (err) {
      console.error('[TMN] Error fetching protection status:', err);
    }
  }

  function getProtectionDisplay() {
    const status = localStorage.getItem(LS_PROTECTION_STATUS);
    // Don't show anything until we've actually fetched once
    if (!status) return null;
    if (status === 'none') return { text: 'None', color: '#9ca3af' };
    if (status === 'left') return { text: 'Left Early', color: '#ef4444' };
    if (status === 'expired') return { text: 'Expired', color: '#9ca3af' };

    // Active — calculate countdown
    const endTs = parseInt(localStorage.getItem(LS_PROTECTION_END) || '0', 10);
    if (!endTs) return { text: 'Active', color: '#10b981' };

    const remaining = endTs - Date.now();
    if (remaining <= 0) {
      localStorage.setItem(LS_PROTECTION_STATUS, 'expired');
      return { text: 'Expired', color: '#9ca3af' };
    }

    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);

    let text;
    if (days > 0) {
      text = `${days}d ${hours}h ${mins}m`;
    } else if (hours > 0) {
      text = `${hours}h ${mins}m`;
    } else {
      text = `${mins}m`;
    }
    return { text, color: '#10b981' };
  }

  function updateProtectionDisplay() {
    if (!shadowRoot) return;
    if (!timerElements.protection) {
      timerElements.protection = shadowRoot.querySelector('#tmn-protection-timer');
    }
    if (!timerElements.protection) return;
    const display = getProtectionDisplay();
    // Don't update if we haven't fetched yet — keep cached or placeholder
    if (!display) return;
    const newHtml = `<span style="color:${display.color};">●</span> ${display.text}`;
    if (cachedDisplayValues.protection !== newHtml) {
      cachedDisplayValues.protection = newHtml;
      GM_setValue('cachedProtectionDisplay', newHtml);
      timerElements.protection.innerHTML = newHtml;
    }
  }

  // ============================================================
  // AUTO OC / DTM MAIL INVITE SYSTEM
  // ============================================================

  // LocalStorage keys for OC/DTM mail tracking
  const LS_LAST_OC_INVITE_MAIL_ID = "tmnLastOCInviteMailId";
  const LS_LAST_DTM_INVITE_MAIL_ID = "tmnLastDTMInviteMailId";
  const LS_LAST_OC_ACCEPT_TS = "tmnLastOCAcceptTs";
  const LS_LAST_DTM_ACCEPT_TS = "tmnLastDTMAcceptTs";
  const LS_PENDING_DTM_URL = "tmnPendingDTMAcceptURL";
  const LS_PENDING_OC_URL = "tmnPendingOCAcceptURL";

  // Single unified watcher - no more separate OC/DTM/background watchers racing
  const MAIL_CHECK_INTERVAL_MS = 120000; // Check every 2 minutes

  // --- GM_xmlhttpRequest GET helper (returns html + finalUrl for redirect detection) ---
  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (res) => {
          const finalUrl = res.finalUrl || url;
          if (res.status >= 200 && res.status < 300) {
            resolve({ html: res.responseText, finalUrl, status: res.status });
          } else {
            reject(new Error(`HTTP ${res.status} for ${finalUrl}`));
          }
        },
        onerror: (err) => reject(err),
      });
    });
  }

  // --- Normalize mailbox link to authenticated URL ---
  function toAuthenticatedMailboxURL(href) {
    const h = (href || "").trim();
    if (/^https?:\/\//i.test(h)) return h;
    if (/^\/authenticated\//i.test(h)) return new URL(h, location.origin).href;
    if (/^\/?mailbox\.aspx/i.test(h)) {
      const rel = h.replace(/^\//, "");
      return `${location.origin}/authenticated/${rel}`;
    }
    return new URL(h, `${location.origin}/authenticated/`).href;
  }

  // --- Normalize any authenticated-relative link ---
  function toAuthenticatedURL(href) {
    const h = (href || "").trim();
    if (!h) return null;
    if (/^https?:\/\//i.test(h)) return h;
    if (/^\/authenticated\//i.test(h)) return new URL(h, location.origin).href;
    if (h.startsWith("/")) return `${location.origin}/authenticated${h}`;
    return `${location.origin}/authenticated/${h.replace(/^\//, "")}`;
  }

  // --- Parse mail ID from href ---
  function parseMailIdFromHref(href) {
    const m = String(href || "").match(/[?&]id=(\d+)/i);
    return m ? m[1] : null;
  }

  // --- Parse TMN date from row text ---
  function parseTMNDateFromText(s) {
    const m = String(s).match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    const [, dd, mm, yyyy, HH, MM, SS] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS || 0)).getTime();
  }

  // --- Find newest DTM invitation mail ---
  async function findNewestDTMInviteMail() {
    const inboxURL = `${location.origin}/authenticated/mailbox.aspx?p=m`;
    const inboxRes = await gmGet(inboxURL);
    if (!/\/authenticated\/mailbox\.aspx/i.test(inboxRes.finalUrl)) return null;

    const inboxDoc = new DOMParser().parseFromString(inboxRes.html, "text/html");
    const grid = inboxDoc.querySelector("#ctl00_main_gridMail");
    if (!grid) return null;

    const rows = [...grid.querySelectorAll("tr")].slice(1);
    let best = null;

    console.log(`[TMN][AUTO-DTM] Scanning ${rows.length} mail rows for DTM invites...`);
    for (const r of rows) {
      const rowText = (r.textContent || "").trim();
      // Log first few rows for debugging subject format
      if (rows.indexOf(r) < 5) {
        console.log(`[TMN][AUTO-DTM] Mail row ${rows.indexOf(r)}: "${rowText.substring(0, 120)}"`);
      }
      // Match various DTM invitation subject formats
      if (!/dtm\s*invitation|drug\s*trade\s*(mission\s*)?invitation|dtm\s*invite/i.test(rowText)) continue;
      console.log('[TMN][AUTO-DTM] ✓ Matched DTM invite row:', rowText.substring(0, 100));

      const link = [...r.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
        /[?&]id=\d+/i.test(a.getAttribute("href") || "")
      );
      if (!link) continue;

      const href = link.getAttribute("href") || "";
      const id = parseMailIdFromHref(href);
      const ts = parseTMNDateFromText(rowText);

      if (!best || ts > best.ts) best = { id, ts, href };
    }
    return best;
  }

  // --- Open DTM mail and extract accept URL ---
  async function getDTMAcceptURLFromMail(mailHref) {
    const mailURL = toAuthenticatedMailboxURL(mailHref);
    console.log('[TMN][AUTO-DTM] Fetching mail content from:', mailURL);
    const mailRes = await gmGet(mailURL);
    if (!/\/authenticated\/mailbox\.aspx/i.test(mailRes.finalUrl)) {
      console.log('[TMN][AUTO-DTM] Redirected away from mailbox:', mailRes.finalUrl);
      return null;
    }

    const mailDoc = new DOMParser().parseFromString(mailRes.html, "text/html");

    // Log all links in the mail for debugging
    const allLinks = [...mailDoc.querySelectorAll('a')];
    console.log(`[TMN][AUTO-DTM] Mail contains ${allLinks.length} links`);
    allLinks.forEach((a, i) => {
      const href = a.getAttribute("href") || "";
      const txt = (a.textContent || "").trim();
      if (href.includes("organizedcrime") || txt.toLowerCase().includes("accept")) {
        console.log(`[TMN][AUTO-DTM] Relevant link ${i}: text="${txt}" href="${href}"`);
      }
    });

    const acceptA = [...mailDoc.querySelectorAll('a[href*="organizedcrime.aspx"]')].find(a => {
      const txt = (a.textContent || "").trim().toLowerCase();
      // Accept if text is empty, contains "accept", or is just the URL
      if (txt && !txt.includes("accept") && !txt.includes("organizedcrime")) return false;
      const h = (a.getAttribute("href") || "").replace(/&amp;/g, "&");
      try {
        const u = new URL(h, location.origin);
        // New-style: ?act=accept&ocid=... (DTM uses same page)
        const act = (u.searchParams.get("act") || "").toLowerCase();
        const ocid = u.searchParams.get("ocid") || "";
        if (act === "accept" && /^\d+$/.test(ocid)) return true;
        // Old-style: ?p=dtm&accept=1&id=...
        const p = (u.searchParams.get("p") || "").toLowerCase();
        const accept = u.searchParams.get("accept");
        const id = u.searchParams.get("id") || "";
        if (p === "dtm" && accept === "1" && /^\d+$/.test(id)) return true;
        // Fallback: any accept parameter with an id
        if (accept === "1" && /^\d+$/.test(id)) return true;
        return false;
      } catch { return false; }
    });

    if (!acceptA) {
      console.log('[TMN][AUTO-DTM] No accept link found in mail content');
      return null;
    }
    console.log('[TMN][AUTO-DTM] Found accept URL:', acceptA.getAttribute("href"));
    return toAuthenticatedURL(acceptA.getAttribute("href"));
  }

  // --- Find newest OC invitation mail ---
  async function findNewestOCInviteMail() {
    const inboxURL = `${location.origin}/authenticated/mailbox.aspx?p=m`;
    const inboxRes = await gmGet(inboxURL);
    if (!/\/authenticated\/mailbox\.aspx/i.test(inboxRes.finalUrl)) return null;

    const inboxDoc = new DOMParser().parseFromString(inboxRes.html, "text/html");
    const grid = inboxDoc.querySelector("#ctl00_main_gridMail");
    if (!grid) return null;

    const rows = [...grid.querySelectorAll("tr")].slice(1);
    let best = null;

    for (const r of rows) {
      const rowText = (r.textContent || "").trim();
      if (!/(organized\s+crime\s+invitation|\boc\s+invitation\b)/i.test(rowText)) continue;

      const link = [...r.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
        /[?&]id=\d+/i.test(a.getAttribute("href") || "")
      );
      if (!link) continue;

      const href = link.getAttribute("href") || "";
      const id = parseMailIdFromHref(href);
      const ts = parseTMNDateFromText(rowText);

      if (!best || ts > best.ts) best = { id, ts, href };
    }
    return best;
  }

  // --- Open OC mail and extract accept URL ---
  async function getOCAcceptURLFromMail(mailHref) {
    const mailURL = toAuthenticatedMailboxURL(mailHref);
    const mailRes = await gmGet(mailURL);
    if (!/\/authenticated\/mailbox\.aspx/i.test(mailRes.finalUrl)) return null;

    const mailDoc = new DOMParser().parseFromString(mailRes.html, "text/html");

    const acceptA = [...mailDoc.querySelectorAll('a[href*="organizedcrime.aspx"]')].find(a => {
      const txt = (a.textContent || "").trim().toLowerCase();
      // Accept if text is empty, contains "accept", or is just the URL
      if (txt && !txt.includes("accept") && !txt.includes("organizedcrime")) return false;
      const h = (a.getAttribute("href") || "").replace(/&amp;/g, "&");
      try {
        const u = new URL(h, location.origin);
        // New-style: ?act=accept&ocid=...&pos=...
        const act = (u.searchParams.get("act") || "").toLowerCase();
        const ocid = u.searchParams.get("ocid") || "";
        if (act === "accept" && /^\d+$/.test(ocid)) return true;
        // Old-style: ?p=oc&accept=1&id=...
        const p = (u.searchParams.get("p") || "").toLowerCase();
        const accept = u.searchParams.get("accept");
        const id = u.searchParams.get("id") || "";
        if (p === "oc" && accept === "1" && /^\d+$/.test(id)) return true;
        return false;
      } catch { return false; }
    });

    if (!acceptA) return null;
    return toAuthenticatedURL(acceptA.getAttribute("href"));
  }

  // ============================================================
  // UNIFIED MAIL WATCHER - Single system handles OC, DTM, and general messages
  // Runs via gmGet (background HTTP) so works regardless of current page
  // Stores pending invites in localStorage so they survive page navigations
  // ============================================================

  // All tracking is now via localStorage - no in-memory state that gets wiped on page nav

  async function unifiedMailCheck() {
    try {
      if (!tabManager.isMasterTab) return;
      // Need at least OC/DTM enabled or telegram messages enabled
      if (!state.autoOC && !state.autoDTM && !(telegramConfig.enabled && telegramConfig.notifyMessages)) return;

      const inboxURL = `${location.origin}/authenticated/mailbox.aspx?p=m`;
      const inboxRes = await gmGet(inboxURL);
      if (!/\/authenticated\/mailbox\.aspx/i.test(inboxRes.finalUrl)) {
        console.log('[TMN][MAIL] Redirected away from mailbox - may be logged out');
        return;
      }

      const inboxDoc = new DOMParser().parseFromString(inboxRes.html, "text/html");
      const grid = inboxDoc.querySelector("#ctl00_main_gridMail");
      if (!grid) {
        console.log('[TMN][MAIL] No mail grid found');
        return;
      }

      const rows = [...grid.querySelectorAll("tr")].slice(1);
      console.log(`[TMN][MAIL] Scanning ${rows.length} mail rows...`);

      for (const r of rows) {
        const link = [...r.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
          /[?&]id=\d+/i.test(a.getAttribute("href") || "")
        );
        if (!link) continue;

        const href = link.getAttribute("href") || "";
        const mailId = parseMailIdFromHref(href);
        if (!mailId) continue;

        const cells = r.querySelectorAll("td");
        const rowText = (r.textContent || "").trim();

        let sender = "Unknown";
        let subject = "No subject";
        if (cells.length >= 2) {
          sender = (cells[0].textContent || "").trim() || sender;
          subject = (cells[1].textContent || "").trim() || subject;
        }

        // Check DTM invite - use localStorage to track if already processed
        const isDTMInvite = /(dtm\s*invitation|dtm\s*invite|drug\s*trade)/i.test(rowText);
        if (isDTMInvite && state.autoDTM) {
          // DEDUP LAYER 1: Cooldown — skip if we already accepted a DTM within last 2 hours
          const lastDTMAcceptTs = parseInt(localStorage.getItem(LS_LAST_DTM_ACCEPT_TS) || '0', 10);
          if (lastDTMAcceptTs > 0 && (Date.now() - lastDTMAcceptTs) < 7200000) {
            console.log(`[TMN][MAIL] DTM invite skipped — already accepted ${Math.round((Date.now() - lastDTMAcceptTs) / 60000)}min ago`);
            localStorage.setItem(LS_LAST_DTM_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 2: Already processing — skip if we have a pending DTM handle
          if (localStorage.getItem('tmnPendingDTMHandle') === 'true' || localStorage.getItem(LS_PENDING_DTM_URL)) {
            console.log('[TMN][MAIL] DTM invite skipped — already processing a DTM');
            localStorage.setItem(LS_LAST_DTM_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 3: Mail ID — skip if we've already seen this exact mail
          const lastSeen = localStorage.getItem(LS_LAST_DTM_INVITE_MAIL_ID);
          if (lastSeen === mailId) {
            continue;
          }

          // DEDUP LAYER 4: Age check — skip if mail is older than 5 minutes
          const inviteTs = parseTMNDateFromText(rowText);
          const fiveMinAgo = Date.now() - (5 * 60 * 1000);
          if (inviteTs > 0 && inviteTs < fiveMinAgo) {
            console.log(`[TMN][MAIL] DTM invite skipped — old mail (age: ${Math.round((Date.now() - inviteTs) / 60000)}min)`);
            localStorage.setItem(LS_LAST_DTM_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 5: If we can't parse the date, only accept if mail ID is HIGHER than last seen
          // (mail IDs are sequential — higher = newer)
          if (inviteTs === 0 && lastSeen && parseInt(mailId) <= parseInt(lastSeen)) {
            console.log(`[TMN][MAIL] DTM invite skipped — mail ID ${mailId} <= last seen ${lastSeen} (unparseable date)`);
            continue;
          }

          // All checks passed — this is a genuinely new DTM invite
          console.log(`[TMN][MAIL] NEW DTM invite! id=${mailId} subject="${subject}"`);
          await handleNewDTMInvite(mailId, href);
          continue;
        }

        // Check OC invite
        const isOCInvite = /(organized\s*crime\s*invitation|oc\s*invitation)/i.test(rowText);
        if (isOCInvite && state.autoOC) {
          // DEDUP LAYER 1: Cooldown — skip if we already accepted an OC within last 2 hours
          const lastAcceptTs = parseInt(localStorage.getItem(LS_LAST_OC_ACCEPT_TS) || '0', 10);
          if (lastAcceptTs > 0 && (Date.now() - lastAcceptTs) < 7200000) {
            console.log(`[TMN][MAIL] OC invite skipped — already accepted ${Math.round((Date.now() - lastAcceptTs) / 60000)}min ago`);
            localStorage.setItem(LS_LAST_OC_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 2: Already processing — skip if we have a pending OC handle
          if (localStorage.getItem('tmnPendingOCHandle') === 'true' || localStorage.getItem(LS_PENDING_OC_URL)) {
            console.log('[TMN][MAIL] OC invite skipped — already processing an OC');
            localStorage.setItem(LS_LAST_OC_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 3: Mail ID — skip if we've already seen this exact mail
          const lastSeen = localStorage.getItem(LS_LAST_OC_INVITE_MAIL_ID);
          if (lastSeen === mailId) {
            continue;
          }

          // DEDUP LAYER 4: Age check — skip if mail is older than 5 minutes
          const inviteTs = parseTMNDateFromText(rowText);
          const fiveMinAgo = Date.now() - (5 * 60 * 1000);
          if (inviteTs > 0 && inviteTs < fiveMinAgo) {
            console.log(`[TMN][MAIL] OC invite skipped — old mail (age: ${Math.round((Date.now() - inviteTs) / 60000)}min)`);
            localStorage.setItem(LS_LAST_OC_INVITE_MAIL_ID, mailId);
            continue;
          }

          // DEDUP LAYER 5: If date unparseable, only accept if mail ID is higher than last seen
          if (inviteTs === 0 && lastSeen && parseInt(mailId) <= parseInt(lastSeen)) {
            console.log(`[TMN][MAIL] OC invite skipped — mail ID ${mailId} <= last seen ${lastSeen} (unparseable date)`);
            continue;
          }

          // All checks passed — this is a genuinely new OC invite
          console.log(`[TMN][MAIL] NEW OC invite! id=${mailId} subject="${subject}"`);
          await handleNewOCInvite(mailId, href);
          continue;
        }

        // Regular mail - check against last notified ID stored in localStorage
        if (telegramConfig.enabled && telegramConfig.notifyMessages) {
          const lastNotifiedId = localStorage.getItem('tmnLastNotifiedMailId');

          // FIRST RUN: If we've never notified before, set the high-water mark
          // to the newest mail ID so we don't spam about old messages
          if (lastNotifiedId === null) {
            // Find the highest mail ID in the inbox and set it as baseline
            let maxId = 0;
            for (const row of rows) {
              const rowLink = [...row.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
                /[?&]id=\d+/i.test(a.getAttribute("href") || "")
              );
              if (rowLink) {
                const rid = parseInt(parseMailIdFromHref(rowLink.getAttribute("href") || "")) || 0;
                if (rid > maxId) maxId = rid;
              }
            }
            localStorage.setItem('tmnLastNotifiedMailId', String(maxId));
            console.log(`[TMN][MAIL] First run — initialized lastNotifiedMailId to ${maxId} (skipping ${rows.length} existing)`);
            break;
          }

          // Only notify for mails we haven't notified about (compare IDs numerically - higher = newer)
          if (parseInt(mailId) > parseInt(lastNotifiedId)) {
            // TIMESTAMP CHECK: Only notify about mails from the last 5 minutes
            const mailTs = parseTMNDateFromText(rowText);
            const fiveMinAgo = Date.now() - (5 * 60 * 1000);
            if (mailTs > 0 && mailTs < fiveMinAgo) {
              // Old mail — update high-water mark but don't alert
              console.log(`[TMN][MAIL] Skipping old mail id=${mailId} (age: ${Math.round((Date.now() - mailTs) / 60000)}min)`);
              localStorage.setItem('tmnLastNotifiedMailId', mailId);
              continue;
            }

            console.log(`[TMN][MAIL] New recent mail: id=${mailId} from="${sender}" subject="${subject}"`);

            sendTelegramMessage(
              `📬 <b>New Message!</b>\n\n` +
              `Player: ${state.playerName || 'Unknown'}\n` +
              `Time: ${new Date().toLocaleString()}\n` +
              `From: ${sender}\n` +
              `Subject: ${subject}\n\n` +
              `🔗 Check your mailbox at TMN2010`
            );

            localStorage.setItem('tmnLastNotifiedMailId', mailId);

            // Try to fetch content
            setTimeout(async () => {
              try {
                const mailText = await fetchLatestMailContent();
                if (mailText) {
                  sendTelegramMessage(
                    `📝 <b>Mail Content:</b>\n<pre>${escapeHtml(mailText.substring(0, 500))}</pre>`
                  );
                }
              } catch (e) {}
            }, 3000);

            break; // Only notify one new mail per check cycle
          }
        }
      }

    } catch (e) {
      console.warn("[TMN][MAIL] unifiedMailCheck error:", e);
    }
  }

  // --- Handle new DTM invite: always alert, extract URL, store for processing ---
  async function handleNewDTMInvite(mailId, mailHref) {
    try {
      // Mark as seen immediately to prevent duplicate processing
      localStorage.setItem(LS_LAST_DTM_INVITE_MAIL_ID, mailId);
      localStorage.setItem(LS_LAST_DTM_ACCEPT_TS, String(Date.now()));

      // Always send Telegram alert regardless of jail/action state
      sendTelegramMessage(
        '📬 <b>New DTM Invitation!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        (state.inJail ? '⛓ Currently in jail — will auto-accept when released' :
         state.isPerformingAction ? '⏳ Busy — will auto-accept shortly' :
         '🚚 Auto-accepting now...')
      );

      // Extract accept URL from the mail
      const acceptURL = await getDTMAcceptURLFromMail(mailHref);
      if (!acceptURL) {
        console.warn('[TMN][MAIL] Could not extract DTM accept URL from mail');
        sendTelegramMessage('⚠️ <b>DTM invite found but could not extract accept link.</b>\nPlease accept manually.');
        return;
      }

      console.log('[TMN][MAIL] DTM accept URL:', acceptURL);

      // Store the URL in localStorage so it survives page navigations
      localStorage.setItem(LS_PENDING_DTM_URL, acceptURL);

      // DON'T navigate here - mainLoop Priority 2 will pick it up on next tick
      // This avoids race conditions with concurrent mainLoop navigation
      console.log('[TMN][MAIL] DTM accept URL stored in localStorage. MainLoop will process it.');
    } catch (e) {
      console.warn('[TMN][MAIL] handleNewDTMInvite error:', e);
    }
  }

  // --- Handle new OC invite: always alert, extract URL, store for processing ---
  async function handleNewOCInvite(mailId, mailHref) {
    try {
      // Mark as seen immediately
      localStorage.setItem(LS_LAST_OC_INVITE_MAIL_ID, mailId);
      localStorage.setItem(LS_LAST_OC_ACCEPT_TS, String(Date.now()));

      // Extract accept URL first so we can show role in alert
      const acceptURL = await getOCAcceptURLFromMail(mailHref);

      let roleInfo = '';
      if (acceptURL) {
        try {
          const u = new URL(acceptURL);
          const pos = u.searchParams.get('pos');
          if (pos) roleInfo = `\nRole: ${pos.replace(/([A-Z])/g, ' $1').trim()}`;
        } catch {}
      }

      // Always send Telegram alert
      sendTelegramMessage(
        '📬 <b>New OC Invitation!</b>\n\n' +
        `Player: ${state.playerName || 'Unknown'}\n` +
        `Time: ${new Date().toLocaleString()}${roleInfo}\n\n` +
        (state.inJail ? '⛓ Currently in jail — will auto-accept when released' :
         state.isPerformingAction ? '⏳ Busy — will auto-accept shortly' :
         '🕵️ Auto-accepting now...')
      );

      if (!acceptURL) {
        console.warn('[TMN][MAIL] Could not extract OC accept URL from mail');
        sendTelegramMessage('⚠️ <b>OC invite found but could not extract accept link.</b>\nPlease accept manually.');
        return;
      }

      console.log('[TMN][MAIL] OC accept URL:', acceptURL);

      // Store in localStorage so it survives page navigations
      localStorage.setItem(LS_PENDING_OC_URL, acceptURL);

      // DON'T navigate here - mainLoop Priority 2 will pick it up on next tick
      console.log('[TMN][MAIL] OC accept URL stored in localStorage. MainLoop will process it.');
    } catch (e) {
      console.warn('[TMN][MAIL] handleNewOCInvite error:', e);
    }
  }


  // ============================================================
  // OC PAGE HANDLER - Weapon/Explosive/Car selection after accepting
  // ============================================================
  function handleOCPageAfterAccept() {
    const pending = localStorage.getItem('tmnPendingOCHandle');
    if (pending !== 'true') return false;

    // Timeout: if pending for more than 5 minutes, clear it (something went wrong)
    const pendingTs = parseInt(localStorage.getItem('tmnPendingOCHandleTs') || '0', 10);
    if (pendingTs > 0 && Date.now() - pendingTs > 300000) {
      console.log('[TMN][AUTO-OC] Pending OC handle timed out after 5 min — clearing');
      localStorage.removeItem('tmnPendingOCHandle');
      localStorage.removeItem('tmnPendingOCHandleTs');
      state.isPerformingAction = false;
      return false;
    }

    const path = window.location.pathname.toLowerCase();
    if (!path.includes('organizedcrime.aspx')) {
      // Not on OC page — re-navigate if we have the URL still
      const retryUrl = localStorage.getItem(LS_PENDING_OC_URL);
      if (retryUrl) {
        console.log('[TMN][AUTO-OC] Not on OC page, re-navigating to accept URL');
        localStorage.removeItem(LS_PENDING_OC_URL);
        try {
          const u = new URL(retryUrl);
          window.location.href = u.pathname + u.search;
        } catch {
          window.location.href = retryUrl.replace(/^https?:\/\/[^/]+/, '');
        }
        return true;
      }
      return false;
    }

    console.log('[TMN][AUTO-OC] On OC page — handling role selection...');
    state.isPerformingAction = true;

    // 1) Check if there's still an Accept link to click
    const acceptLink = Array.from(document.querySelectorAll("a"))
      .find(a => {
        const txt = (a.textContent || "").trim().toLowerCase();
        const href = (a.getAttribute("href") || "").toLowerCase();
        return txt === "accept" && href.includes("organizedcrime.aspx");
      });

    if (acceptLink) {
      console.log('[TMN][AUTO-OC] Clicking Accept link on page');
      setTimeout(() => acceptLink.click(), randomDelay(DELAYS.quick));
      return true;
    }

    // 2) Select item from dropdown if present (weapons/explosives/cars)
    const selectIds = [
      "ctl00_main_explosiveslist",
      "ctl00_main_weaponslist",
      "ctl00_main_carslist",
      "ctl00_main_vehicleslist",
      "ctl00_main_weaponlist",
      "ctl00_main_carlist"
    ];
    for (const sid of selectIds) {
      const sel = document.getElementById(sid);
      if (sel && sel.tagName === "SELECT" && sel.options && sel.options.length > 0) {
        if (sel.selectedIndex < 0) sel.selectedIndex = 0;
        try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
        console.log(`[TMN][AUTO-OC] Selected item from dropdown: ${sid}`);
      }
    }

    // 3) Click the Choose/Select button
    const buttonIds = [
      "ctl00_main_btnchooseexplosive",
      "ctl00_main_btnChooseWeapon",
      "ctl00_main_btnchooseweapons",
      "ctl00_main_btnchooseweapon",
      "ctl00_main_btnchoosecar",
      "ctl00_main_btnchoosevehicle",
      "ctl00_main_btnchoosevehicles",
      "ctl00_main_btnchoose",
      "ctl00_main_btnselect"
    ];

    for (const id of buttonIds) {
      const btn = document.getElementById(id);
      if (btn && !btn.disabled) {
        console.log(`[TMN][AUTO-OC] Clicking role button: ${id}`);
        setTimeout(() => {
          btn.click();
          localStorage.removeItem('tmnPendingOCHandle');
          state.isPerformingAction = false;
          updateStatus("✅ OC role selected — resuming automation");
          sendTelegramMessage(
            '🕵️ <b>OC Role Selected!</b>\n\n' +
            `Player: ${state.playerName || 'Unknown'}\n` +
            '✅ Automation resumed'
          );
        }, 2000);
        return true;
      }
    }

    // 4) Fallback: any button with choose/select text
    const fallbackBtn = Array.from(document.querySelectorAll("input[type='submit'], button"))
      .find(el => {
        if (el.disabled) return false;
        const v = ((el.value || el.textContent || "") + "").trim().toLowerCase();
        const id = (el.id || "").toLowerCase();
        return v.includes("choose") || v.includes("select") ||
          id.includes("btnchoose") || id.includes("btnselect");
      });

    if (fallbackBtn) {
      console.log(`[TMN][AUTO-OC] Clicking fallback button: ${fallbackBtn.id || fallbackBtn.value}`);
      setTimeout(() => {
        fallbackBtn.click();
        localStorage.removeItem('tmnPendingOCHandle');
        state.isPerformingAction = false;
        updateStatus("✅ OC role selected — resuming automation");
      }, 2000);
      return true;
    }

    // 5) Check if OC is already completed/waiting
    const bodyText = (document.body.textContent || "").toLowerCase();
    if (/you cannot do an organized crime|you have to wait|members|participants/.test(bodyText)) {
      console.log('[TMN][AUTO-OC] OC appears completed — clearing pending');
      localStorage.removeItem('tmnPendingOCHandle');
      state.isPerformingAction = false;
      updateStatus("✅ OC completed — resuming automation");
      return true;
    }

    // Nothing found yet — retry on next mainLoop cycle
    console.log('[TMN][AUTO-OC] No OC role button found yet — will retry');
    return true;
  }

  // ============================================================
  // DTM PAGE HANDLER - Buy drugs after accepting
  // ============================================================
  function handleDTMPageAfterAccept() {
    const pending = localStorage.getItem('tmnPendingDTMHandle');
    if (pending !== 'true') return false;

    // Timeout: if pending for more than 5 minutes, clear it
    const pendingTs = parseInt(localStorage.getItem('tmnPendingDTMHandleTs') || '0', 10);
    if (pendingTs > 0 && Date.now() - pendingTs > 300000) {
      console.log('[TMN][AUTO-DTM] Pending DTM handle timed out after 5 min — clearing');
      localStorage.removeItem('tmnPendingDTMHandle');
      localStorage.removeItem('tmnPendingDTMHandleTs');
      state.isPerformingAction = false;
      return false;
    }

    const path = window.location.pathname.toLowerCase();
    if (!path.includes('organizedcrime.aspx')) {
      // Not on DTM page — re-navigate if we have the URL still
      const retryUrl = localStorage.getItem(LS_PENDING_DTM_URL);
      if (retryUrl) {
        console.log('[TMN][AUTO-DTM] Not on DTM page, re-navigating to accept URL');
        localStorage.removeItem(LS_PENDING_DTM_URL);
        try {
          const u = new URL(retryUrl);
          window.location.href = u.pathname + u.search;
        } catch {
          window.location.href = retryUrl.replace(/^https?:\/\/[^/]+/, '');
        }
        return true;
      }
      return false;
    }

    console.log('[TMN][AUTO-DTM] On DTM page — handling...');
    console.log(`[TMN][AUTO-DTM] Page text snippet: "${(document.body.textContent || "").substring(0, 200)}"`);
    state.isPerformingAction = true;

    // Wait briefly for page to fully render (ASP.NET forms can load elements async)
    if (!document.getElementById('ctl00_main_btnBuyDrugs') &&
        !document.getElementById('ctl00_main_btnBuyLDrugs') &&
        !Array.from(document.querySelectorAll('input[type="submit"]')).find(b => /buy/i.test(b.value || ''))) {
      // Page might not be fully loaded yet — check if "Buy drugs" text exists but button doesn't
      if (/buy\s*drugs/i.test(document.body.textContent || '')) {
        console.log('[TMN][AUTO-DTM] Buy drugs text found but button not in DOM yet — will retry next tick');
        return true; // Retry on next mainLoop cycle
      }
    }

    // Step 1: Check for Complete DTM button
    const completeBtn =
      document.getElementById('ctl00_main_btnCompleteDTM') ||
      document.querySelector('input[id*="btnComplete"][type="submit"]') ||
      Array.from(document.querySelectorAll('input[type="submit"],button')).find(b =>
        /complete\s*dtm/i.test((b.value || b.textContent || '').trim())
      );

    if (completeBtn && !completeBtn.disabled) {
      console.log('[TMN][AUTO-DTM] Clicking Complete DTM');
      setTimeout(() => {
        completeBtn.click();
        localStorage.removeItem('tmnPendingDTMHandle');
        state.isPerformingAction = false;

        // Set cooldown
        const dtmCooldown = { canDTM: false, totalSeconds: 7200, hours: 2, minutes: 0, seconds: 0, message: "DTM completed", lastUpdate: Date.now() };
        storeDTMTimerData(dtmCooldown);

        updateStatus("✅ DTM completed — resuming automation");
        sendTelegramMessage(
          '🚚 <b>DTM Completed!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          '✅ 2h cooldown started, automation resumed'
        );
      }, 2000);
      return true;
    }

    // Step 2: Buy drugs page — find max amount and buy
    const pageText = document.body.textContent || "";

    // Try multiple patterns to find the max drug amount
    let maxAmount = 0;
    const maxPatterns = [
      /maximum amount you can carry is (\d+)/i,
      /maximum amount you can buy is (\d+)/i,
      /maximum amount.*?is (\d+)/i,
      /you can carry is (\d+)/i,
      /can buy.*?(\d+)\s*units/i
    ];
    for (const pat of maxPatterns) {
      const m = pageText.match(pat);
      if (m) { maxAmount = parseInt(m[1], 10); break; }
    }

    // Fallback: extract units from member table — look for player name with "(X units)"
    if (!maxAmount && state.playerName) {
      const playerUnitMatch = pageText.match(new RegExp(state.playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\([^)]*?-\\s*(\\d+)\\s*units?\\)', 'i'));
      if (playerUnitMatch) {
        maxAmount = parseInt(playerUnitMatch[1], 10);
        console.log(`[TMN][AUTO-DTM] Got max units from member table: ${maxAmount}`);
      }
    }

    console.log(`[TMN][AUTO-DTM] maxAmount=${maxAmount}, playerName="${state.playerName}"`);

    // Find the buy controls — broaden selectors to catch all possible element IDs
    let drugInput =
      document.getElementById('ctl00_main_tbDrugLAmount') ||
      document.getElementById('ctl00_main_tbDrugAmount') ||
      document.getElementById('ctl00_main_txtDrugAmount') ||
      document.getElementById('ctl00_main_txtAmount') ||
      document.querySelector('input[id*="tbDrug"]') ||
      document.querySelector('input[id*="txtDrug"]') ||
      document.querySelector('input[id*="Drug"][type="text"]') ||
      document.querySelector('input[id*="Amount"][type="text"]') ||
      document.querySelector('input[name*="tbDrug"]') ||
      document.querySelector('input[name*="txtDrug"]');

    let buyButton =
      document.getElementById('ctl00_main_btnBuyLDrugs') ||
      document.getElementById('ctl00_main_btnBuyDrugs') ||
      document.getElementById('ctl00_main_btnBuy') ||
      document.querySelector('input[id*="btnBuy"][type="submit"]') ||
      Array.from(document.querySelectorAll('input[type="submit"],button')).find(b =>
        /buy\s*drugs/i.test((b.value || b.textContent || '').trim())
      );

    // Nuclear fallback: find any text input next to the Buy Drugs button
    if (!drugInput && buyButton) {
      drugInput = buyButton.parentElement?.querySelector('input[type="text"],input:not([type])') ||
                  buyButton.closest('div,td,tr,form')?.querySelector('input[type="text"],input:not([type])');
      if (drugInput) console.log(`[TMN][AUTO-DTM] Found input via Buy button proximity: id="${drugInput.id}"`);
    }

    // Nuclear fallback 2: if no buy button found by ID, search harder
    if (!buyButton) {
      buyButton = Array.from(document.querySelectorAll('input[type="submit"]')).find(b =>
        /buy/i.test(b.value || '')
      );
      if (buyButton) console.log(`[TMN][AUTO-DTM] Found Buy button via text search: id="${buyButton.id}" value="${buyButton.value}"`);
    }

    // Nuclear fallback 3: no specific selectors worked, grab the ONLY text input on page
    if (!drugInput && maxAmount > 0) {
      const allTextInputs = document.querySelectorAll('input[type="text"],input:not([type="submit"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"])');
      const candidates = Array.from(allTextInputs).filter(i => !i.id.includes('search') && !i.id.includes('chat'));
      if (candidates.length === 1) {
        drugInput = candidates[0];
        console.log(`[TMN][AUTO-DTM] Found sole text input as fallback: id="${drugInput.id}"`);
      }
    }

    // Debug logging
    if (!drugInput || !buyButton) {
      const allInputs = Array.from(document.querySelectorAll('input'));
      console.log(`[TMN][AUTO-DTM] DEBUG — drugInput=${!!drugInput}, buyButton=${!!buyButton}, maxAmount=${maxAmount}`);
      console.log(`[TMN][AUTO-DTM] All inputs on page:`);
      allInputs.forEach(i => console.log(`  id="${i.id}" type="${i.type}" name="${i.name}" value="${i.value}"`));
    }

    if (maxAmount > 0 && drugInput && buyButton && !buyButton.disabled) {
      drugInput.value = String(maxAmount);
      console.log(`[TMN][AUTO-DTM] Buying ${maxAmount} drugs`);
      setTimeout(() => {
        buyButton.click();

        // Set cooldown (buying drugs completes the DTM in some setups)
        const now = Date.now();
        const dtmCooldown = {
          canDTM: false, totalSeconds: 7200, hours: 2, minutes: 0, seconds: 0,
          message: "DTM completed", lastUpdate: now,
          expiresAt: now + (7200 * 1000)
        };
        storeDTMTimerData(dtmCooldown);

        localStorage.removeItem('tmnPendingDTMHandle');
        localStorage.removeItem('tmnPendingDTMHandleTs');
        state.isPerformingAction = false;
        updateStatus("✅ DTM drugs bought — resuming automation");
        sendTelegramMessage(
          '🚚 <b>DTM Drugs Bought!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Amount: ${maxAmount}\n` +
          '✅ 2h cooldown started, automation resumed'
        );
      }, randomDelay(DELAYS.quick));
      return true;
    }

    // If we found input + button but no amount, try buying with the input already populated
    if (drugInput && buyButton && !buyButton.disabled && drugInput.value && parseInt(drugInput.value) > 0) {
      const prefilledAmount = drugInput.value;
      console.log(`[TMN][AUTO-DTM] Input already has value: ${prefilledAmount}, clicking Buy`);
      setTimeout(() => {
        buyButton.click();
        const now = Date.now();
        storeDTMTimerData({
          canDTM: false, totalSeconds: 7200, hours: 2, minutes: 0, seconds: 0,
          message: "DTM completed", lastUpdate: now, expiresAt: now + (7200 * 1000)
        });
        localStorage.removeItem('tmnPendingDTMHandle');
        localStorage.removeItem('tmnPendingDTMHandleTs');
        state.isPerformingAction = false;
        updateStatus("✅ DTM drugs bought — resuming automation");
      }, randomDelay(DELAYS.quick));
      return true;
    }

    // Log what we found for debugging
    if (buyButton) {
      console.log(`[TMN][AUTO-DTM] Buy button found but maxAmount=${maxAmount}, drugInput=${!!drugInput}`);
    }

    // Check if DTM is already on cooldown
    const bodyText = (document.body.textContent || "").toLowerCase();
    if (/you cannot do a dtm|you have to wait/.test(bodyText)) {
      console.log('[TMN][AUTO-DTM] DTM on cooldown — clearing pending');
      localStorage.removeItem('tmnPendingDTMHandle');
      state.isPerformingAction = false;
      updateStatus("DTM on cooldown — resuming automation");
      return true;
    }

    // Nothing found yet — retry
    console.log('[TMN][AUTO-DTM] DTM page not ready yet — will retry');
    return true;
  }

  // Legacy stubs — mainLoop handles all mail checks now
  function startUnifiedMailWatcher() {}
  function stopUnifiedMailWatcher() {}
  function startAutoOCMailWatcher() {}
  function stopAutoOCMailWatcher() {}
  function startAutoDTMMailWatcher() {}
  function stopAutoDTMMailWatcher() {}
  function startBackgroundMailCheck() {}
  function stopBackgroundMailCheck() {}

  // ============================================================
  // FETCH LATEST MAIL CONTENT (for Telegram alerts)
  // ============================================================
  async function fetchLatestMailContent() {
    try {
      const inboxURL = `${location.origin}/authenticated/mailbox.aspx?p=m`;
      const inboxRes = await gmGet(inboxURL);
      if (!/\/authenticated\/mailbox\.aspx/i.test(inboxRes.finalUrl)) return null;

      const inboxDoc = new DOMParser().parseFromString(inboxRes.html, "text/html");
      const grid = inboxDoc.querySelector("#ctl00_main_gridMail");
      if (!grid) return null;

      const rows = [...grid.querySelectorAll("tr")].slice(1);
      let bestRow = null;
      let bestTs = -1;

      for (const r of rows) {
        const link = [...r.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
          /[?&]id=\d+/i.test(a.getAttribute("href") || "")
        );
        if (!link) continue;
        const ts = parseTMNDateFromText(r.textContent);
        if (ts > bestTs) { bestTs = ts; bestRow = r; }
      }
      if (!bestRow) return null;

      const readLink = [...bestRow.querySelectorAll('a[href*="mailbox.aspx"]')].find(a =>
        /[?&]id=\d+/i.test(a.getAttribute("href") || "")
      );
      if (!readLink) return null;

      const mailURL = toAuthenticatedMailboxURL(readLink.getAttribute("href"));
      const mailRes = await gmGet(mailURL);
      if (!/\/authenticated\/mailbox\.aspx/i.test(mailRes.finalUrl)) return null;

      const mailDoc = new DOMParser().parseFromString(mailRes.html, "text/html");
      const readPanel = mailDoc.querySelector("#ctl00_main_pnlMailRead");

      let contentDiv = null;
      if (readPanel) {
        contentDiv =
          readPanel.querySelector(".GridRow > .GridHeader + div") ||
          readPanel.querySelector(".GridRow div[style*='padding']") ||
          readPanel.querySelector(".GridRow");
      }
      if (!contentDiv) {
        contentDiv =
          mailDoc.querySelector("#ctl00_main_lblBody") ||
          mailDoc.querySelector("#ctl00_main_lblMessage");
      }
      if (!contentDiv) return null;

      let html = contentDiv.innerHTML || "";
      html = html.replace(/<br\s*\/?>/gi, "\n");
      const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
      const text = (parsed.body.textContent || "")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return text;
    } catch (e) {
      console.warn("[TMN] fetchLatestMailContent error:", e);
      return null;
    }
  }

  // Next function should be formatTime()
  function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s ago`;
  }

  function getCurrentPage() {
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path.includes('crimes.aspx')) {
      if (search.includes('p=g')) return 'gta';
      if (search.includes('p=b')) return 'booze';
      return 'crimes';
    }
    if (path.includes('jail.aspx')) return 'jail';
    if (path.includes('players.aspx')) return 'players';
    if (path.includes('resetscriptcounter.aspx')) return 'captcha';
    if (path.includes('playerproperty.aspx') && search.includes('p=g')) return 'garage';
    if (path.includes('credits.aspx')) return 'credits';
    if (path.includes('travel.aspx')) return 'travel';
    if (path.includes('store.aspx') && search.includes('p=b')) return 'store';
    return 'other';
  }

  function isOnCaptchaPage() {
    return getCurrentPage() === 'captcha' ||
      document.querySelector('.g-recaptcha') !== null ||
      document.querySelector('#ctl00_main_pnlVerify') !== null ||
      document.title.includes('Script Check') ||
      document.body.textContent.includes('Verify your actions') ||
      document.body.textContent.includes('complete the script test');
  }

  function getPlayerName() {
    if (getCurrentPage() !== 'players') {
      updateStatus("Getting player name...");
      window.location.href = '/authenticated/players.aspx?' + Date.now();
      return;
    }

    const TARGET_RGB = 'rgb(170, 0, 0)';
    const playerLinks = document.querySelectorAll('a[href*="profile.aspx"]');
    for (let link of playerLinks) {
      const computedColor = window.getComputedStyle(link).color;
      const inlineColor = link.style.color.toUpperCase();

      if (computedColor === TARGET_RGB ||
        inlineColor === '#AA0000' ||
        inlineColor === 'RED') {
        state.playerName = link.textContent.trim();
        saveState();
        updateStatus(`Player identified: ${state.playerName}`);
        return;
      }
    }

    const allElements = document.querySelectorAll('*');
    for (let element of allElements) {
      if (window.getComputedStyle(element).color === TARGET_RGB &&
        element.textContent.trim().length > 0 &&
        element.textContent.trim().length < 50) {

        state.playerName = element.textContent.trim();
        saveState();
        updateStatus(`Player identified: ${state.playerName}`);
        return;
      }
    }

    updateStatus("Could not identify player name");
  }

  // COMPLETELY REWRITTEN JAIL DETECTION
  function processJailPage() {
    if (getCurrentPage() !== 'jail') return;

    let inJail = false;

    // Method 1: Check if player name appears in jail table
    if (state.playerName) {
      const jailTable = document.querySelector('#ctl00_main_gvJail');
      if (jailTable) {
        const tableText = jailTable.textContent.toLowerCase();
        if (tableText.includes(state.playerName.toLowerCase())) {
          inJail = true;
          console.log('Jail detection: Player found in jail table');
        }
      }
    }

    // Method 2: Check for "You are in jail" text
    if (!inJail) {
      const pageText = document.body.textContent.toLowerCase();
      if (pageText.includes('you are in jail') || pageText.includes('you have been jailed')) {
        inJail = true;
        console.log('Jail detection: "You are in jail" text found');
      }
    }

    // Method 3: Check for release timer or bail options
    if (!inJail) {
      const releaseElements = document.querySelectorAll('*');
      for (let element of releaseElements) {
        const text = element.textContent.toLowerCase();
        if (text.includes('time remaining') || text.includes('bail amount') || text.includes('post bail')) {
          inJail = true;
          console.log('Jail detection: Release timer or bail options found');
          break;
        }
      }
    }

    // Method 4: Check if we can see jailbreak options but no break out options for ourselves
    if (!inJail) {
      const breakLinks = document.querySelectorAll('a[id*="btnBreak"]');
      const hasClickableBreaks = Array.from(breakLinks).some(link => {
        return !link.hasAttribute('disabled') && link.href && link.href.includes('javascript:');
      });

      // If there are breakable players but we're not seeing our own breakout option, we're probably jailed
      if (breakLinks.length > 0 && !hasClickableBreaks) {
        inJail = true;
        console.log('Jail detection: Break options exist but none for player');
      }
    }

    // Handle state transition
    const wasInJail = state.inJail;
    state.inJail = inJail;

    if (!wasInJail && inJail) {
      // Player just got jailed
      console.log('Player just got jailed!');
      if (state.currentAction && !state.pendingAction) {
        state.pendingAction = state.currentAction;
        updateStatus(`JAILED! Action interrupted: ${state.currentAction}. Will resume after release.`);
      }
      // CRITICAL: Reset action state immediately when jailed
      state.isPerformingAction = false;
      state.currentAction = '';
      state.needsRefresh = true;
      GM_setValue('actionStartTime', 0);
    } else if (wasInJail && !inJail) {
      // Player just got released
      console.log('Player just got released!');
      updateStatus(`Released from jail!${state.pendingAction ? ` Resuming: ${state.pendingAction}` : ''}`);
      state.needsRefresh = true;

      // Process any pending OC/DTM invites now that we're free (after short delay)
      const hasPendingDTM = localStorage.getItem(LS_PENDING_DTM_URL);
      const hasPendingOC = localStorage.getItem(LS_PENDING_OC_URL);
      if (hasPendingDTM || hasPendingOC) {
        console.log('[TMN] Released from jail — pending invite will be processed by mainLoop');
      }
    }

    saveState();

    if (state.inJail) {
      updateStatus(`${state.playerName} is IN JAIL - waiting for release${state.pendingAction ? ` (will resume ${state.pendingAction})` : ''}`);
    } else {
      updateStatus(`${state.playerName} is free - ready for actions`);
    }

    return inJail;
  }

  // Enhanced function to check jail state on ANY page
  function checkJailStateOnAnyPage() {
    const currentPage = getCurrentPage();

    // If we're on the jail page, use the full detection
    if (currentPage === 'jail') {
      return processJailPage();
    }

    // On other pages, look for jail indicators
    const pageText = document.body.textContent.toLowerCase();
    if (pageText.includes('you are in jail') || pageText.includes('you have been jailed')) {
      const wasInJail = state.inJail;
      state.inJail = true;

      if (!wasInJail) {
        console.log('Jail detected on non-jail page!');
        if (state.currentAction && !state.pendingAction) {
          state.pendingAction = state.currentAction;
        }
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = true;
        GM_setValue('actionStartTime', 0);
        saveState();
        updateStatus(`JAILED on ${currentPage} page! Navigation interrupted.`);

        // Navigate to jail page to confirm
        setTimeout(() => {
          window.location.href = '/authenticated/jail.aspx?' + Date.now();
        }, 1000);
      }
      return true;
    }

    return state.inJail;
  }

  // ---------------------------
  // Safety Functions
  // ---------------------------
  function checkForNavigationInterruption() {
    if (state.isPerformingAction) {
      const actionStartTime = GM_getValue('actionStartTime', 0);
      const now = Date.now();

      if (now - actionStartTime > 15000) {
        updateStatus(`Resetting stuck action: ${state.currentAction}`);
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = true;
        saveState();
        GM_setValue('actionStartTime', 0);
        return true;
      }
    }
    return false;
  }

  function safeNavigate(url) {
    // CRITICAL: Always check jail state before navigation
    if (state.inJail && !url.includes('jail.aspx')) {
      updateStatus("BLOCKED: Cannot navigate - player is in jail");
      return true;
    }

    if (state.isPerformingAction) {
      updateStatus("Completing current action before navigation...");
      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = false;
        GM_setValue('actionStartTime', 0);
        saveState();
        window.location.href = url;
      }, randomDelay(DELAYS.normal));
      return true;
    } else {
      // Human-like delay before navigation
      const delay = randomDelay(DELAYS.quick);
      setTimeout(() => {
        window.location.href = url;
      }, delay);
      return false;
    }
  }

  function completePendingAction(actionType) {
    if (state.pendingAction === actionType) {
      state.pendingAction = '';
      saveState();
    }
  }

  // ---------------------------
  // Automation Control Functions
  // ---------------------------
  function pauseAutomation() {
    automationPaused = true;
    updateStatus("Automation PAUSED - Settings modal open");
  }

  function resumeAutomation() {
    automationPaused = false;
    updateStatus("Automation RESUMED");
  }

  // ---------------------------
  // Main Action Functions (WITH JAIL CHECKS)
  // ---------------------------
  function doCrime() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot commit crime while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoCrime || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastCrime < config.crimeInterval * 1000) {
      const remaining = Math.ceil((config.crimeInterval * 1000 - (now - state.lastCrime)) / 1000);
      updateStatus(`Crime cooldown: ${remaining}s remaining`);
      return;
    }

    if (state.needsRefresh || getCurrentPage() !== 'crimes') {
      state.needsRefresh = false;
      saveState();
      updateStatus("Loading crimes page...");
      safeNavigate('/authenticated/crimes.aspx?' + Date.now());
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'crime';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting crime...");

    let availableCrimes = [];

    if (state.selectedCrimes.length > 0) {
      availableCrimes = state.selectedCrimes.map(crimeId => {
        const crime = crimeOptions.find(c => c.id === crimeId);
        if (crime) {
          const btn = document.getElementById(crime.element);
          if (btn && !btn.disabled) {
            return btn;
          }
        }
        return null;
      }).filter(btn => btn !== null);
    } else {
      for (let i = 1; i <= 5; i++) {
        const btn = document.getElementById(`ctl00_main_btnCrime${i}`);
        if (btn && !btn.disabled) {
          availableCrimes.push(btn);
        }
      }
    }

    if (availableCrimes.length === 0) {
      updateStatus("No available crime buttons found");
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      return;
    }

    const randomBtn = availableCrimes[Math.floor(Math.random() * availableCrimes.length)];
    randomBtn.click();

    state.lastCrime = now;
    state.needsRefresh = true;
    completePendingAction('crime');
    saveState();
    updateStatus("Crime attempted - will refresh page...");

    setTimeout(() => {
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
    }, randomDelay(DELAYS.normal));
  }

  function doGTA() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot do GTA while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoGTA || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastGTA < config.gtaInterval * 1000) {
      const remaining = Math.ceil((config.gtaInterval * 1000 - (now - state.lastGTA)) / 1000);
      updateStatus(`GTA cooldown: ${remaining}s remaining`);
      return;
    }

    const currentPage = getCurrentPage();
    if (state.needsRefresh || currentPage !== 'gta') {
      state.needsRefresh = false;
      saveState();
      if (currentPage === 'gta') {
        updateStatus("Already on GTA page, proceeding...");
      } else {
        updateStatus("Loading GTA page...");
        safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
        return;
      }
    }

    state.isPerformingAction = true;
    state.currentAction = 'gta';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting GTA...");

    let availableGTAs = [];
    const radioButtons = document.querySelectorAll('input[name="ctl00$main$carslist"]');

    if (state.selectedGTAs.length > 0) {
      availableGTAs = state.selectedGTAs.map(gtaId => {
        const gta = gtaOptions.find(g => g.id === gtaId);
        if (gta) {
          return Array.from(radioButtons).find(radio => radio.value === gta.value);
        }
        return null;
      }).filter(radio => radio !== null);
    } else {
      availableGTAs = Array.from(radioButtons);
    }

    if (availableGTAs.length === 0) {
      updateStatus("No GTA options found - resetting action state");
      state.isPerformingAction = false;
      state.currentAction = '';
      state.needsRefresh = true;
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    const randomRadio = availableGTAs[Math.floor(Math.random() * availableGTAs.length)];
    randomRadio.checked = true;

    // Human-like delay between selecting car and clicking steal
    setTimeout(() => {
      const stealBtn = document.getElementById('ctl00_main_btnStealACar');
      if (!stealBtn) {
        updateStatus("Steal car button not found - resetting action state");
        state.isPerformingAction = false;
        state.currentAction = '';
        state.needsRefresh = true;
        GM_setValue('actionStartTime', 0);
        saveState();
        return;
      }

      stealBtn.click();

      state.lastGTA = now;
      state.needsRefresh = true;
      completePendingAction('gta');
      saveState();
      updateStatus("GTA attempted - will refresh page...");

      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        GM_setValue('actionStartTime', 0);
      }, randomDelay(DELAYS.normal));
    }, randomDelay(DELAYS.quick));
  }

  function doBooze() {
    // CRITICAL: Check jail state at the start of EVERY action
    if (state.inJail) {
      updateStatus("BLOCKED: Cannot do booze run while in jail");
      state.isPerformingAction = false;
      state.currentAction = '';
      return;
    }

    if (!state.autoBooze || state.isPerformingAction || automationPaused) return;

    const now = Date.now();
    if (now - state.lastBooze < config.boozeInterval * 1000) {
      const remaining = Math.ceil((config.boozeInterval * 1000 - (now - state.lastBooze)) / 1000);
      updateStatus(`Booze cooldown: ${remaining}s remaining`);
      return;
    }

    if (state.needsRefresh || getCurrentPage() !== 'booze') {
      state.needsRefresh = false;
      saveState();
      updateStatus("Loading booze page...");
      safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'booze';
    GM_setValue('actionStartTime', now);
    updateStatus("Attempting booze transaction...");

    // First try to sell existing inventory
    const inventoryRows = Array.from(document.querySelectorAll('table tr')).filter(row => {
      const col3 = row.querySelector('td:nth-child(3)');
      if (!col3) return false;
      const inventory = col3.textContent.trim();
      return inventory && inventory !== '0' && !isNaN(inventory);
    });

    if (inventoryRows.length > 0) {
      // Has inventory - sell it using boozeSellAmount
      const row = inventoryRows[0];
      const sellInput = row.querySelector('input[id*="tbAmtSell"]');
      const sellBtn = row.querySelector('input[id*="btnSell"]');
      if (sellInput && sellBtn && !sellBtn.disabled) {
        const currentInventory = parseInt(row.querySelector('td:nth-child(3)').textContent.trim());
        const sellAmount = Math.min(config.boozeSellAmount, currentInventory);
        sellInput.value = sellAmount;
        updateStatus(`Selling ${sellAmount} booze units...`);
        sellBtn.click();

        state.lastBooze = now;
        state.needsRefresh = true;
        completePendingAction('booze');
        saveState();

        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          GM_setValue('actionStartTime', 0);
        }, randomDelay(DELAYS.normal));
        return;
      }
    }

    // No inventory - try to buy using boozeBuyAmount
    const buyOptions = [];
    for (let i = 2; i <= 6; i++) {
      const input = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_tbAmtBuy`);
      const btn = document.getElementById(`ctl00_main_gvBooze_ctl0${i}_btnBuy`);
      if (input && btn && !btn.disabled) {
        buyOptions.push({ input, btn, index: i });
      }
    }

    if (buyOptions.length > 0) {
      const choice = buyOptions[Math.floor(Math.random() * buyOptions.length)];
      choice.input.value = config.boozeBuyAmount;
      updateStatus(`Buying ${config.boozeBuyAmount} booze units...`);
      choice.btn.click();

      state.lastBooze = now;
      state.needsRefresh = true;
      completePendingAction('booze');
      saveState();

      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        GM_setValue('actionStartTime', 0);
      }, randomDelay(DELAYS.normal));
    } else {
      updateStatus("No booze options available");
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
    }
  }

  function doJailbreak() {
    if (!state.autoJail || state.isPerformingAction || state.inJail || automationPaused) return;

    const now = Date.now();
    if (now - state.lastJail < config.jailbreakInterval * 1000) return;

    if (getCurrentPage() !== 'jail') {
      updateStatus("Navigating to jail page...");
      safeNavigate('/authenticated/jail.aspx?' + Date.now());
      return;
    }

    const breakLinks = document.querySelectorAll('a[id*="btnBreak"]');
    const availableLinks = Array.from(breakLinks).filter(link => {
      return !link.hasAttribute('disabled') && link.href && link.href.includes('javascript:');
    });

    if (availableLinks.length > 0) {
      state.isPerformingAction = true;
      state.currentAction = 'jailbreak';
      GM_setValue('actionStartTime', now);
      const randomLink = availableLinks[Math.floor(Math.random() * availableLinks.length)];
      randomLink.click();
      updateStatus(`Jailbreak attempted (${availableLinks.length} available)`);

      state.lastJail = now;
      saveState();

      setTimeout(() => {
        state.isPerformingAction = false;
        state.currentAction = '';
        GM_setValue('actionStartTime', 0);
        safeNavigate('/authenticated/jail.aspx?' + Date.now());
      }, randomDelay(DELAYS.quick));
    } else {
      state.lastJail = now;
      saveState();
      updateStatus("No players available to break out");
    }
  }

  // ---------------------------
  // Health Functions
  // ---------------------------
  function getHealthPercent() {
    const healthSpan = document.querySelector('#ctl00_userInfo_lblhealth');
    if (!healthSpan) return 100;
    const healthText = healthSpan.textContent.trim();
    const healthValue = parseInt(healthText.replace('%', ''), 10);
    return isNaN(healthValue) ? 100 : healthValue;
  }

  function getCredits() {
    const creditsSpan = document.querySelector('#ctl00_userInfo_lblcredits');
    if (!creditsSpan) return 0;
    const creditsText = creditsSpan.textContent.trim();
    return parseInt(creditsText.replace(/[,$]/g, ''), 10) || 0;
  }

  function checkAndBuyHealth() {
    if (!state.autoHealth || state.isPerformingAction || automationPaused) return;

    const health = getHealthPercent();
    const credits = getCredits();

    // If health is 100% or close, nothing to do
    if (health >= 100) {
      state.buyingHealth = false;
      saveState();
      return;
    }

    // Calculate how much health we need and how many credits that costs
    // Each 10% health costs 10 credits
    const healthNeeded = 100 - health;
    const purchasesNeeded = Math.ceil(healthNeeded / 10);
    const creditsNeeded = purchasesNeeded * 10;

    // Check if we have enough credits
    if (credits < 10) {
      console.log('[TMN] Not enough credits for health - need at least 10');
      state.autoHealth = false; // Disable auto-health if no credits
      saveState();
      updateStatus("Auto-health disabled - no credits");
      return;
    }

    // If not on credits page, navigate there
    if (!/\/authenticated\/credits\.aspx$/i.test(location.pathname)) {
      state.buyingHealth = true;
      saveState();
      updateStatus(`Health low (${health}%) - navigating to buy health`);
      console.log(`[TMN] Health: ${health}%, navigating to credits page`);
      setTimeout(() => location.href = '/authenticated/credits.aspx', 1500);
      return;
    }

    // On credits page - buy health
    if (state.buyingHealth) {
      const buyBtn = document.querySelector('#ctl00_main_btnBuyHealth');
      if (buyBtn) {
        state.isPerformingAction = true;
        state.currentAction = 'health';
        console.log(`[TMN] Buying health - current: ${health}%`);
        updateStatus(`Buying health (${health}% -> ${Math.min(100, health + 10)}%)`);
        buyBtn.click();

        // After purchase, reload to continue buying if needed
        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          state.lastHealth = Date.now();
          // Check if we need more health
          if (health + 10 >= 100) {
            state.buyingHealth = false;
            console.log('[TMN] Health purchase complete');
          }
          saveState();
          location.reload();
        }, 1500);
      } else {
        state.buyingHealth = false;
        saveState();
        console.log('[TMN] Buy health button not found');
      }
    }
  }

  // ---------------------------
  // Garage Functions
  // ---------------------------
  // VIP cars - keep these, repair them, don't sell
  function isVIPCar(carName) {
    return /Bugatti Chiron SS|Bentley Arnage|Bentley Continental|Audi RS6 Avant/i.test(carName);
  }

  function doGarage() {
    if (!state.autoGarage || state.isPerformingAction || state.inJail || automationPaused) return;

    const now = Date.now();
    if (now - state.lastGarage < config.garageInterval * 1000) return;

    // Navigate to garage if not there
    if (getCurrentPage() !== 'garage') {
      updateStatus("Navigating to garage...");
      safeNavigate('/authenticated/playerproperty.aspx?p=g&' + Date.now());
      return;
    }

    // On garage page - process cars
    const table = document.getElementById('ctl00_main_gvCars');
    if (!table) {
      updateStatus("No garage table found");
      state.lastGarage = now;
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    // Get all car rows (skip header row)
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    const carRows = rows.filter(row => row.querySelector('input[type="checkbox"]'));

    if (carRows.length === 0) {
      updateStatus("No cars in garage");
      state.lastGarage = now;
      state.isPerformingAction = false;
      state.currentAction = '';
      GM_setValue('actionStartTime', 0);
      saveState();
      return;
    }

    state.isPerformingAction = true;
    state.currentAction = 'garage';
    GM_setValue('actionStartTime', now);

    // Step 1: Sell all NON-VIP cars
    let carsToSell = 0;
    carRows.forEach(row => {
      const nameCell = row.children[1];
      const carName = nameCell ? nameCell.textContent.trim() : '';
      const checkbox = row.querySelector('input[type="checkbox"]');

      if (checkbox && !isVIPCar(carName)) {
        checkbox.checked = true;
        carsToSell++;
      }
    });

    if (carsToSell > 0) {
      const sellBtn = document.getElementById('ctl00_main_btnSellSelected');
      if (sellBtn) {
        updateStatus(`Selling ${carsToSell} non-VIP cars...`);
        console.log(`[TMN] Selling ${carsToSell} non-VIP cars`);
        sellBtn.click();

        // Reset state and set needsRefresh so script continues after page reload
        setTimeout(() => {
          state.isPerformingAction = false;
          state.currentAction = '';
          state.lastGarage = Date.now();
          state.needsRefresh = true;
          GM_setValue('actionStartTime', 0);
          saveState();
          // Navigate back to crimes page to continue automation instead of reload
          window.location.href = '/authenticated/crimes.aspx?' + Date.now();
        }, randomDelay(DELAYS.normal));
        return;
      }
    }

    // Step 2: Repair damaged VIP cars (one at a time)
    for (const row of carRows) {
      const nameCell = row.children[1];
      const carName = nameCell ? nameCell.textContent.trim() : '';
      const damageCell = row.children[4];
      const damage = damageCell ? parseInt(damageCell.textContent.trim().replace('%', ''), 10) : 0;
      const checkbox = row.querySelector('input[type="checkbox"]');

      if (checkbox && isVIPCar(carName) && damage > 0) {
        // Uncheck all first
        carRows.forEach(r => {
          const cb = r.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = false;
        });

        checkbox.checked = true;
        const repairBtn = document.getElementById('ctl00_main_btnRepair');
        if (repairBtn) {
          updateStatus(`Repairing VIP car: ${carName} (${damage}% damage)`);
          console.log(`[TMN] Repairing VIP car: ${carName}`);
          repairBtn.click();

          // Reset state and continue automation
          setTimeout(() => {
            state.isPerformingAction = false;
            state.currentAction = '';
            state.needsRefresh = true;
            GM_setValue('actionStartTime', 0);
            saveState();
            // Navigate back to crimes page to continue automation
            window.location.href = '/authenticated/crimes.aspx?' + Date.now();
          }, randomDelay(DELAYS.normal));
          return;
        }
      }
    }

    // Nothing to do - reset state and continue
    updateStatus("Garage: No actions needed");
    state.isPerformingAction = false;
    state.currentAction = '';
    state.lastGarage = now;
    GM_setValue('actionStartTime', 0);
    saveState();
  }

  // ---------------------------
  // UI: create Shadow DOM + dark themed Bootstrap-based UI (scoped)
  // ---------------------------
  function createScopedUI() {
    if (document.getElementById('tmn-automation-host')) return;

    const host = document.createElement('div');
    host.id = 'tmn-automation-host';
    document.body.appendChild(host);

    shadowRoot = host.attachShadow({ mode: 'open' });

    const linkBootstrap = document.createElement('link');
    linkBootstrap.rel = 'stylesheet';
    linkBootstrap.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';
    linkBootstrap.onload = () => {
      // Show UI only after Bootstrap CSS is loaded (prevents FOUC)
      host.classList.add('tmn-ready');
    };
    shadowRoot.appendChild(linkBootstrap);

    const linkIcons = document.createElement('link');
    linkIcons.rel = 'stylesheet';
    linkIcons.href = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css';
    shadowRoot.appendChild(linkIcons);

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .card { font-family: Arial, Helvetica, sans-serif; width: 20rem; }
      .card, .modal-content { background-color: #111827 !important; color: #e5e7eb !important; border: 1px solid #2d3748; }
      .card-header { background: linear-gradient(180deg, #0b1220, #0f1724); border-bottom: 1px solid #1f2937; }
      .btn-outline-secondary { color: #cbd5e1; border-color: #334155; background: transparent; }
      .btn-outline-secondary:hover { background: rgba(255,255,255,0.03); }
      .form-check-input { background-color: #0b1220; border: 1px solid #475569; }
      .form-control { background-color: #0b1220; color: #e5e7eb; border-color: #334155; }
      .form-check-label { color: #e2e8f0; }
      .tmn-compact-input { width: 5.5rem; display: inline-block; margin-left: 8px; }
      .card-footer { background: transparent; border-top: 1px solid #1f2937; color: #9ca3af; min-height: 130px; height: 130px; overflow: hidden; }
      .card-body { min-height: 200px; }
      .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 2147483646; }
      .modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2147483647; display: none; }
      .modal.show { display: block; }
      .modal-dialog { max-width: 36rem; }
      .form-check.form-switch .form-check-input:checked {
        background-color: #10b981; border-color: #10b981;
      }
      :host(*) { all: unset; }
      .bi-gear::before { content: "⚙" !important; }
      .bi-x::before { content: "×" !important; }
      /* Prevent layout shift on timer updates */
      #tmn-health-monitor, #tmn-travel-timer, #tmn-oc-timer, #tmn-dtm-timer {
        min-width: 70px;
        display: inline-block;
      }
    `;
    shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.id = 'tmn-wrapper';
    wrapper.innerHTML = `
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center" id="tmn-drag-handle" style="cursor: grab;">
          <strong>TMN TDS Auto v14.04</strong>
          <div>
            <button id="tmn-lock-btn" class="btn btn-sm btn-outline-secondary me-1" title="Lock/Unlock position">ð</button>
            <button id="tmn-settings-btn" class="btn btn-sm btn-outline-secondary me-1" title="Settings">
              <i class="bi bi-gear"></i>
            </button>
            <button id="tmn-minimize-btn" class="btn btn-sm btn-outline-secondary" title="Minimize">-</button>
          </div>
        </div>

        <div class="card-body" id="tmn-panel-body">
          <div class="mb-2" style="display:grid; grid-template-columns: 1fr 1fr; gap: 4px 8px;">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-crime">
                <label class="form-check-label" for="tmn-auto-crime">Auto Crime</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-all">
                <label class="form-check-label" for="tmn-auto-all" id="tmn-auto-all-label" style="font-weight: 600;">ALL ON</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-gta">
                <label class="form-check-label" for="tmn-auto-gta">Auto GTA</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-health">
                <label class="form-check-label" for="tmn-auto-health">Auto Health</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-booze">
                <label class="form-check-label" for="tmn-auto-booze">Auto Booze</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-garage">
                <label class="form-check-label" for="tmn-auto-garage">Auto Garage</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-jail">
                <label class="form-check-label" for="tmn-auto-jail">Auto Jail</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-oc">
                <label class="form-check-label" for="tmn-auto-oc">🕵️ Auto OC</label>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="tmn-auto-dtm">
                <label class="form-check-label" for="tmn-auto-dtm">🚚 Auto DTM</label>
              </div>
              <div class="form-check form-switch" style="grid-column: 2;">
                <input class="form-check-input" type="checkbox" id="tmn-notify-ocdtm-ready">
                <label class="form-check-label" for="tmn-notify-ocdtm-ready">🔔 OC/DTM Alerts</label>
              </div>
          </div>
          <div id="tmn-player-badge" style="font-size:0.85rem;color:#9ca3af;">Player: ${state.playerName || 'Unknown'}</div>

          <!-- Status Grid: Health/Travel, OC/DTM, Protection -->
          <div class="mt-2 pt-2" style="border-top: 1px solid #1f2937; font-size: 0.85rem;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">Health:</span>
                <span id="tmn-health-monitor" style="font-weight: 500;">${cachedDisplayValues.health || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">Travel:</span>
                <span id="tmn-travel-timer" style="font-weight: 500;">${cachedDisplayValues.travel || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">OC:</span>
                <span id="tmn-oc-timer" style="font-weight: 500;">${cachedDisplayValues.oc || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
              <div class="d-flex align-items-center" style="width: 50%;">
                <span style="color:#9ca3af; width: 55px;">DTM:</span>
                <span id="tmn-dtm-timer" style="font-weight: 500;">${cachedDisplayValues.dtm || '<span style="color:#9ca3af;">●</span> --'}</span>
              </div>
            </div>
            <div class="d-flex align-items-center">
              <span style="color:#9ca3af; width: 55px;">Prot:</span>
              <span id="tmn-protection-timer" style="font-weight: 500;">${cachedDisplayValues.protection || '<span style="color:#9ca3af;">●</span> --'}</span>
            </div>
          </div>
        </div>

        <div class="card-footer small text-muted" id="tmn-status" style="min-height: 130px; height: 130px; overflow: hidden;">Status: Ready<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;<br>&nbsp;</div>
      </div>

      <div id="tmn-settings-modal" class="modal" role="dialog" aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Automation Settings</h5>
              <button id="tmn-modal-close" type="button" class="btn btn-sm btn-outline-secondary" title="Close"><i class="bi bi-x"></i></button>
            </div>
            <div class="modal-body">
              <h6 style="color:#cbd5e1;">Login Settings</h6>
              <div class="mb-3">
              <label class="form-label small">Username:</label>
              <input type="text" id="tmn-login-username" class="form-control form-control-sm mb-2"
              placeholder="Your TMN username" value="${LOGIN_CONFIG.USERNAME}">

              <label class="form-label small">Password:</label>
              <input type="text" id="tmn-login-password" class="form-control form-control-sm mb-2"
              placeholder="Your TMN password" value="${LOGIN_CONFIG.PASSWORD}">

  <div class="form-check form-switch">
    <input class="form-check-input" type="checkbox" id="tmn-auto-submit-enabled">
    <label class="form-check-label" for="tmn-auto-submit-enabled">Auto-submit after captcha</label>
  </div>
</div>

<hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Crime Options</h6>
              <div id="tmn-crime-options"></div>
              <div class="mb-3 mt-2">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-crime-interval" class="form-control form-control-sm tmn-compact-input" value="${config.crimeInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">GTA Options</h6>
              <div id="tmn-gta-options"></div>
              <div class="mb-3 mt-2">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-gta-interval" class="form-control form-control-sm tmn-compact-input" value="${config.gtaInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Booze Options</h6>
              <div class="mb-3">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-booze-interval" class="form-control form-control-sm tmn-compact-input" value="${config.boozeInterval}" min="1" max="999">
                </label>
              </div>
              <div class="mb-3">
                <label class="form-label">Buy Amount:
                  <input type="number" id="tmn-booze-buy-amount" class="form-control form-control-sm tmn-compact-input" value="${config.boozeBuyAmount}" min="1" max="300">
                </label>
              </div>
              <div class="mb-3">
                <label class="form-label">Sell Amount:
                  <input type="number" id="tmn-booze-sell-amount" class="form-control form-control-sm tmn-compact-input" value="${config.boozeSellAmount}" min="1" max="300">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Jailbreak Options</h6>
              <div class="mb-3">
                <label class="form-label">Interval (sec):
                  <input type="number" id="tmn-jail-interval" class="form-control form-control-sm tmn-compact-input" value="${config.jailbreakInterval}" min="1" max="999">
                </label>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Health Options</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Automatically buy health when below threshold (uses credits)</small>
                <div class="d-flex justify-content-between mb-2">
                  <div style="width: 48%;">
                    <label class="form-label small">Min Health Threshold (%):</label>
                    <input type="number" id="tmn-min-health" class="form-control form-control-sm" value="${config.minHealthThreshold}" min="1" max="99">
                    <small class="text-muted">Stop scripts & alert when below</small>
                  </div>
                  <div style="width: 48%;">
                    <label class="form-label small">Target Health (%):</label>
                    <input type="number" id="tmn-target-health" class="form-control form-control-sm" value="${config.targetHealth}" min="10" max="100">
                    <small class="text-muted">Buy health until reaching this</small>
                  </div>
                </div>
                <div class="d-flex align-items-center mb-2 p-2" style="background: rgba(0,0,0,0.2); border-radius: 4px;">
                  <span style="color:#9ca3af;">Current Health:</span>
                  <span id="tmn-settings-current-health" class="ms-2" style="font-weight: 500;"><span style="color:#10b981;">●</span> 100%</span>
                </div>
                <div class="mb-2 p-2" style="background: rgba(255,193,7,0.1); border: 1px solid rgba(255,193,7,0.3); border-radius: 4px;">
                  <small style="color: #ffc107;">⚠ When health drops below threshold:</small>
                  <ul class="mb-0 ps-3" style="font-size: 0.75rem; color: #9ca3af;">
                    <li>Telegram alert every 10 seconds (with health %)</li>
                    <li>If auto-buy disabled: ALL scripts will stop</li>
                    <li>If auto-buy enabled: Will use credits to restore health</li>
                  </ul>
                </div>
                <button id="tmn-test-health-alert" class="btn btn-sm btn-outline-warning">Test Health Alert</button>
              </div>

              <hr style="border-color:#1f2937">

              <h6 style="color:#cbd5e1;">Garage Options</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Auto-sell cars from garage (keeps VIP cars)</small>
                <label class="form-label">Interval (min):
                  <input type="number" id="tmn-garage-interval" class="form-control form-control-sm tmn-compact-input" value="${Math.round(config.garageInterval / 60)}" min="1" max="120">
                </label>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Telegram Notifications</h6>
              <div class="mb-3">
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-telegram-enabled">
                  <label class="form-check-label" for="tmn-telegram-enabled">Enable Telegram</label>
                </div>

                <label class="form-label small">Bot Token:</label>
                <input type="text" id="tmn-telegram-token" class="form-control form-control-sm mb-2"
                       placeholder="Get from @BotFather">

                <label class="form-label small">Chat ID:</label>
                <input type="text" id="tmn-telegram-chat" class="form-control form-control-sm mb-2"
                       placeholder="Get from @userinfobot">

                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-captcha">
                  <label class="form-check-label" for="tmn-notify-captcha">Notify on Script Check</label>
                </div>

                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-messages">
                  <label class="form-check-label" for="tmn-notify-messages">Notify on New Messages</label>
                </div>
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-sql">
                  <label class="form-check-label" for="tmn-notify-sql">Notify on SQL Script Check</label>
                </div>
                <div class="form-check mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-notify-logout">
                  <label class="form-check-label" for="tmn-notify-logout">Notify on Logout/Timeout</label>
                </div>

                <button id="tmn-test-telegram" class="btn btn-sm btn-outline-success">Test Connection</button>
              </div>

              <hr style="border-color:#1f2937">
              <div class="mb-3">
                <button id="tmn-view-stats" class="btn btn-sm btn-outline-info">View Detailed Stats</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Logout/Session Alerts</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Alert methods when logged out (works even in background tabs)</small>
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-logout-tab-flash">
                  <label class="form-check-label" for="tmn-logout-tab-flash">Tab Title Flash</label>
                </div>
                <small class="text-muted d-block mb-2">Flashes "🔴 LOGIN NEEDED" in browser tab title</small>
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-logout-browser-notify">
                  <label class="form-check-label" for="tmn-logout-browser-notify">Browser Notification</label>
                </div>
                <small class="text-muted d-block mb-2">Desktop notification popup (requires permission)</small>
                <button id="tmn-test-logout-alert" class="btn btn-sm btn-outline-info">Test Logout Alert</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Advanced Features</h6>
              <div class="mb-3">
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-auto-resume-enabled">
                  <label class="form-check-label" for="tmn-auto-resume-enabled">Auto-Resume after Script Check</label>
                </div>
                <small class="text-muted d-block mb-2">Automatically submit captcha and resume automation after script check</small>

                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="tmn-stats-collection-enabled">
                  <label class="form-check-label" for="tmn-stats-collection-enabled">Stats Collection</label>
                </div>
                <small class="text-muted d-block mb-2">Periodically collect game statistics from the stats page</small>

                <label class="form-label">Stats Collection Interval (sec):
                  <input type="number" id="tmn-stats-interval" class="form-control form-control-sm tmn-compact-input" value="${statsCollectionConfig.interval}" min="10" max="7200">
                </label>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Health & Timers</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Health monitor and activity timers</small>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">Health:</span>
                  <span id="tmn-settings-health" style="font-weight: 500;">Loading...</span>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">OC:</span>
                  <span id="tmn-settings-oc-timer" style="font-weight: 500;">Loading...</span>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">DTM:</span>
                  <span id="tmn-settings-dtm-timer" style="font-weight: 500;">Loading...</span>
                </div>
                <div class="d-flex align-items-center mb-2">
                  <span style="color:#9ca3af; width: 60px;">Travel:</span>
                  <span id="tmn-settings-travel-timer" style="font-weight: 500;">Loading...</span>
                </div>
                <button id="tmn-refresh-timers" class="btn btn-sm btn-outline-info">Refresh Timers</button>
              </div>

              <hr style="border-color:#1f2937">
              <h6 style="color:#cbd5e1;">Tab Management</h6>
              <div class="mb-3">
                <small class="text-muted d-block mb-2">Tab Manager prevents multiple tabs from running automation simultaneously</small>
                <div id="tmn-tab-status" class="small text-info">Status: Checking...</div>
              </div>

              <hr style="border-color:#1f2937">

              <div class="d-grid">
                <button id="tmn-clear-player" class="btn btn-sm btn-outline-danger me-2">Clear Player Data</button>
                <button id="tmn-reset-btn" class="btn btn-danger">Reset All Settings & Data</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="tmn-modal-backdrop" class="modal-backdrop" style="display:none;"></div>
    `;
    shadowRoot.appendChild(wrapper);

    // Fill crime & gta option lists
    const crimeContainer = shadowRoot.querySelector('#tmn-crime-options');
    crimeContainer.innerHTML = crimeOptions.map(c => `
      <div class="form-check">
        <input class="form-check-input crime-option" type="checkbox" id="crime-${c.id}" value="${c.id}">
        <label class="form-check-label" for="crime-${c.id}">${c.name}</label>
      </div>
    `).join('');

    const gtaContainer = shadowRoot.querySelector('#tmn-gta-options');
    gtaContainer.innerHTML = gtaOptions.map(g => `
      <div class="form-check">
        <input class="form-check-input gta-option" type="checkbox" id="gta-${g.id}" value="${g.id}">
        <label class="form-check-label" for="gta-${g.id}">${g.name}</label>
      </div>
    `).join('');

    // Initialize states in UI
    shadowRoot.querySelector("#tmn-auto-crime").checked = state.autoCrime;
    shadowRoot.querySelector("#tmn-auto-gta").checked = state.autoGTA;
    shadowRoot.querySelector("#tmn-auto-booze").checked = state.autoBooze;
    shadowRoot.querySelector("#tmn-auto-jail").checked = state.autoJail;
    shadowRoot.querySelector("#tmn-auto-health").checked = state.autoHealth;
    shadowRoot.querySelector("#tmn-auto-garage").checked = state.autoGarage;
    shadowRoot.querySelector("#tmn-auto-oc").checked = state.autoOC;
    shadowRoot.querySelector("#tmn-auto-dtm").checked = state.autoDTM;
    shadowRoot.querySelector("#tmn-notify-ocdtm-ready").checked = state.notifyOCDTMReady;

    // Initialize ALL ON/OFF toggle
    const allToggle = shadowRoot.querySelector("#tmn-auto-all");
    const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
    allToggle.checked = state.autoCrime && state.autoGTA && state.autoBooze && state.autoJail && state.autoHealth && state.autoGarage;
    allLabel.textContent = allToggle.checked ? 'ALL ON' : 'ALL OFF';
    allLabel.style.color = allToggle.checked ? '#10b981' : '#ef4444';

    shadowRoot.querySelectorAll('.crime-option').forEach(cb => {
      cb.checked = state.selectedCrimes.includes(parseInt(cb.value));
    });
    shadowRoot.querySelectorAll('.gta-option').forEach(cb => {
      cb.checked = state.selectedGTAs.includes(parseInt(cb.value));
    });

    // Hook up event listeners
    shadowRoot.querySelector("#tmn-auto-crime").addEventListener('change', e => {
      state.autoCrime = e.target.checked;
      saveState();
      updateStatus('Auto Crime ' + (state.autoCrime ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
      }
    });
    shadowRoot.querySelector("#tmn-auto-gta").addEventListener('change', e => {
      state.autoGTA = e.target.checked;
      saveState();
      updateStatus('Auto GTA ' + (state.autoGTA ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
      }
    });
    shadowRoot.querySelector("#tmn-auto-booze").addEventListener('change', e => {
      state.autoBooze = e.target.checked;
      saveState();
      updateStatus('Auto Booze ' + (state.autoBooze ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
      }
    });
    shadowRoot.querySelector("#tmn-auto-jail").addEventListener('change', e => {
      state.autoJail = e.target.checked;
      saveState();
      updateStatus('Auto Jail ' + (state.autoJail ? 'Enabled' : 'Disabled'));
      updateAllToggleState();

      if (state.autoCrime || state.autoGTA || state.autoBooze || state.autoJail) {
      }
    });
    shadowRoot.querySelector("#tmn-auto-health").addEventListener('change', e => {
      state.autoHealth = e.target.checked;
      saveState();
      updateStatus('Auto Health ' + (state.autoHealth ? 'Enabled' : 'Disabled'));
    });
    shadowRoot.querySelector("#tmn-auto-garage").addEventListener('change', e => {
      state.autoGarage = e.target.checked;
      saveState();
      updateStatus('Auto Garage ' + (state.autoGarage ? 'Enabled' : 'Disabled'));
    });
    shadowRoot.querySelector("#tmn-auto-oc").addEventListener('change', e => {
      state.autoOC = e.target.checked;
      saveState();
      updateStatus('🕵️ Auto OC ' + (state.autoOC ? 'Enabled' : 'Disabled'));
      if (state.autoOC) {
        startAutoOCMailWatcher();
      } else {
        stopAutoOCMailWatcher();
      }
    });
    shadowRoot.querySelector("#tmn-auto-dtm").addEventListener('change', e => {
      state.autoDTM = e.target.checked;
      saveState();
      updateStatus('🚚 Auto DTM ' + (state.autoDTM ? 'Enabled' : 'Disabled'));
      if (state.autoDTM) {
        startAutoDTMMailWatcher();
      } else {
        stopAutoDTMMailWatcher();
      }
    });

    shadowRoot.querySelector("#tmn-notify-ocdtm-ready").addEventListener('change', e => {
      state.notifyOCDTMReady = e.target.checked;
      saveState();
      updateStatus('🔔 OC/DTM Ready Alerts ' + (state.notifyOCDTMReady ? 'Enabled' : 'Disabled'));
      // Reset alert states so they can fire again
      if (e.target.checked) {
        localStorage.removeItem('tmnDTMReadyAlertState');
        localStorage.removeItem('tmnOCReadyAlertState');
      }
    });

    // ALL ON/OFF toggle functionality
    shadowRoot.querySelector("#tmn-auto-all").addEventListener('change', e => {
      const allEnabled = e.target.checked;

      state.autoCrime = allEnabled;
      state.autoGTA = allEnabled;
      state.autoBooze = allEnabled;
      state.autoJail = allEnabled;
      state.autoHealth = allEnabled;
      state.autoGarage = allEnabled;
      state.autoOC = allEnabled;
      state.autoDTM = allEnabled;

      shadowRoot.querySelector("#tmn-auto-crime").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-gta").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-booze").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-jail").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-health").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-garage").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-oc").checked = allEnabled;
      shadowRoot.querySelector("#tmn-auto-dtm").checked = allEnabled;

      const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
      allLabel.textContent = allEnabled ? 'ALL ON' : 'ALL OFF';
      allLabel.style.color = allEnabled ? '#10b981' : '#ef4444';

      saveState();
      updateStatus('All automation ' + (allEnabled ? 'Enabled' : 'Disabled'));

      // Start/stop OC/DTM watchers
      if (allEnabled) {
        startAutoOCMailWatcher();
        startAutoDTMMailWatcher();
      } else {
        stopAutoOCMailWatcher();
        stopAutoDTMMailWatcher();
      }

      if (allEnabled) {
      }
    });

    function updateAllToggleState() {
      const allToggle = shadowRoot.querySelector("#tmn-auto-all");
      const allLabel = shadowRoot.querySelector("#tmn-auto-all-label");
      const allEnabled = state.autoCrime && state.autoGTA && state.autoBooze && state.autoJail && state.autoHealth && state.autoGarage && state.autoOC && state.autoDTM;

      allToggle.checked = allEnabled;
      allLabel.textContent = allEnabled ? 'ALL ON' : 'ALL OFF';
      allLabel.style.color = allEnabled ? '#10b981' : '#ef4444';
    }

    shadowRoot.querySelectorAll('.crime-option').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.value);
        if (e.target.checked) {
          if (!state.selectedCrimes.includes(id)) state.selectedCrimes.push(id);
        } else {
          state.selectedCrimes = state.selectedCrimes.filter(x => x !== id);
        }
        saveState();
      });
    });

    shadowRoot.querySelectorAll('.gta-option').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = parseInt(e.target.value);
        if (e.target.checked) {
          if (!state.selectedGTAs.includes(id)) state.selectedGTAs.push(id);
        } else {
          state.selectedGTAs = state.selectedGTAs.filter(x => x !== id);
        }
        saveState();
      });
    });

    // Interval inputs
    shadowRoot.querySelector('#tmn-crime-interval').addEventListener('change', e => {
      config.crimeInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("crimeInterval", config.crimeInterval);
      e.target.value = config.crimeInterval;
    });
    shadowRoot.querySelector('#tmn-gta-interval').addEventListener('change', e => {
      config.gtaInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("gtaInterval", config.gtaInterval);
      e.target.value = config.gtaInterval;
    });
    shadowRoot.querySelector('#tmn-booze-interval').addEventListener('change', e => {
      config.boozeInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("boozeInterval", config.boozeInterval);
      e.target.value = config.boozeInterval;
    });
    shadowRoot.querySelector('#tmn-booze-buy-amount').addEventListener('change', e => {
      config.boozeBuyAmount = Math.max(1, Math.min(300, parseInt(e.target.value)));
      GM_setValue("boozeBuyAmount", config.boozeBuyAmount);
      e.target.value = config.boozeBuyAmount;
    });
    shadowRoot.querySelector('#tmn-booze-sell-amount').addEventListener('change', e => {
      config.boozeSellAmount = Math.max(1, Math.min(300, parseInt(e.target.value)));
      GM_setValue("boozeSellAmount", config.boozeSellAmount);
      e.target.value = config.boozeSellAmount;
    });
    shadowRoot.querySelector('#tmn-jail-interval').addEventListener('change', e => {
      config.jailbreakInterval = Math.max(1, Math.min(999, parseInt(e.target.value)));
      GM_setValue("jailbreakInterval", config.jailbreakInterval);
      e.target.value = config.jailbreakInterval;
    });

    // Garage interval setting
    shadowRoot.querySelector('#tmn-garage-interval').addEventListener('change', e => {
      const minutes = Math.max(1, Math.min(120, parseInt(e.target.value)));
      config.garageInterval = minutes * 60; // Convert minutes to seconds for internal use
      GM_setValue("garageInterval", config.garageInterval);
      e.target.value = minutes;
    });

    // Health threshold settings
    shadowRoot.querySelector('#tmn-min-health').addEventListener('change', e => {
      config.minHealthThreshold = Math.max(1, Math.min(99, parseInt(e.target.value)));
      GM_setValue("minHealthThreshold", config.minHealthThreshold);
      e.target.value = config.minHealthThreshold;
    });
    shadowRoot.querySelector('#tmn-target-health').addEventListener('change', e => {
      config.targetHealth = Math.max(10, Math.min(100, parseInt(e.target.value)));
      GM_setValue("targetHealth", config.targetHealth);
      e.target.value = config.targetHealth;
    });
    shadowRoot.querySelector('#tmn-test-health-alert').addEventListener('click', () => {
      if (telegramConfig.enabled && telegramConfig.botToken && telegramConfig.chatId) {
        sendTelegramMessage(
          '🧪 <b>TEST Health Alert</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Current Health: ${getHealthPercent()}%\n` +
          `Threshold: ${config.minHealthThreshold}%\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          'This is a test alert. If you receive this, health alerts are working!'
        );
        updateStatus('Test health alert sent to Telegram');
      } else {
        alert('Please configure Telegram notifications first (Bot Token and Chat ID required)');
      }
    });

    // Update current health display in settings periodically
    setInterval(() => {
      const healthEl = shadowRoot.querySelector('#tmn-settings-current-health');
      if (healthEl) {
        const health = getHealthPercent();
        const color = health >= 100 ? '#10b981' : health > config.minHealthThreshold ? '#f59e0b' : '#ef4444';
        healthEl.innerHTML = `<span style="color:${color};">●</span> ${health}%`;
      }
    }, 5000);

    shadowRoot.querySelector('#tmn-view-stats').addEventListener('click', () => {
      showDetailedStats();
    });

    // Reset ALL
    shadowRoot.querySelector('#tmn-reset-btn').addEventListener('click', resetStorage);

    // Clear player data (for new character)
    shadowRoot.querySelector('#tmn-clear-player').addEventListener('click', () => {
      if (confirm('Clear player name and cached data? Use this after starting a new character.')) {
        state.playerName = '';
        GM_setValue('playerName', '');
        localStorage.removeItem('tmnLastOCInviteMailId');
        localStorage.removeItem('tmnLastDTMInviteMailId');
        localStorage.removeItem('tmnLastOCAcceptTs');
        localStorage.removeItem('tmnLastDTMAcceptTs');
        localStorage.removeItem('tmnLastNotifiedMailId');
        localStorage.removeItem('tmnPendingOCHandle');
        localStorage.removeItem('tmnPendingDTMHandle');
        localStorage.removeItem('tmnPendingOCAcceptURL');
        localStorage.removeItem('tmnPendingDTMAcceptURL');
        localStorage.removeItem('tmnProtectionEndTs');
        localStorage.removeItem('tmnProtectionStatus');
        updateStatus('Player data cleared — reload to detect new player');
        if (shadowRoot.updatePlayerBadge) shadowRoot.updatePlayerBadge();
      }
    });

    // Drag/Lock UI position
    const lockBtn = shadowRoot.querySelector('#tmn-lock-btn');
    const dragHandle = shadowRoot.querySelector('#tmn-drag-handle');
    let uiLocked = GM_getValue('uiLocked', true);
    let uiPosX = GM_getValue('uiPosX', null);
    let uiPosY = GM_getValue('uiPosY', null);

    // Restore saved position
    if (uiPosX !== null && uiPosY !== null) {
      host.style.right = 'auto';
      host.style.left = uiPosX + 'px';
      host.style.top = uiPosY + 'px';
    }

    function updateLockState() {
      lockBtn.textContent = uiLocked ? '🔒' : '🔓';
      dragHandle.style.cursor = uiLocked ? 'default' : 'grab';
    }
    updateLockState();

    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uiLocked = !uiLocked;
      GM_setValue('uiLocked', uiLocked);
      updateLockState();
    });

    let isDragging = false, dragStartX, dragStartY, hostStartX, hostStartY;

    dragHandle.addEventListener('mousedown', (e) => {
      if (uiLocked || e.target.closest('button')) return;
      isDragging = true;
      dragHandle.style.cursor = 'grabbing';
      const rect = host.getBoundingClientRect();
      hostStartX = rect.left;
      hostStartY = rect.top;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      host.style.right = 'auto';
      host.style.left = (hostStartX + dx) + 'px';
      host.style.top = (hostStartY + dy) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      dragHandle.style.cursor = uiLocked ? 'default' : 'grab';
      const rect = host.getBoundingClientRect();
      uiPosX = rect.left;
      uiPosY = rect.top;
      GM_setValue('uiPosX', uiPosX);
      GM_setValue('uiPosY', uiPosY);
    });
    // Telegram Settings Event Listeners
    shadowRoot.querySelector("#tmn-telegram-enabled").checked = telegramConfig.enabled;
    shadowRoot.querySelector("#tmn-telegram-token").value = telegramConfig.botToken;
    shadowRoot.querySelector("#tmn-telegram-chat").value = telegramConfig.chatId;
    shadowRoot.querySelector("#tmn-notify-captcha").checked = telegramConfig.notifyCaptcha;
    shadowRoot.querySelector("#tmn-notify-messages").checked = telegramConfig.notifyMessages;

    shadowRoot.querySelector("#tmn-telegram-enabled").addEventListener('change', e => {
      telegramConfig.enabled = e.target.checked;
      saveTelegramConfig();
      updateStatus('Telegram notifications ' + (telegramConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-telegram-token").addEventListener('input', e => {
      telegramConfig.botToken = e.target.value.trim();
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-telegram-chat").addEventListener('input', e => {
      telegramConfig.chatId = e.target.value.trim();
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-captcha").addEventListener('change', e => {
      telegramConfig.notifyCaptcha = e.target.checked;
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-messages").addEventListener('change', e => {
      telegramConfig.notifyMessages = e.target.checked;
      saveTelegramConfig();
    });
    shadowRoot.querySelector("#tmn-notify-sql").checked = telegramConfig.notifySqlCheck;

    shadowRoot.querySelector("#tmn-notify-sql").addEventListener('change', e => {
      telegramConfig.notifySqlCheck = e.target.checked;
      saveTelegramConfig();
    });

    shadowRoot.querySelector("#tmn-notify-logout").checked = telegramConfig.notifyLogout;

    shadowRoot.querySelector("#tmn-notify-logout").addEventListener('change', e => {
      telegramConfig.notifyLogout = e.target.checked;
      saveTelegramConfig();
   });


    shadowRoot.querySelector("#tmn-test-telegram").addEventListener('click', testTelegramConnection);

    // Login Settings Event Listeners
    shadowRoot.querySelector("#tmn-login-username").addEventListener('input', e => {
      LOGIN_CONFIG.USERNAME = e.target.value.trim();
      GM_setValue('loginUsername', LOGIN_CONFIG.USERNAME);
    });

    shadowRoot.querySelector("#tmn-login-password").addEventListener('input', e => {
  LOGIN_CONFIG.PASSWORD = e.target.value.trim();
  GM_setValue('loginPassword', LOGIN_CONFIG.PASSWORD);
    });

    shadowRoot.querySelector("#tmn-auto-submit-enabled").checked = LOGIN_CONFIG.AUTO_SUBMIT_ENABLED;
    shadowRoot.querySelector("#tmn-auto-submit-enabled").addEventListener('change', e => {
  LOGIN_CONFIG.AUTO_SUBMIT_ENABLED = e.target.checked;
  GM_setValue('autoSubmitEnabled', LOGIN_CONFIG.AUTO_SUBMIT_ENABLED);
});

    // Advanced Features Event Listeners
    shadowRoot.querySelector("#tmn-auto-resume-enabled").checked = autoResumeConfig.enabled;
    shadowRoot.querySelector("#tmn-auto-resume-enabled").addEventListener('change', e => {
      autoResumeConfig.enabled = e.target.checked;
      saveAutoResumeConfig();
      updateStatus('Auto-resume ' + (autoResumeConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-stats-collection-enabled").checked = statsCollectionConfig.enabled;
    shadowRoot.querySelector("#tmn-stats-collection-enabled").addEventListener('change', e => {
      statsCollectionConfig.enabled = e.target.checked;
      saveStatsCollectionConfig();
      updateStatus('Stats collection ' + (statsCollectionConfig.enabled ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-stats-interval").addEventListener('change', e => {
      statsCollectionConfig.interval = Math.max(10, Math.min(7200, parseInt(e.target.value)));
      saveStatsCollectionConfig();
      e.target.value = statsCollectionConfig.interval;
    });

    // Logout Alert Settings
    shadowRoot.querySelector("#tmn-logout-tab-flash").checked = logoutAlertConfig.tabFlash;
    shadowRoot.querySelector("#tmn-logout-tab-flash").addEventListener('change', e => {
      logoutAlertConfig.tabFlash = e.target.checked;
      saveLogoutAlertConfig();
      updateStatus('Tab flash ' + (logoutAlertConfig.tabFlash ? 'enabled' : 'disabled'));
    });

    shadowRoot.querySelector("#tmn-logout-browser-notify").checked = logoutAlertConfig.browserNotify;
    shadowRoot.querySelector("#tmn-logout-browser-notify").addEventListener('change', e => {
      logoutAlertConfig.browserNotify = e.target.checked;
      saveLogoutAlertConfig();
      // Request notification permission when enabled
      if (logoutAlertConfig.browserNotify && Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          updateStatus('Browser notifications: ' + perm);
        });
      } else {
        updateStatus('Browser notify ' + (logoutAlertConfig.browserNotify ? 'enabled' : 'disabled'));
      }
    });

    shadowRoot.querySelector("#tmn-test-logout-alert").addEventListener('click', () => {
      updateStatus('Testing logout alerts...');
      triggerLogoutAlerts();
      // Stop tab flash after 5 seconds for the test
      setTimeout(() => {
        stopFlashTabTitle();
        updateStatus('Logout alert test complete');
      }, 5000);
    });

    // Timer Refresh Button
    shadowRoot.querySelector('#tmn-refresh-timers').addEventListener('click', async () => {
      const btn = shadowRoot.querySelector('#tmn-refresh-timers');
      btn.textContent = 'Refreshing...';
      btn.disabled = true;

      await collectOCDTMTimers();
      await fetchTravelTimerData();

      updateSettingsTimerDisplay();

      btn.textContent = 'Refresh Timers';
      btn.disabled = false;
      updateStatus('Timers refreshed');
    });

    // Function to update settings modal timer displays
    function updateSettingsTimerDisplay() {
      const dtmStatus = getDTMTimerStatus();
      const ocStatus = getOCTimerStatus();
      const travelStatus = getTravelTimerStatus();
      const currentStats = parseStatusBar();

      const dtmDisplay = formatTimerDisplay(dtmStatus, 'canDTM');
      const ocDisplay = formatTimerDisplay(ocStatus, 'canOC');
      const travelDisplay = formatTravelTimerDisplay(travelStatus);

      const settingsDtmEl = shadowRoot.querySelector('#tmn-settings-dtm-timer');
      const settingsOcEl = shadowRoot.querySelector('#tmn-settings-oc-timer');
      const settingsTravelEl = shadowRoot.querySelector('#tmn-settings-travel-timer');
      const settingsHealthEl = shadowRoot.querySelector('#tmn-settings-health');

      if (settingsDtmEl) {
        settingsDtmEl.innerHTML = `<span style="color:${dtmDisplay.color === 'green' ? '#10b981' : dtmDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${dtmDisplay.text}`;
      }
      if (settingsOcEl) {
        settingsOcEl.innerHTML = `<span style="color:${ocDisplay.color === 'green' ? '#10b981' : ocDisplay.color === 'red' ? '#ef4444' : '#9ca3af'};">●</span> ${ocDisplay.text}`;
      }
      if (settingsTravelEl) {
        const travelColor = travelDisplay.color === 'green' ? '#10b981' : travelDisplay.color === 'amber' ? '#f59e0b' : travelDisplay.color === 'red' ? '#ef4444' : '#9ca3af';
        settingsTravelEl.innerHTML = `<span style="color:${travelColor};">●</span> ${travelDisplay.text}`;
      }
      if (settingsHealthEl && currentStats) {
        const health = currentStats.health || 0;
        const healthColor = getHealthColor(health);
        settingsHealthEl.innerHTML = `<span style="color:${healthColor};">●</span> ${health}%`;
      }

    }

    // Update settings timer display periodically
    setInterval(updateSettingsTimerDisplay, 1000);

    // Update tab status display
    const tabStatusEl = shadowRoot.querySelector('#tmn-tab-status');
    if (tabStatusEl) {
      const updateTabStatus = () => {
        if (tabManager.isMasterTab) {
          tabStatusEl.textContent = 'Status: Master Tab (automation active)';
          tabStatusEl.className = 'small text-success';
        } else if (tabManager.hasActiveMaster()) {
          tabStatusEl.textContent = 'Status: Secondary Tab (waiting)';
          tabStatusEl.className = 'small text-warning';
        } else {
          tabStatusEl.textContent = 'Status: No active master tab';
          tabStatusEl.className = 'small text-info';
        }
      };
      updateTabStatus();
      setInterval(updateTabStatus, 5000);
    }

// Minimizer
    // Minimizer
    const minimizeBtn = shadowRoot.querySelector('#tmn-minimize-btn');
    const body = shadowRoot.querySelector('#tmn-panel-body');
    const footer = shadowRoot.querySelector('#tmn-status');

    // Apply saved minimized state on page load
    if (state.panelMinimized) {
      body.style.display = 'none';
      footer.style.display = 'none';
      minimizeBtn.textContent = '+';
    } else {
      body.style.display = 'block';
      footer.style.display = 'block';
      minimizeBtn.textContent = "-";
    }

    minimizeBtn.addEventListener('click', () => {
      state.panelMinimized = !state.panelMinimized;
      if (state.panelMinimized) {
        body.style.display = 'none';
        footer.style.display = 'none';
        minimizeBtn.textContent = '+';
      } else {
        body.style.display = 'block';
        footer.style.display = 'block';
        minimizeBtn.textContent = "-";
      }
      saveState();
    });

    // Settings modal controls
    const settingsBtn = shadowRoot.querySelector('#tmn-settings-btn');
    const modal = shadowRoot.querySelector('#tmn-settings-modal');
    const backdrop = shadowRoot.querySelector('#tmn-modal-backdrop');
    const modalClose = shadowRoot.querySelector('#tmn-modal-close');

    function showModal() {
      pauseAutomation();
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      backdrop.style.display = 'block';
    }
    function hideModal() {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      backdrop.style.display = 'none';
      saveState();
      updatePlayerBadge();
      resumeAutomation();
    }

    settingsBtn.addEventListener('click', showModal);
    modalClose.addEventListener('click', hideModal);
    backdrop.addEventListener('click', hideModal);

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (modal.classList.contains('show')) hideModal();
      }
    });

    function updatePlayerBadge() {
      const pb = shadowRoot.querySelector('#tmn-player-badge');
      if (pb) pb.innerHTML = `Player: ${state.playerName || 'Unknown'}`;
    }

    shadowRoot.updatePlayerBadge = updatePlayerBadge;
  }

  // ---------------------------
  // Detailed Stats Display
  // ---------------------------
  function showDetailedStats() {
    const currentStats = parseStatusBar();
    let statsHTML = `Current Status\n`;
    statsHTML += `Rank: ${currentStats ? currentStats.rank : 'N/A'} (${currentStats ? currentStats.rankPercent.toFixed(2) : '0.00'}%)\n`;
    statsHTML += `Money: $${currentStats ? currentStats.money.toLocaleString() : '0'}\n`;
    statsHTML += `Location: ${currentStats ? currentStats.city : 'N/A'}\n`;
    statsHTML += `Health: ${currentStats ? currentStats.health : '0'}%\n`;
    statsHTML += `FMJ: ${currentStats ? currentStats.fmj : '0'} | JHP: ${currentStats ? currentStats.jhp : '0'}\n`;
    statsHTML += `Credits: ${currentStats ? currentStats.credits : '0'}`;
    alert(statsHTML);
  }

  // ---------------------------
  // Main Loop (WITH JAIL CHECKS ON EVERY PAGE)
  // ---------------------------
async function mainLoop() {
    // Tab Manager: STRICT single-tab enforcement
    // Always re-check master status to handle tab switches
    const wasMaster = tabManager.isMasterTab;
    tabManager.checkMasterStatus();

    if (!tabManager.isMasterTab) {
      // Not the master tab - do NOT run any automation
      if (wasMaster) {
        console.log('[TMN] Lost master status - stopping automation in this tab');
      }
      updateStatus("⏸ Secondary tab - automation runs in first tab only");
      setTimeout(mainLoop, 3000); // Check less frequently as secondary
      return;
    }

    if (automationPaused) {
      setTimeout(mainLoop, 1800 + Math.floor(Math.random() * 1400));
      return;
    }

    // Check for Telegram notifications
    checkForCaptcha();
    checkForNewMessages();
    checkForSqlScriptCheck();
    checkForLogout();
    checkForLowHealth();

    // Check for stuck actions before anything else
    checkForNavigationInterruption();

    // Handle script check page with auto-resume
    if (isOnCaptchaPage()) {
      if (autoResumeConfig.enabled) {
        updateStatus("Script Check detected - Auto-resume monitoring...");
        localStorage.setItem(LS_SCRIPT_CHECK_ACTIVE, "true");
        startScriptCheckMonitor();
      } else {
        updateStatus("Script Check detected - All automation PAUSED");
      }
      setTimeout(mainLoop, 1800 + Math.floor(Math.random() * 1400));
      return;
    } else {
      // Clear script check flag if we're no longer on the page
      if (localStorage.getItem(LS_SCRIPT_CHECK_ACTIVE) === "true") {
        localStorage.removeItem(LS_SCRIPT_CHECK_ACTIVE);
        scriptCheckMonitorActive = false;
        console.log('[TMN] Script check cleared - resuming normal operation');
      }
    }

    // Check if stats collection is needed (low priority - runs between other actions)
    if (shouldCollectStats() && !state.isPerformingAction) {
      collectStatistics();
    }

    if (!state.playerName) {
      getPlayerName();
      setTimeout(mainLoop, 3000);
      return;
    }

    // CRITICAL: Check jail state on EVERY page, not just jail page
    checkJailStateOnAnyPage();

    // ===== PRIORITY 1: Handle pending OC/DTM page actions (we're already on the page) =====
    if (handleOCPageAfterAccept()) {
      setTimeout(mainLoop, 3000);
      return;
    }
    if (handleDTMPageAfterAccept()) {
      setTimeout(mainLoop, 3000);
      return;
    }

    // ===== PRIORITY 2: Process pending invite accept URLs (navigate to accept page) =====
    if (!state.inJail && !state.isPerformingAction) {
      const pendingDTMUrl = localStorage.getItem(LS_PENDING_DTM_URL);
      if (pendingDTMUrl && state.autoDTM) {
        console.log('[TMN] Processing pending DTM accept URL:', pendingDTMUrl);
        localStorage.removeItem(LS_PENDING_DTM_URL);
        localStorage.setItem('tmnPendingDTMHandle', 'true');
        localStorage.setItem('tmnPendingDTMHandleTs', String(Date.now()));
        sendTelegramMessage(
          '🚚 <b>DTM Invite Accepted!</b>\n\n' +
          `Player: ${state.playerName || 'Unknown'}\n` +
          `Time: ${new Date().toLocaleString()}\n\n` +
          '✅ Navigating to DTM page...'
        );
        state.isPerformingAction = true;
        saveState();
        updateStatus("🚚 Accepting DTM invite...");
        // Use URL path+search to avoid origin mismatch (www vs non-www)
        try {
          const dtmUrl = new URL(pendingDTMUrl);
          window.location.href = dtmUrl.pathname + dtmUrl.search;
        } catch {
          window.location.href = pendingDTMUrl.replace(/^https?:\/\/[^/]+/, '');
        }
        return;
      }

      const pendingOCUrl = localStorage.getItem(LS_PENDING_OC_URL);
      if (pendingOCUrl && state.autoOC) {
        // Don't navigate to OC page while in jail — wait for release
        if (state.inJail) {
          console.log('[TMN] Pending OC URL but in jail — waiting for release');
          // Don't remove the URL, keep it for when we're free
        } else {
          console.log('[TMN] Processing pending OC accept URL:', pendingOCUrl);
          localStorage.removeItem(LS_PENDING_OC_URL);
          localStorage.setItem('tmnPendingOCHandle', 'true');
          localStorage.setItem('tmnPendingOCHandleTs', String(Date.now()));
          let roleInfo = '';
          try {
            const u = new URL(pendingOCUrl);
            const pos = u.searchParams.get('pos');
            if (pos) roleInfo = `\nRole: ${pos.replace(/([A-Z])/g, ' $1').trim()}`;
          } catch {}
          sendTelegramMessage(
            '🕵️ <b>OC Invite Accepted!</b>\n\n' +
            `Player: ${state.playerName || 'Unknown'}\n` +
            `Time: ${new Date().toLocaleString()}${roleInfo}\n\n` +
            '✅ Navigating to OC page...'
          );
          state.isPerformingAction = true;
          saveState();
          updateStatus("🕵️ Accepting OC invite...");
          // Use URL path+search to avoid origin mismatch (www vs non-www)
          try {
            const ocUrl = new URL(pendingOCUrl);
            window.location.href = ocUrl.pathname + ocUrl.search;
          } catch {
            window.location.href = pendingOCUrl.replace(/^https?:\/\/[^/]+/, '');
          }
          return;
        }
      }
    }

    // ===== PRIORITY 3: Check mail for new invites (integrated into mainLoop, every 2 min) =====
    // CRITICAL: Mail checks run even in jail so invites are detected immediately
    if ((state.autoOC || state.autoDTM || (telegramConfig.enabled && telegramConfig.notifyMessages))
        && tabManager.isMasterTab) {
      const lastMailCheck = parseInt(localStorage.getItem('tmnLastMailCheckTs') || '0', 10);
      const mailCheckNow = Date.now();
      if (mailCheckNow - lastMailCheck > MAIL_CHECK_INTERVAL_MS) {
        localStorage.setItem('tmnLastMailCheckTs', String(mailCheckNow));
        try {
          await unifiedMailCheck();
        } catch (e) {
          console.warn('[TMN][MAIL] check error:', e);
        }
        // If mail check stored a pending URL, pick it up immediately
        if (localStorage.getItem(LS_PENDING_DTM_URL) || localStorage.getItem(LS_PENDING_OC_URL)) {
          setTimeout(mainLoop, 500);
          return;
        }
      }
    }

    // Check OC/DTM ready alerts (edge-triggered)
    try { checkOCDTMReadyAlerts(); } catch (e) {}

    // Check health and buy if needed (high priority - runs before other actions)
    if (state.autoHealth && !state.isPerformingAction) {
      checkAndBuyHealth();
      // If we're buying health, wait for it to complete
      if (state.buyingHealth) {
        setTimeout(mainLoop, 1800 + Math.floor(Math.random() * 1400));
        return;
      }
    }

    if (!state.isPerformingAction) {
      const currentPage = getCurrentPage();
      const now = Date.now();

      if (!state.autoCrime && !state.autoGTA && !state.autoBooze && !state.autoJail && !state.autoGarage && !state.autoHealth && !state.autoOC && !state.autoDTM) {
        if (now % 30000 < 2000) {
          updateStatus("Idle - no automation enabled");
        }
        setTimeout(mainLoop, 5000);
        return;
      }

      // Handle jail state properly
      if (state.inJail) {
        // When jailed, only check for release periodically
        if (now - state.lastJailCheck > config.jailCheckInterval * 1000) {
          state.lastJailCheck = now;
          saveState();
          updateStatus("In jail - checking for release...");
          safeNavigate('/authenticated/jail.aspx?' + Date.now());
        } else {
          const hasPendingDTM = localStorage.getItem(LS_PENDING_DTM_URL);
          const hasPendingOC = localStorage.getItem(LS_PENDING_OC_URL);
          const pendingInvite = hasPendingDTM ? ' (pending DTM invite)' : hasPendingOC ? ' (pending OC invite)' : '';
          updateStatus(`IN JAIL - waiting for release${state.pendingAction ? ` (will resume ${state.pendingAction})` : ''}${pendingInvite}`);
        }
      } else {
        // Player is free - proceed with actions
        const shouldDoCrime = state.autoCrime && (now - state.lastCrime >= config.crimeInterval * 1000);
        const shouldDoGTA = state.autoGTA && (now - state.lastGTA >= config.gtaInterval * 1000);
        const shouldDoBooze = state.autoBooze && (now - state.lastBooze >= config.boozeInterval * 1000);
        const shouldDoJailbreak = state.autoJail && (now - state.lastJail >= config.jailbreakInterval * 1000);
        const shouldDoGarage = state.autoGarage && (now - state.lastGarage >= config.garageInterval * 1000);

        // Check if we have a pending action from being jailed
        if (state.pendingAction) {
          updateStatus(`Resuming pending action: ${state.pendingAction}`);
          if (state.pendingAction === 'crime' && shouldDoCrime) {
            if (currentPage === 'crimes') {
              doCrime();
            } else {
              updateStatus("Navigating to crimes page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?' + Date.now());
            }
            return;
          } else if (state.pendingAction === 'gta' && shouldDoGTA) {
            if (currentPage === 'gta') {
              doGTA();
            } else {
              updateStatus("Navigating to GTA page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
            }
            return;
          } else if (state.pendingAction === 'booze' && shouldDoBooze) {
            if (currentPage === 'booze') {
              doBooze();
            } else {
              updateStatus("Navigating to booze page to resume pending action...");
              safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
            }
            return;
          } else {
            // Pending action no longer relevant
            state.pendingAction = '';
            saveState();
          }
        }

        // Garage runs on a separate longer interval, doesn't block other actions
        // Only navigate to garage if nothing else is due
        const garageOverdue = state.autoGarage && (now - state.lastGarage >= config.garageInterval * 1000);
        if (garageOverdue && currentPage === 'garage') {
          doGarage();
          // Don't return - let mainLoop continue to schedule next iteration
        }

        // Priority handling for overlapping timers
        if (shouldDoCrime && shouldDoGTA) {
          const crimeReadyTime = state.lastCrime + config.crimeInterval * 1000;
          const gtaReadyTime = state.lastGTA + config.gtaInterval * 1000;

          if (crimeReadyTime <= gtaReadyTime) {
            if (currentPage === 'crimes') {
              doCrime();
            } else {
              updateStatus("Navigating to crimes page (priority)...");
              safeNavigate('/authenticated/crimes.aspx?' + Date.now());
            }
          } else {
            if (currentPage === 'gta') {
              doGTA();
            } else {
              updateStatus("Navigating to GTA page (priority)...");
              safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
            }
          }
        } else if (shouldDoCrime) {
          if (currentPage === 'crimes') {
            doCrime();
          } else {
            updateStatus("Navigating to crimes page...");
            safeNavigate('/authenticated/crimes.aspx?' + Date.now());
          }
        } else if (shouldDoGTA) {
          if (currentPage === 'gta') {
            doGTA();
          } else {
            updateStatus("Navigating to GTA page...");
            safeNavigate('/authenticated/crimes.aspx?p=g&' + Date.now());
          }
        } else if (shouldDoBooze) {
          if (currentPage === 'booze') {
            doBooze();
          } else {
            updateStatus("Navigating to booze page...");
            safeNavigate('/authenticated/crimes.aspx?p=b&' + Date.now());
          }
        } else if (shouldDoJailbreak) {
          if (currentPage === 'jail') {
            doJailbreak();
          } else if (state.autoJail) {
            updateStatus("Navigating to jail page to break others out...");
            safeNavigate('/authenticated/jail.aspx?' + Date.now());
          }
        } else if (shouldDoGarage) {
          // Garage runs at lowest priority - only when nothing else is due
          if (currentPage === 'garage') {
            doGarage();
          } else {
            updateStatus("Navigating to garage (scheduled)...");
            safeNavigate('/authenticated/playerproperty.aspx?p=g&' + Date.now());
          }
        } else {
          const crimeRemaining = Math.ceil((config.crimeInterval * 1000 - (now - state.lastCrime)) / 1000);
          const gtaRemaining = Math.ceil((config.gtaInterval * 1000 - (now - state.lastGTA)) / 1000);
          const boozeRemaining = Math.ceil((config.boozeInterval * 1000 - (now - state.lastBooze)) / 1000);
          const jailRemaining = Math.ceil((config.jailbreakInterval * 1000 - (now - state.lastJail)) / 1000);
          const garageRemainingSec = Math.ceil((config.garageInterval * 1000 - (now - state.lastGarage)) / 1000);
          const garageRemainingMin = Math.ceil(garageRemainingSec / 60);

          if (crimeRemaining > 0 || gtaRemaining > 0 || boozeRemaining > 0 || jailRemaining > 0 || garageRemainingSec > 0) {
            const pendingInfo = state.pendingAction ? `, Pending: ${state.pendingAction}` : '';
            updateStatus(`Crime ${crimeRemaining}s, GTA ${gtaRemaining}s, Booze ${boozeRemaining}s, Jail ${jailRemaining}s, Garage ${garageRemainingMin}m${pendingInfo}`);
          }
        }
      }
    }

    setTimeout(mainLoop, 1800 + Math.floor(Math.random() * 1400));
  }

  // ---------------------------
  // Initialize
  // ---------------------------
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Initialize Tab Manager - check if we should be the master tab
    const isMaster = tabManager.checkMasterStatus();
    if (!isMaster && tabManager.hasActiveMaster()) {
      console.log('[TMN] Another tab is already running automation');
    }

    createScopedUI();

    // Start DTM/OC timer updates
    startTimerUpdates();

    // NOTE: Mail checking is now integrated into mainLoop (Priority 3) with localStorage-based cooldown.
    // No separate timer needed — survives page navigations unlike the old setInterval/setTimeout approach.

    // Show appropriate status based on tab status
    if (tabManager.isMasterTab) {
      updateStatus("TMN TDS Auto v14.04 loaded - Master tab (single tab mode)");
    } else {
      updateStatus("⏸ Secondary tab - close this tab or it will remain inactive");
    }

    // Check jail state immediately on startup
    checkJailStateOnAnyPage();

    // Handle page unload - release master status
    window.addEventListener('beforeunload', () => {
      tabManager.releaseMaster();
      stopUnifiedMailWatcher();
    });

    // Cross-tab synchronization for running state
    window.addEventListener('storage', (e) => {
      if (e.key === LS_TAB_MASTER) {
        // Master tab changed - recheck our status
        tabManager.checkMasterStatus();
      }
    });

    setTimeout(() => {
      state.lastJailCheck = 0;
      mainLoop();
    }, 1500);
  }

  init();

})();
