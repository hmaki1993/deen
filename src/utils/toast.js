/**
 * Lightweight, non-blocking Toast notification helper.
 * Replaces native WebView alert() dialogs that freeze JS execution.
 */

let toastTimer = null;

export function showToast(message, type = 'info', duration = 2800) {
  if (!message) return;

  let toast = document.getElementById('deen-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'deen-toast';
    toast.className = 'deen-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `deen-toast deen-toast--${type} deen-toast--visible`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('deen-toast--visible');
  }, duration);
}
