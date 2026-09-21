(() => {
  const SIGHTINGS_DB = 'flora-local';
  const SIGHTINGS_STORE = 'sightings';
  const MAX_PHOTO_EDGE = 1600;
  const CURATED_PLACES = [
    'Whole Foods Market',
    'Trader Joe’s',
    '99 Ranch Market',
    'Cardenas Markets',
    'Berkeley Bowl',
    'Monterey Market',
    'Rainbow Grocery',
    'Alemany Farmers’ Market',
    'Ferry Plaza Farmers Market',
    'Grand Lake Farmers Market'
  ];
  let supabaseClientPromise = null;

  function getSupabaseClient() {
    const config = window.FLORA_CONFIG;
    if (!config?.onlineSightings || !config.supabaseUrl || !config.supabasePublishableKey) return null;
    if (!supabaseClientPromise) {
      supabaseClientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
        .then(({ createClient }) => createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true }
        }));
    }
    return supabaseClientPromise;
  }

  function imageFromFile(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo could not be opened')); };
      image.src = url;
    });
  }

  async function makeMetadataFreePhoto(file) {
    if (!file) return null;
    const image = await imageFromFile(file);
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
    if (!blob) throw new Error('Photo could not be prepared');
    return new File([blob], 'flora-sighting.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  }

  async function readJpegGps(file) {
    if (!file || !/jpe?g/i.test(file.type)) return null;
    try {
      const view = new DataView(await file.arrayBuffer());
      if (view.getUint16(0) !== 0xffd8) return null;
      let markerOffset = 2;
      while (markerOffset + 4 < view.byteLength) {
        if (view.getUint8(markerOffset) !== 0xff) break;
        const marker = view.getUint8(markerOffset + 1);
        const segmentLength = view.getUint16(markerOffset + 2);
        if (marker === 0xe1 && segmentLength >= 14 && view.getUint32(markerOffset + 4) === 0x45786966) {
          const tiff = markerOffset + 10;
          const littleEndian = view.getUint16(tiff) === 0x4949;
          const u16 = (offset) => view.getUint16(offset, littleEndian);
          const u32 = (offset) => view.getUint32(offset, littleEndian);
          if (u16(tiff + 2) !== 42) return null;

          const findEntry = (ifdOffset, wantedTag) => {
            const entryCount = u16(ifdOffset);
            for (let index = 0; index < entryCount; index += 1) {
              const entry = ifdOffset + 2 + (index * 12);
              if (u16(entry) === wantedTag) return entry;
            }
            return null;
          };
          const primaryIfd = tiff + u32(tiff + 4);
          const gpsPointerEntry = findEntry(primaryIfd, 0x8825);
          if (!gpsPointerEntry) return null;
          const gpsIfd = tiff + u32(gpsPointerEntry + 8);
          const latitudeEntry = findEntry(gpsIfd, 0x0002);
          const longitudeEntry = findEntry(gpsIfd, 0x0004);
          if (!latitudeEntry || !longitudeEntry) return null;

          const asciiValue = (entry) => String.fromCharCode(view.getUint8(entry + 8));
          const coordinateValue = (entry) => {
            const valuesOffset = tiff + u32(entry + 8);
            const parts = [0, 1, 2].map((index) => {
              const numerator = u32(valuesOffset + (index * 8));
              const denominator = u32(valuesOffset + (index * 8) + 4);
              return denominator ? numerator / denominator : 0;
            });
            return parts[0] + (parts[1] / 60) + (parts[2] / 3600);
          };
          const latitudeRef = findEntry(gpsIfd, 0x0001);
          const longitudeRef = findEntry(gpsIfd, 0x0003);
          const latitude = coordinateValue(latitudeEntry) * (latitudeRef && asciiValue(latitudeRef) === 'S' ? -1 : 1);
          const longitude = coordinateValue(longitudeEntry) * (longitudeRef && asciiValue(longitudeRef) === 'W' ? -1 : 1);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
          return { latitude, longitude, accuracy: null };
        }
        if (segmentLength < 2) break;
        markerOffset += segmentLength + 2;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function openSightingsDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SIGHTINGS_DB, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SIGHTINGS_STORE)) {
          database.createObjectStore(SIGHTINGS_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeSighting(sighting) {
    const database = await openSightingsDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(SIGHTINGS_STORE, 'readwrite');
      transaction.objectStore(SIGHTINGS_STORE).put(sighting);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    });
  }

  const cards = [...document.querySelectorAll('[data-status]')];
  const chips = [...document.querySelectorAll('[data-filter]')];
  const emptyState = document.querySelector('[data-empty-state]');

  function filterCards(filter) {
    let visible = 0;
    cards.forEach((card) => {
      const show = filter === 'all' || card.dataset.status === filter;
      card.hidden = !show;
      if (show) visible += 1;
    });
    chips.forEach((chip) => {
      const selected = chip.dataset.filter === filter;
      chip.classList.toggle('is-active', selected);
      chip.setAttribute('aria-pressed', String(selected));
    });
    emptyState.hidden = visible !== 0;
  }

  chips.forEach((chip) => chip.addEventListener('click', () => filterCards(chip.dataset.filter)));
  document.querySelector('[data-show-all]')?.addEventListener('click', () => filterCards('all'));
  document.querySelectorAll('[data-filter-link]').forEach((link) => {
    link.addEventListener('click', () => filterCards(link.dataset.filterLink));
  });

  const marketGrid = document.querySelector('[data-market-grid]');
  let marketCards = [...document.querySelectorAll('[data-market]')];
  const marketChips = [...document.querySelectorAll('[data-market-filter]')];
  let activeMarketFilter = 'all';

  function applyMarketFilter(market) {
    activeMarketFilter = market;
    marketCards.forEach((card) => {
      card.hidden = market !== 'all' && card.dataset.market !== market;
    });
    marketChips.forEach((option) => {
      const selected = option.dataset.marketFilter === market;
      option.classList.toggle('is-active', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
  }

  marketChips.forEach((chip) => {
    chip.addEventListener('click', () => applyMarketFilter(chip.dataset.marketFilter));
  });

  function renderMarketSightingCard(sighting) {
    const card = document.createElement('article');
    card.className = 'market-card community';
    card.dataset.market = 'community';
    card.dataset.personalSighting = sighting.id;
    if (sighting.photoUrl) {
      const visual = document.createElement('figure');
      visual.className = 'market-card-photo';
      const image = document.createElement('img');
      image.src = sighting.photoUrl;
      image.alt = `Photo of ${sighting.food_text}`;
      image.loading = 'lazy';
      visual.append(image);
      card.append(visual);
    }

    const dateText = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(sighting.observed_at));
    const brand = document.createElement('div');
    brand.className = 'market-brand';
    const mark = document.createElement('span');
    mark.className = 'market-mark';
    mark.textContent = 'S';
    const brandCopy = document.createElement('div');
    const place = document.createElement('strong');
    place.textContent = sighting.place_text || 'Community sighting';
    const date = document.createElement('small');
    date.textContent = `Seen ${dateText}`;
    brandCopy.append(place, date);
    brand.append(mark, brandCopy);

    const evidence = document.createElement('p');
    evidence.className = 'evidence community-evidence';
    evidence.textContent = sighting.status === 'pending_analysis' ? 'Identifying photo' : 'Your sighting';
    const title = document.createElement('h3');
    title.textContent = sighting.food_text;
    const price = document.createElement('p');
    price.className = 'market-price';
    const priceValue = document.createElement('strong');
    priceValue.textContent = sighting.price_text || 'Price not noted';
    const priceSource = document.createElement('span');
    priceSource.textContent = 'Observed in person';
    price.append(priceValue, priceSource);
    const note = document.createElement('p');
    note.className = 'regular-price';
    note.textContent = 'A real market find from your field notes.';
    const source = document.createElement('span');
    source.className = 'market-source-note';
    source.textContent = 'Photo sighting';
    card.append(brand, evidence, title, price, note, source);
    return card;
  }

  async function loadMarketSightings() {
    if (!marketGrid) return false;
    const client = await getSupabaseClient();
    if (!client) return false;
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) return false;

    const { data, error } = await client.from('sightings')
      .select('id,food_text,place_text,price_text,photo_path,status,observed_at')
      .order('observed_at', { ascending: false })
      .limit(12);
    if (error) return false;

    const sightings = await Promise.all((data || []).map(async (sighting) => {
      if (!sighting.photo_path) return { ...sighting, photoUrl: null };
      const { data: signed } = await client.storage.from('sighting-photos').createSignedUrl(sighting.photo_path, 3600);
      return { ...sighting, photoUrl: signed?.signedUrl || null };
    }));

    const flyerCards = [...marketGrid.querySelectorAll('[data-market]:not([data-personal-sighting])')];
    const sightingCards = sightings.map(renderMarketSightingCard);
    const mixedCards = [];
    let sightingIndex = 0;
    flyerCards.forEach((card, index) => {
      mixedCards.push(card);
      if ((index + 1) % 2 === 0 && sightingIndex < sightingCards.length) {
        mixedCards.push(sightingCards[sightingIndex]);
        sightingIndex += 1;
      }
    });
    mixedCards.push(...sightingCards.slice(sightingIndex));
    marketGrid.replaceChildren(...mixedCards);
    marketCards = [...marketGrid.querySelectorAll('[data-market]')];
    const communityFilter = document.querySelector('[data-community-filter]');
    if (communityFilter) communityFilter.hidden = sightings.length === 0;
    applyMarketFilter(activeMarketFilter);
    return sightings.length > 0;
  }

  const produceDialog = document.querySelector('[data-produce-dialog]');
  document.querySelectorAll('[data-produce-detail]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (typeof produceDialog.showModal !== 'function') return;
      event.preventDefault();
      produceDialog.querySelector('[data-produce-dialog-title]').textContent = link.querySelector('h3').textContent;
      produceDialog.querySelector('[data-produce-dialog-copy]').textContent = link.dataset.produceDetail;
      produceDialog.showModal();
    });
  });

  const spotDialog = document.querySelector('[data-spot-dialog]');
  document.querySelectorAll('[data-spot-button]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!spotDialog) return;
      if (typeof spotDialog.showModal === 'function') spotDialog.showModal();
      else spotDialog.setAttribute('open', '');
    });
  });

  let selectedPhoto = null;
  let previewUrl = null;
  const photoInputs = [...document.querySelectorAll('[data-photo-camera], [data-photo-library]')];
  const photoPreview = document.querySelector('[data-photo-preview]');
  const photoPreviewImage = document.querySelector('[data-photo-preview-image]');
  const photoName = document.querySelector('[data-photo-name]');
  const photoActions = document.querySelector('[data-photo-actions]');
  const formStatus = document.querySelector('[data-form-status]');
  const locationButton = document.querySelector('[data-use-location]');
  const locationLabel = document.querySelector('[data-location-label]');
  const placeInput = spotDialog?.querySelector('[name="place"]');
  const placeSuggestions = document.querySelector('[data-place-suggestions]');
  const analysisResult = document.querySelector('[data-analysis-result]');
  const analysisItems = document.querySelector('[data-analysis-items]');
  const analysisPlace = document.querySelector('[data-analysis-place]');
  const sightingEditor = document.querySelector('[data-sighting-editor]');
  const sightingComplete = document.querySelector('[data-sighting-complete]');
  const completeTitle = document.querySelector('[data-complete-title]');
  const completeMeta = document.querySelector('[data-complete-meta]');
  const completePhoto = document.querySelector('[data-complete-photo]');
  const completeImage = document.querySelector('[data-complete-image]');
  let selectedLocation = null;
  let selectedLocationSource = null;
  let nearbyPlaces = [];
  let currentSightingId = null;
  let sightingPhase = 'capture';

  function setFormStatus(message, kind = '') {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle('is-error', kind === 'error');
    formStatus.classList.toggle('is-success', kind === 'success');
  }

  function renderPlaceSuggestions(query = '') {
    if (!placeInput || !placeSuggestions) return;
    const normalized = query.trim().toLocaleLowerCase();
    const candidates = [...new Set([...nearbyPlaces, ...CURATED_PLACES])]
      .filter((name) => !normalized || name.toLocaleLowerCase().includes(normalized))
      .slice(0, 6);
    placeSuggestions.replaceChildren(...candidates.map((name) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', () => {
        placeInput.value = name;
        placeSuggestions.hidden = true;
        placeInput.setAttribute('aria-expanded', 'false');
      });
      item.append(button);
      return item;
    }));
    placeSuggestions.hidden = candidates.length === 0;
    placeInput.setAttribute('aria-expanded', String(candidates.length > 0));
  }

  placeInput?.addEventListener('focus', () => renderPlaceSuggestions(placeInput.value));
  placeInput?.addEventListener('input', () => renderPlaceSuggestions(placeInput.value));
  placeInput?.addEventListener('blur', () => setTimeout(() => {
    if (placeSuggestions) placeSuggestions.hidden = true;
    placeInput.setAttribute('aria-expanded', 'false');
  }, 120));

  async function findNearbyPlaces(location) {
    const client = await getSupabaseClient();
    if (!client) return [];
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData.session) {
      const { error: authError } = await client.auth.signInAnonymously();
      if (authError) return [];
    }
    const { data, error } = await client.rpc('nearby_places', {
      longitude: location.longitude,
      latitude: location.latitude,
      radius_meters: 1500
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((place) => place.name).filter(Boolean);
  }

  locationButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setFormStatus('Location is not available in this browser.', 'error');
      return;
    }
    locationLabel.textContent = 'Finding location…';
    navigator.geolocation.getCurrentPosition(async (position) => {
      selectedLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy)
      };
      selectedLocationSource = 'browser_gps';
      locationButton.classList.add('is-ready');
      locationLabel.textContent = `Location added · about ${selectedLocation.accuracy} m`;
      nearbyPlaces = await findNearbyPlaces(selectedLocation);
      if (!placeInput.value && nearbyPlaces.length) placeInput.value = nearbyPlaces[0];
      setFormStatus(nearbyPlaces.length
        ? `Location added. Suggested ${nearbyPlaces[0]} from Flora’s place directory.`
        : 'Location added privately. Start typing to choose the market.');
    }, () => {
      selectedLocation = null;
      selectedLocationSource = null;
      locationLabel.textContent = 'Try current location again';
      setFormStatus('Location was not added. You can still share the sighting.', 'error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });

  function renderAnalysis(analysis) {
    if (!analysisResult || !analysisItems || !analysis?.items?.length) return;
    analysisItems.replaceChildren(...analysis.items.map((item) => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = [item.name, item.variety].filter(Boolean).join(' · ');
      const price = document.createElement('span');
      price.textContent = item.price_text || 'Price not visible';
      row.append(name, price);
      return row;
    }));
    analysisPlace.textContent = analysis.place_name ? `Place seen in photo: ${analysis.place_name}` : '';
    analysisResult.hidden = false;
  }

  function clearPhoto() {
    selectedPhoto = null;
    if (selectedLocationSource === 'photo_exif') {
      selectedLocation = null;
      selectedLocationSource = null;
      nearbyPlaces = [];
      locationButton?.classList.remove('is-ready');
      if (locationLabel) locationLabel.textContent = 'Add current location';
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoInputs.forEach((input) => { input.value = ''; });
    if (photoPreviewImage) photoPreviewImage.removeAttribute('src');
    if (photoPreview) photoPreview.hidden = true;
    if (photoActions) photoActions.hidden = false;
  }

  photoInputs.forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setFormStatus('Choose a photo or image file.', 'error');
        input.value = '';
        return;
      }
      if (selectedLocationSource === 'photo_exif') {
        selectedLocation = null;
        selectedLocationSource = null;
        nearbyPlaces = [];
        locationButton?.classList.remove('is-ready');
        if (locationLabel) locationLabel.textContent = 'Add current location';
      }
      selectedPhoto = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      photoPreviewImage.src = previewUrl;
      photoName.textContent = file.name || 'New photo';
      photoPreview.hidden = false;
      photoActions.hidden = true;
      setFormStatus('Photo ready. Flora will remove its embedded metadata before upload.');
      const photoLocation = await readJpegGps(file);
      if (selectedPhoto !== file || !photoLocation) return;
      selectedLocation = photoLocation;
      selectedLocationSource = 'photo_exif';
      locationButton.classList.add('is-ready');
      locationLabel.textContent = 'Photo location added privately';
      nearbyPlaces = await findNearbyPlaces(photoLocation);
      if (selectedPhoto !== file) return;
      if (!placeInput.value && nearbyPlaces.length) placeInput.value = nearbyPlaces[0];
      setFormStatus(nearbyPlaces.length
        ? `Photo location found. Suggested ${nearbyPlaces[0]}; the uploaded copy will not contain GPS metadata.`
        : 'Photo location found privately. Start typing to choose the market; the uploaded copy will not contain GPS metadata.');
    });
  });

  document.querySelector('[data-remove-photo]')?.addEventListener('click', () => {
    clearPhoto();
    setFormStatus('Photo removed.');
  });

  async function saveOnlineSighting(sighting, photo) {
    const client = await getSupabaseClient();
    if (!client) throw new Error('Online sync is not configured');

    let { data: sessionData } = await client.auth.getSession();
    let user = sessionData.session?.user;
    if (!user) {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }
    if (!user) throw new Error('Could not start a private session');

    let photoPath = null;
    if (photo) {
      photoPath = `${user.id}/${sighting.id}/photo.jpg`;
      const { error } = await client.storage.from('sighting-photos').upload(photoPath, photo, {
        contentType: 'image/jpeg', upsert: false
      });
      if (error) throw error;
    }

    const row = {
      id: sighting.id,
      user_id: user.id,
      food_text: sighting.food,
      place_text: sighting.place || null,
      price_text: sighting.price || null,
      observed_at: sighting.observedAt,
      photo_path: photoPath,
      status: photoPath ? 'pending_analysis' : 'pending_review',
      location_source: sighting.location ? sighting.locationSource : null,
      accuracy_meters: sighting.location?.accuracy ?? null,
      location: sighting.location
        ? `POINT(${sighting.location.longitude} ${sighting.location.latitude})`
        : null
    };
    const { error: insertError } = await client.from('sightings').insert(row);
    if (insertError) {
      if (photoPath) await client.storage.from('sighting-photos').remove([photoPath]);
      throw insertError;
    }

    if (photoPath) {
      const { data: analysisData, error: analysisError } = await client.functions.invoke('analyze-sighting', {
        body: { sightingId: sighting.id }
      });
      return {
        id: sighting.id,
        analysisQueued: !analysisError,
        analysisPending: Boolean(analysisError),
        analysis: analysisData?.analysis ?? null
      };
    }
    return { id: sighting.id, analysisQueued: false, analysisPending: false, analysis: null };
  }

  async function updateOnlineSighting(id, sighting) {
    const client = await getSupabaseClient();
    if (!client) throw new Error('Online sync is not configured');
    const { error } = await client.from('sightings').update({
      food_text: sighting.food,
      place_text: sighting.place || null,
      price_text: sighting.price || null
    }).eq('id', id);
    if (error) throw error;
  }

  function showSightingComplete(sighting) {
    completeTitle.textContent = sighting.food || 'Sighting saved';
    completeMeta.textContent = [sighting.place, sighting.price].filter(Boolean).join(' · ') || 'Saved for your seasonal record.';
    if (previewUrl) {
      completeImage.src = previewUrl;
      completePhoto.hidden = false;
    } else {
      completeImage.removeAttribute('src');
      completePhoto.hidden = true;
    }
    sightingEditor.hidden = true;
    sightingComplete.hidden = false;
    sightingPhase = 'complete';
  }

  function resetSightingForm() {
    const form = spotDialog?.querySelector('form');
    form?.reset();
    clearPhoto();
    selectedLocation = null;
    selectedLocationSource = null;
    nearbyPlaces = [];
    currentSightingId = null;
    sightingPhase = 'capture';
    locationButton?.classList.remove('is-ready');
    if (locationLabel) locationLabel.textContent = 'Add current location';
    if (analysisResult) analysisResult.hidden = true;
    analysisItems?.replaceChildren();
    if (analysisPlace) analysisPlace.textContent = '';
    if (placeSuggestions) placeSuggestions.hidden = true;
    if (sightingEditor) sightingEditor.hidden = false;
    if (sightingComplete) sightingComplete.hidden = true;
    if (completeImage) completeImage.removeAttribute('src');
    if (saveButton) saveButton.textContent = 'Identify & review';
    setFormStatus('');
  }

  const saveButton = document.querySelector('[data-save-sighting]');
  saveButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const foodInput = spotDialog.querySelector('[name="food"]');
    const food = foodInput.value.trim();
    if (!food && !selectedPhoto) {
      setFormStatus('Add a photo or type the food you spotted.', 'error');
      return;
    }
    const form = spotDialog.querySelector('form');
    const reviewedSighting = {
      food: food || 'Photo sighting',
      place: form.elements.place.value.trim(),
      price: form.elements.price.value.trim()
    };

    if (sightingPhase === 'review' && currentSightingId) {
      form.classList.add('is-saving');
      setFormStatus('Saving your sighting…');
      try {
        await updateOnlineSighting(currentSightingId, reviewedSighting);
        showSightingComplete(reviewedSighting);
      } catch (error) {
        setFormStatus('Your edits could not be saved yet. Please try again.', 'error');
      } finally {
        form.classList.remove('is-saving');
      }
      return;
    }

    form.classList.add('is-saving');
    setFormStatus('Preparing a private, metadata-free copy…');
    const sighting = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sighting-${Date.now()}`,
      ...reviewedSighting,
      observedAt: new Date().toISOString(),
      location: selectedLocation,
      locationSource: selectedLocationSource
    };
    try {
      const cleanPhoto = await makeMetadataFreePhoto(selectedPhoto);
      setFormStatus('Sharing sighting…');
      const result = await saveOnlineSighting(sighting, cleanPhoto);
      if (result.analysis) {
        const names = result.analysis.items.map((item) => [item.name, item.variety].filter(Boolean).join(' · '));
        foodInput.value = names.join(', ');
        if (!form.elements.price.value && result.analysis.items[0]?.price_text) {
          form.elements.price.value = result.analysis.items[0].price_text;
        }
        if (!form.elements.place.value && result.analysis.place_name) {
          form.elements.place.value = result.analysis.place_name;
        }
        renderAnalysis(result.analysis);
      }
      currentSightingId = result.id;
      sightingPhase = 'review';
      saveButton.textContent = 'Save sighting';
      const outcome = result.analysisQueued
        ? `${result.analysis?.items?.length || 1} item${result.analysis?.items?.length === 1 ? '' : 's'} found. Review the details, then save.`
        : result.analysisPending
          ? 'Photo saved privately. Review what you entered, then save.'
          : 'Review the details, then save.';
      setFormStatus(outcome, result.analysisPending ? 'error' : 'success');
    } catch (error) {
      try {
        const cleanPhoto = await makeMetadataFreePhoto(selectedPhoto);
        await storeSighting({ ...sighting, photo: cleanPhoto, syncStatus: 'waiting' });
        setFormStatus(`${food} is safe on this device and will need to sync later.`, 'error');
      } catch (localError) {
        setFormStatus('This sighting could not be saved. The original photo has not left this device.', 'error');
      }
    } finally {
      form.classList.remove('is-saving');
    }
  });

  document.querySelector('[data-view-market-finds]')?.addEventListener('click', () => {
    window.location.href = 'markets.html';
  });

  document.querySelector('[data-add-another]')?.addEventListener('click', resetSightingForm);

  spotDialog?.addEventListener('close', () => {
    if (sightingPhase === 'complete') resetSightingForm();
  });

  const locationDialog = document.querySelector('[data-location-dialog]');
  document.querySelector('[data-location-button]')?.addEventListener('click', () => {
    if (typeof locationDialog.showModal === 'function') locationDialog.showModal();
    else locationDialog.setAttribute('open', '');
  });

  loadMarketSightings();
})();
