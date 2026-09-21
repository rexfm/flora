import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.FLORA_CONFIG;
const client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const status = document.querySelector('[data-admin-status]');
const queue = document.querySelector('[data-review-queue]');

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

async function decide(id, decision, reason = null) {
  const { error } = await client.rpc('review_sighting', { p_sighting_id: id, p_decision: decision, p_reason: reason });
  if (error) throw error;
}

async function reviewCard(sighting) {
  const article = document.createElement('article');
  article.className = 'review-card';
  if (sighting.photo_path) {
    const { data } = await client.storage.from('sighting-photos').createSignedUrl(sighting.photo_path, 900);
    if (data?.signedUrl) {
      const image = document.createElement('img');
      image.src = data.signedUrl;
      image.alt = `Evidence for ${sighting.food_text}`;
      article.append(image);
    }
  }
  const body = document.createElement('div');
  body.className = 'review-card-body';
  const label = document.createElement('p');
  label.className = 'kicker';
  label.textContent = 'Pending review';
  const title = document.createElement('h2');
  title.textContent = sighting.food_text;
  const meta = document.createElement('p');
  meta.className = 'review-meta';
  meta.textContent = [sighting.place_text, sighting.farm_text, sighting.price_text, formatDate(sighting.observed_at)].filter(Boolean).join(' · ');
  const analysis = Array.isArray(sighting.analysis) ? sighting.analysis[0] : sighting.analysis;
  const items = document.createElement('ul');
  items.className = 'review-items';
  (analysis?.identified_items || []).forEach((item) => {
    const row = document.createElement('li');
    row.textContent = [[item.name, item.variety].filter(Boolean).join(' · '), item.price_text].filter(Boolean).join(' — ');
    items.append(row);
  });
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const approve = document.createElement('button');
  approve.className = 'solid-button';
  approve.type = 'button';
  approve.textContent = 'Approve';
  const reject = document.createElement('button');
  reject.className = 'outline-button';
  reject.type = 'button';
  reject.textContent = 'Reject';
  actions.append(approve, reject);
  body.append(label, title, meta, items, actions);
  article.append(body);

  approve.addEventListener('click', async () => {
    approve.disabled = true;
    reject.disabled = true;
    try {
      await decide(sighting.id, 'confirmed');
      article.remove();
      status.textContent = 'Sighting approved and published.';
      if (!queue.children.length) status.textContent = 'Review queue clear.';
    } catch (error) {
      status.textContent = error.message;
      approve.disabled = false;
      reject.disabled = false;
    }
  });
  reject.addEventListener('click', async () => {
    const reason = window.prompt('What should the contributor fix? (optional)') || '';
    approve.disabled = true;
    reject.disabled = true;
    try {
      await decide(sighting.id, 'rejected', reason);
      article.remove();
      status.textContent = 'Sighting returned to the contributor.';
      if (!queue.children.length) status.textContent = 'Review queue clear.';
    } catch (error) {
      status.textContent = error.message;
      approve.disabled = false;
      reject.disabled = false;
    }
  });
  return article;
}

async function loadQueue() {
  const { data: sessionData } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (!user || user.is_anonymous) {
    status.innerHTML = 'Sign in with an admin account from <a href="account.html">Your account</a>.';
    return;
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    status.textContent = 'This account does not have admin access.';
    return;
  }
  const { data, error } = await client.from('sightings')
    .select('id,food_text,place_text,farm_text,price_text,photo_path,observed_at,analysis:sighting_analysis(identified_items)')
    .eq('status', 'pending_review')
    .order('submitted_at', { ascending: true });
  if (error) {
    status.textContent = 'The review queue could not be loaded.';
    return;
  }
  if (!data.length) {
    status.textContent = 'Review queue clear.';
    return;
  }
  status.textContent = `${data.length} submission${data.length === 1 ? '' : 's'} waiting.`;
  queue.replaceChildren(...await Promise.all(data.map(reviewCard)));
}

loadQueue();
