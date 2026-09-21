import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.FLORA_CONFIG;
const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const loading = document.querySelector('[data-account-loading]');
const signin = document.querySelector('[data-account-signin]');
const dashboard = document.querySelector('[data-account-dashboard]');
const status = document.querySelector('[data-account-status]');
const list = document.querySelector('[data-submission-list]');

function show(element) { element.hidden = false; }
function hide(element) { element.hidden = true; }

function statusLabel(value) {
  return ({ draft: 'Private draft', pending_analysis: 'Identifying photo', pending_review: 'Awaiting review', confirmed: 'Published', rejected: 'Needs changes' })[value] || value;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

async function submitRequestedSighting() {
  const id = new URLSearchParams(window.location.search).get('submit');
  if (!id) return null;
  const { error } = await client.rpc('submit_sighting_for_review', { p_sighting_id: id });
  if (error) return error.message;
  history.replaceState({}, '', 'account.html');
  return 'Your sighting was submitted for admin review.';
}

async function loadSubmissions() {
  const { data, error } = await client.from('sightings')
    .select('id,food_text,place_text,farm_text,price_text,status,observed_at,rejection_reason')
    .order('observed_at', { ascending: false });
  if (error) {
    list.textContent = 'Your submissions could not be loaded.';
    return;
  }
  if (!data.length) {
    list.innerHTML = '<article class="submission-empty"><h3>No sightings yet.</h3><p>Your field notes will appear here.</p></article>';
    return;
  }
  list.replaceChildren(...data.map((sighting) => {
    const article = document.createElement('article');
    article.className = `submission-row status-${sighting.status}`;
    const copy = document.createElement('div');
    const badge = document.createElement('p');
    badge.className = 'submission-status';
    badge.textContent = statusLabel(sighting.status);
    const title = document.createElement('h3');
    title.textContent = sighting.food_text;
    const meta = document.createElement('p');
    meta.textContent = [sighting.place_text, sighting.farm_text, sighting.price_text, formatDate(sighting.observed_at)].filter(Boolean).join(' · ');
    copy.append(badge, title, meta);
    if (sighting.rejection_reason) {
      const reason = document.createElement('p');
      reason.className = 'rejection-note';
      reason.textContent = sighting.rejection_reason;
      copy.append(reason);
    }
    article.append(copy);
    return article;
  }));
}

async function render() {
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  hide(loading);
  if (!user || user.is_anonymous) {
    show(signin);
    hide(dashboard);
    document.querySelector('[data-account-signin-title]').textContent = user ? 'Keep this field notebook' : 'Sign in to Flora';
    document.querySelector('[data-account-signin-copy]').textContent = user
      ? 'Verify your email to keep this device’s sightings and submit them for review.'
      : 'Flora will email you a secure sign-in link—no password needed.';
    return;
  }

  hide(signin);
  show(dashboard);
  document.querySelector('[data-account-email]').textContent = user.email || 'Flora member';
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role === 'admin') show(document.querySelector('[data-admin-link]'));
  const submissionMessage = await submitRequestedSighting();
  if (submissionMessage) {
    const notice = document.createElement('p');
    notice.className = 'account-notice';
    notice.textContent = submissionMessage;
    dashboard.prepend(notice);
  }
  await loadSubmissions();
}

document.querySelector('[data-account-form]')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = new FormData(form).get('email').trim();
  const submitId = new URLSearchParams(window.location.search).get('submit');
  const redirect = new URL('account.html', window.location.href);
  if (submitId) redirect.searchParams.set('submit', submitId);
  status.textContent = 'Sending your secure link…';
  const { data: sessionData } = await client.auth.getSession();
  const result = sessionData.session?.user?.is_anonymous
    ? await client.auth.updateUser({ email }, { emailRedirectTo: redirect.href })
    : await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.href } });
  status.textContent = result.error ? result.error.message : 'Check your email, then open the Flora link on this device.';
});

document.querySelector('[data-sign-out]')?.addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.reload();
});

render();
