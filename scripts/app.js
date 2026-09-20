(() => {
  const SIGHTINGS_DB = 'flora-local';
  const SIGHTINGS_STORE = 'sightings';

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
        formStatus.textContent = 'Choose a photo or image file.';
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
      formStatus.textContent = 'Photo ready to save.';
    });
  });

  document.querySelector('[data-remove-photo]')?.addEventListener('click', () => {
    clearPhoto();
    formStatus.textContent = 'Photo removed.';
  });

  const saveButton = document.querySelector('[data-save-sighting]');
  saveButton?.addEventListener('click', async (event) => {
    event.preventDefault();
    const foodInput = spotDialog.querySelector('[name="food"]');
    const food = foodInput.value.trim();
    if (!food) {
      formStatus.textContent = 'Add a food or variety to save this sighting.';
      foodInput.focus();
      return;
    }
    const form = spotDialog.querySelector('form');
    form.classList.add('is-saving');
    formStatus.textContent = 'Saving on this device…';
    try {
      await storeSighting({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sighting-${Date.now()}`,
        food,
        place: form.elements.place.value.trim(),
        price: form.elements.price.value.trim(),
        observedAt: new Date().toISOString(),
        photo: selectedPhoto
      });
      formStatus.textContent = `${food} saved on this device${selectedPhoto ? ' with its photo' : ''}.`;
    } catch (error) {
      formStatus.textContent = 'This sighting could not be saved. Your photo has not left this device.';
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
