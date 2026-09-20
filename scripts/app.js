(() => {
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
      if (typeof spotDialog.showModal === 'function') spotDialog.showModal();
      else spotDialog.setAttribute('open', '');
    });
  });

  const saveButton = document.querySelector('[data-save-sighting]');
  saveButton?.addEventListener('click', (event) => {
    const foodInput = spotDialog.querySelector('[name="food"]');
    const food = foodInput.value.trim();
    if (!food) {
      event.preventDefault();
      document.querySelector('[data-form-status]').textContent = 'Add a food or variety to save this sighting.';
      foodInput.focus();
      return;
    }
    event.preventDefault();
    document.querySelector('[data-form-status]').textContent = `${food} is ready to become a Flora sighting. Data sync comes next.`;
  });

  const locationDialog = document.querySelector('[data-location-dialog]');
  document.querySelector('[data-location-button]')?.addEventListener('click', () => {
    if (typeof locationDialog.showModal === 'function') locationDialog.showModal();
    else locationDialog.setAttribute('open', '');
  });
})();
