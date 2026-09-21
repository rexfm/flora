(() => {
  const GUIDES = {
    grape: { image: 'grapes.svg', name: 'California grapes', status: 'peak', statusLabel: 'Peak now', season: 'June–December', intro: 'Sweet, fragrant and abundant right now.', findTip: 'At farmers markets, ask about the variety—table grapes, muscats and perfumed slip-skin grapes eat very differently.', aliases: ['grape'], eat: ['Chill them for a crisp snack.', 'Roast clusters alongside salty cheese.', 'Freeze loose grapes for hot afternoons.'], grow: ['Grapevines want full sun and strong support.', 'Good airflow helps keep clusters healthy.', 'Prune while dormant to shape next year’s crop.'] },
    tomato: { image: 'tomatoes.svg', name: 'Heirloom tomatoes', status: 'peak', statusLabel: 'Peak now', season: 'June–October', intro: 'Juicy, aromatic and still at their summer best.', findTip: 'Farmers markets usually offer the widest variety. Choose tomatoes that smell leafy and feel heavy without leaking.', aliases: ['tomato'], eat: ['Salt thick slices just before eating.', 'Pair with olive oil, bread and soft cheese.', 'Cook very ripe fruit into a quick sauce.'], grow: ['Give plants at least six hours of sun.', 'Water the soil deeply rather than the leaves.', 'Support vines before the fruit becomes heavy.'] },
    apple: { image: 'apples.svg', name: 'New crop apples', status: 'starting', statusLabel: 'Starting', season: 'August–November', intro: 'Crisp new-crop fruit is arriving from California orchards.', findTip: 'Look for named varieties and a recent harvest date. Newly picked apples should feel dense and taut.', aliases: ['apple'], eat: ['Slice with sharp cheddar or tahini.', 'Bake firm varieties until just tender.', 'Keep chilled to preserve their snap.'], grow: ['Most apples need winter chill and a pollination partner.', 'Full sun improves color and sweetness.', 'Thin young fruit for larger, healthier apples.'] },
    pomegranate: { image: 'pomegranates.svg', name: 'Pomegranates', status: 'starting', statusLabel: 'Starting', season: 'September–January', intro: 'The first jewel-bright fruit of fall is appearing.', findTip: 'Choose fruit that feels heavy for its size. Cosmetic scuffs are fine; splits mean it should be eaten quickly.', aliases: ['pomegranate'], eat: ['Scatter arils over yogurt and salads.', 'Press the fruit for tart-sweet juice.', 'Pair with walnuts, herbs and grains.'], grow: ['Pomegranates thrive in heat and full sun.', 'Established plants handle dry summers well.', 'Harvest after the skin develops deep color.'] },
    pear: { image: 'pears.svg', name: 'California pears', status: 'peak', statusLabel: 'Peak now', season: 'July–December', intro: 'Floral, honeyed pears are in their prime.', findTip: 'Pears ripen from the inside out. Buy them firm, then check for a little give near the stem.', aliases: ['pear'], eat: ['Ripen at room temperature, then chill.', 'Slice with blue cheese and walnuts.', 'Poach firm pears with warm spices.'], grow: ['Pear trees prefer full sun and well-drained soil.', 'Many varieties need a compatible pollinator.', 'Pick mature fruit before it becomes soft on the tree.'] },
    'winter-squash': { image: 'squash.svg', name: 'Winter squash', status: 'starting', statusLabel: 'Starting', season: 'September–February', intro: 'Dense, sweet storage squash is beginning its long season.', findTip: 'Look for hard, matte skin and a dry stem. A heavy squash with no soft spots will keep longest.', aliases: ['squash', 'pumpkin'], eat: ['Roast wedges until deeply browned.', 'Purée into soup with something acidic.', 'Toast the cleaned seeds with salt.'], grow: ['Give sprawling vines plenty of warm space.', 'Water deeply while plants establish.', 'Cure mature squash before long storage.'] },
    peach: { image: 'peaches.svg', name: 'Late peaches', status: 'ending', statusLabel: 'Ending soon', season: 'May–September', intro: 'Fragrant late peaches are nearly gone for the year.', findTip: 'Use aroma as your guide and avoid squeezing. Ask whether the fruit was picked ripe.', aliases: ['peach', 'nectarine'], eat: ['Eat over the sink when perfectly ripe.', 'Grill halves and serve with cream.', 'Slice into tomatoes and basil.'], grow: ['Peaches need sun, winter chill and annual pruning.', 'Thin fruit early to prevent broken branches.', 'Harvest when the background color turns golden.'] },
    jujube: { image: 'jujubes.svg', name: 'Fresh jujubes', status: 'peak', statusLabel: 'Peak now', season: 'September–October', intro: 'Fresh jujubes are crisp like tiny apples now.', findTip: 'Asian grocers and farmers markets are strong bets. Green-brown fruit is crisp; fully brown fruit becomes sweeter and date-like.', aliases: ['jujube'], eat: ['Crunch fresh fruit straight from the bag.', 'Let it wrinkle for a denser sweetness.', 'Simmer dried fruit into tea or porridge.'], grow: ['Jujubes love heat and tolerate dry conditions.', 'Trees fruit best in full sun.', 'Watch for root suckers around established plants.'] },
    eggplant: { image: 'eggplant.svg', name: 'Eggplant', status: 'ending', statusLabel: 'Ending soon', season: 'June–October', intro: 'September warmth is still producing glossy eggplants.', findTip: 'Look for taut, shiny skin and a fresh green cap. Smaller fruit is often especially tender.', aliases: ['eggplant', 'aubergine'], eat: ['Salt only if you want to season it ahead.', 'Roast until completely silky inside.', 'Char the skin for smoky dips.'], grow: ['Eggplants need sustained heat and full sun.', 'Pick while the skin is still glossy.', 'Keep soil evenly moist during fruiting.'] }
  };

  const id = new URLSearchParams(window.location.search).get('id') || 'grape';
  const guide = GUIDES[id] || GUIDES.grape;
  document.body.dataset.produceId = id;
  document.title = `${guide.name} — Flora`;
  document.querySelector('[data-guide-image]').src = `../assets/${guide.image}`;
  document.querySelector('[data-guide-image]').alt = guide.name;
  document.querySelector('[data-guide-title]').textContent = guide.name;
  document.querySelector('[data-guide-intro]').textContent = guide.intro;
  document.querySelector('[data-guide-season]').textContent = guide.season;
  document.querySelector('[data-guide-find-tip]').textContent = guide.findTip;
  const status = document.querySelector('[data-guide-status]');
  status.className = `season-tag ${guide.status}`;
  status.textContent = guide.statusLabel;

  function renderNotes(target, notes) {
    target.replaceChildren(...notes.map((note, index) => {
      const article = document.createElement('article');
      const number = document.createElement('b');
      number.textContent = String(index + 1).padStart(2, '0');
      const copy = document.createElement('p');
      copy.textContent = note;
      article.append(number, copy);
      return article;
    }));
  }
  renderNotes(document.querySelector('[data-guide-eat]'), guide.eat);
  renderNotes(document.querySelector('[data-guide-grow]'), guide.grow);

  function matchesGuide(text) {
    const normalized = String(text || '').toLocaleLowerCase();
    return guide.aliases.some((alias) => normalized.includes(alias));
  }

  function formatDate(value) {
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function leadCard(lead) {
    const article = document.createElement('article');
    article.className = `find-result ${lead.kind}`;
    const evidence = document.createElement('p');
    evidence.className = `evidence ${lead.kind === 'sighting' ? 'verified' : 'indexed'}`;
    evidence.textContent = lead.kind === 'sighting' ? 'Seen in person' : 'Current market lead';
    const title = document.createElement('h3');
    title.textContent = lead.place;
    const item = document.createElement('p');
    item.className = 'find-result-item';
    item.textContent = lead.item;
    const meta = document.createElement('p');
    meta.className = 'find-result-meta';
    meta.textContent = [lead.farm, lead.price, lead.date].filter(Boolean).join(' · ');
    article.append(evidence, title, item, meta);
    if (lead.url) {
      const link = document.createElement('a');
      link.href = lead.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'View source ↗';
      article.append(link);
    }
    return article;
  }

  async function getClient() {
    const config = window.FLORA_CONFIG;
    if (!config?.onlineSightings) return null;
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    return createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  async function loadFinds() {
    const leads = [];
    try {
      const response = await fetch('../data/market-observations.json');
      const marketData = await response.json();
      const retailers = new Map(marketData.retailers.map((retailer) => [retailer.id, retailer]));
      marketData.observations.filter((observation) => observation.produceId === id).forEach((observation) => {
        const retailer = retailers.get(observation.retailerId);
        leads.push({ kind: 'flyer', place: retailer.name, item: observation.name, price: observation.offerText, date: retailer.validThrough ? `Through ${formatDate(retailer.validThrough)}` : formatDate(retailer.publishedAt), url: retailer.sourceUrl });
      });
    } catch (error) {
      // The structured static source is optional; sightings can still render.
    }

    const client = await getClient().catch(() => null);
    if (client) {
      const seenSightingIds = new Set();
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session) {
        const { data: privateSightings } = await client.from('sightings')
          .select('id,food_text,place_text,farm_text,price_text,observed_at,analysis:sighting_analysis(identified_items)')
          .order('observed_at', { ascending: false }).limit(40);
        (privateSightings || []).forEach((sighting) => {
          const analysis = Array.isArray(sighting.analysis) ? sighting.analysis[0] : sighting.analysis;
          const items = Array.isArray(analysis?.identified_items) ? analysis.identified_items : [];
          const matched = items.find((item) => matchesGuide([item.name, item.variety].filter(Boolean).join(' ')));
          if (matched || matchesGuide(sighting.food_text)) {
            seenSightingIds.add(sighting.id);
            leads.unshift({ kind: 'sighting', place: sighting.place_text || 'Location not named', farm: sighting.farm_text, item: matched ? [matched.name, matched.variety].filter(Boolean).join(' · ') : sighting.food_text, price: matched?.price_text || sighting.price_text, date: `Seen ${formatDate(sighting.observed_at)}` });
          }
        });
      }

      const { data: publicSightings } = await client.from('public_sightings')
        .select('id,produce_name,variety,place_text,farm_text,price_text,observed_at,identified_items')
        .order('observed_at', { ascending: false }).limit(40);
      (publicSightings || []).forEach((sighting) => {
        const items = Array.isArray(sighting.identified_items) ? sighting.identified_items : [];
        const matched = items.find((item) => matchesGuide([item.name, item.variety].filter(Boolean).join(' ')));
        const primaryName = [sighting.produce_name, sighting.variety].filter(Boolean).join(' · ');
        if (!seenSightingIds.has(sighting.id) && (matched || matchesGuide(primaryName))) {
          leads.unshift({ kind: 'sighting', place: sighting.place_text || 'Location not named', farm: sighting.farm_text, item: matched ? [matched.name, matched.variety].filter(Boolean).join(' · ') : primaryName, price: matched?.price_text || sighting.price_text, date: `Seen ${formatDate(sighting.observed_at)}` });
        }
      });
    }

    const target = document.querySelector('[data-guide-finds]');
    document.querySelector('[data-guide-evidence]').textContent = leads.length ? `${leads.length} current ${leads.length === 1 ? 'lead' : 'leads'}` : 'No current lead';
    if (leads.length) {
      target.replaceChildren(...leads.map(leadCard));
      return;
    }

    const empty = document.createElement('article');
    empty.className = 'find-result empty';
    const evidence = document.createElement('p');
    evidence.className = 'evidence indexed';
    evidence.textContent = 'Needs a fresh sighting';
    const heading = document.createElement('h3');
    heading.textContent = 'No verified nearby lead yet.';
    const copy = document.createElement('p');
    copy.textContent = 'If you find it, add a dated photo so the next person knows where to look.';
    const link = document.createElement('a');
    link.href = '../index.html#spot';
    link.textContent = 'Add a sighting →';
    empty.append(evidence, heading, copy, link);
    target.replaceChildren(empty);
  }

  loadFinds();
})();
