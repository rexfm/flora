((root) => {
  function normalize(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function dayKey(value) {
    const raw = String(value || '');
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
    if (match) return match[1];
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
  }

  function itemKey(item) {
    return normalize([item?.name, item?.variety].filter(Boolean).join(' '));
  }

  function sameItem(left, right) {
    const a = itemKey(left);
    const b = itemKey(right);
    return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)))));
  }

  function sightingItems(sighting) {
    if (Array.isArray(sighting.identifiedItems) && sighting.identifiedItems.length) return sighting.identifiedItems;
    return [{ name: sighting.food_text || sighting.produce_name || 'Photo sighting', variety: sighting.variety || null, price_text: sighting.price_text || null }];
  }

  function compatible(left, right) {
    const a = normalize(left);
    const b = normalize(right);
    return !a || !b || a === b;
  }

  function isSameReport(left, right) {
    if (dayKey(left.observed_at) !== dayKey(right.observed_at)) return false;
    if (!compatible(left.place_text, right.place_text)) return false;
    if (!compatible(left.farm_text, right.farm_text)) return false;
    return sightingItems(left).some((leftItem) => sightingItems(right).some((rightItem) => (
      sameItem(leftItem, rightItem)
      && compatible(leftItem.price_text || left.price_text, rightItem.price_text || right.price_text)
    )));
  }

  function prefer(left, right) {
    return normalize(right).length > normalize(left).length ? right : left;
  }

  function cleanItem(item) {
    const cleaned = { ...item };
    if (normalize(cleaned.name) === normalize(cleaned.variety)) cleaned.variety = null;
    return cleaned;
  }

  function mergeItems(left, right) {
    const merged = new Map();
    [...left, ...right].forEach((item) => {
      const key = itemKey(item);
      if (!key) return;
      const currentKey = [...merged.keys()].find((candidate) => sameItem(merged.get(candidate), item));
      const current = currentKey ? merged.get(currentKey) : null;
      if (!current) {
        merged.set(key, cleanItem(item));
        return;
      }
      merged.set(currentKey, cleanItem({
        ...current,
        ...item,
        name: prefer(current.name, item.name),
        variety: prefer(current.variety, item.variety) || null,
        price_text: prefer(current.price_text, item.price_text) || null
      }));
    });
    return [...merged.values()];
  }

  function mergeSightings(left, right) {
    const score = (sighting) => ['place_text', 'farm_text', 'price_text', 'photoUrl'].filter((field) => sighting[field]).length;
    const preferred = score(right) > score(left) ? right : left;
    return {
      ...left,
      ...preferred,
      place_text: prefer(left.place_text, right.place_text) || null,
      farm_text: prefer(left.farm_text, right.farm_text) || null,
      price_text: prefer(left.price_text, right.price_text) || null,
      photoUrl: left.photoUrl || right.photoUrl || null,
      identifiedItems: mergeItems(sightingItems(left), sightingItems(right)),
      sourceIds: [...new Set([...(left.sourceIds || [left.id]), ...(right.sourceIds || [right.id])])]
    };
  }

  function consolidate(sightings) {
    return sightings.reduce((groups, sighting) => {
      const index = groups.findIndex((candidate) => isSameReport(candidate, sighting));
      if (index === -1) groups.push({ ...sighting, identifiedItems: sightingItems(sighting), sourceIds: sighting.sourceIds || [sighting.id] });
      else groups[index] = mergeSightings(groups[index], sighting);
      return groups;
    }, []);
  }

  root.FloraSightings = { consolidate, normalize };
})(globalThis);
