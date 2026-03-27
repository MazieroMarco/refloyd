import { buildBackendUrl } from '../config.js';

export function renderAuthGate(container, { providerName, errorMessage } = {}) {
  container.innerHTML = `
    <section class="auth-gate">
      <div class="auth-gate-card">
        <div class="auth-gate-grid">
          <div class="auth-gate-panel auth-gate-panel-primary">
            <span class="auth-gate-kicker">Access</span>
            <h1>Sign in before entering Re:Floyd</h1>
            <p class="auth-gate-copy">
              Single sign-on now protects the app itself. Once you are in, you will still choose any band profile inside Re:Floyd just like before.
            </p>
            <div class="auth-gate-actions">
              <button class="add-member-btn auth-gate-login-btn" type="button" id="auth-login-btn">
                Continue with Google or Microsoft
              </button>
              <span class="auth-gate-meta">Authentication only controls access. Profiles stay independent.</span>
            </div>
            <p class="auth-gate-error" id="auth-gate-error" hidden></p>
          </div>
          <div class="auth-gate-panel">
            <h2>How it works</h2>
            <div class="auth-gate-step-list">
              <div class="auth-gate-step">
                <span class="auth-gate-step-number">1</span>
                <p>Use your Google or Microsoft account to unlock the app.</p>
              </div>
              <div class="auth-gate-step">
                <span class="auth-gate-step-number">2</span>
                <p>Choose whichever rehearsal profile you want to use.</p>
              </div>
              <div class="auth-gate-step">
                <span class="auth-gate-step-number">3</span>
                <p>Switch profiles whenever needed without changing your signed-in account.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const loginButton = container.querySelector('#auth-login-btn');
  const errorElement = container.querySelector('#auth-gate-error');

  if (errorMessage) {
    errorElement.hidden = false;
    errorElement.textContent = errorMessage;
  }

  loginButton.addEventListener('click', () => {
    const returnTo = window.location.hash || '#songs';
    window.location.href = buildBackendUrl(
      `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`
    );
  });
}

function escapeHtml(text) {
  const element = document.createElement('div');
  element.textContent = text;
  return element.innerHTML;
}
