(() => {
  const SIGHTINGS_DB = 'flora-local';
  const SIGHTINGS_STORE = 'sightings';
  const MAX_PHOTO_EDGE = 1600;
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

  const marketCards = [...document.querySelectorAll('[data-market]')];
  const marketChips = [...document.querySelectorAll('[data-market-filter]')];
  marketChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const market = chip.dataset.marketFilter;
      marketCards.forEach((card) => {
        card.hidden = market !== 'all' && card.dataset.market !== market;
      });
      marketChips.forEach((option) => {
        const selected = option === chip;
        option.classList.toggle('is-active', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
    });
  });

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
  let selectedLocation = null;

  function setFormStatus(message, kind = '') {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.classList.toggle('is-error', kind === 'error');
    formStatus.classList.toggle('is-success', kind === 'success');
  }

  locationButton?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setFormStatus('Location is not available in this browser.', 'error');
      return;
    }
    locationLabel.textContent = 'Finding location…';
    navigator.geolocation.getCurrentPosition((position) => {
      selectedLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy)
      };
      locationButton.classList.add('is-ready');
      locationLabel.textContent = `Location added · about ${selectedLocation.accuracy} m`;
      setFormStatus('Location will be stored privately with this sighting.');
    }, () => {
      selectedLocation = null;
      locationLabel.textContent = 'Try current location again';
      setFormStatus('Location was not added. You can still share the sighting.', 'error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });

  function clearPhoto() {
    selectedPhoto = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoInputs.forEach((input) => { input.value = ''; });
    if (photoPreviewImage) photoPreviewImage.removeAttribute('src');
    if (photoPreview) photoPreview.hidden = true;
    if (photoActions) photoActions.hidden = false;
  }

  photoInputs.forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setFormStatus('Choose a photo or image file.', 'error');
        input.value = '';
        return;
      }
      selectedPhoto = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      photoPreviewImage.src = previewUrl;
      photoName.textContent = file.name || 'New photo';
      photoPreview.hidden = false;
      photoActions.hidden = true;
      setFormStatus('Photo ready. Flora will remove its embedded metadata before upload.');
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
      location_source: sighting.location ? 'browser_gps' : null,
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
      const { error: analysisError } = await client.functions.invoke('analyze-sighting', {
        body: { sightingId: sighting.id }
      });
      return { analysisQueued: !analysisError };
    }
    return { analysisQueued: false };
  }

  const saveButton = document.querySelector('[data-save-sighting]');
  saveButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const foodInput = spotDialog.querySelector('[name="food"]');
    const food = foodInput.value.trim();
    if (!food) {
      setFormStatus('Add a food or variety to save this sighting.', 'error');
      foodInput.focus();
      return;
    }
    const form = spotDialog.querySelector('form');
    form.classList.add('is-saving');
    setFormStatus('Preparing a private, metadata-free copy…');
    const sighting = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sighting-${Date.now()}`,
      food,
      place: form.elements.place.value.trim(),
      price: form.elements.price.value.trim(),
      observedAt: new Date().toISOString(),
      location: selectedLocation
    };
    try {
      const cleanPhoto = await makeMetadataFreePhoto(selectedPhoto);
      setFormStatus('Sharing sighting…');
      const result = await saveOnlineSighting(sighting, cleanPhoto);
      setFormStatus(`${food} shared${result.analysisQueued ? ' and sent for identification' : ''}.`, 'success');
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

  const locationDialog = document.querySelector('[data-location-dialog]');
  document.querySelector('[data-location-button]')?.addEventListener('click', () => {
    if (typeof locationDialog.showModal === 'function') locationDialog.showModal();
    else locationDialog.setAttribute('open', '');
  });
})();
