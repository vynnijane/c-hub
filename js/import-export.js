/* ── IMPORT / EXPORT ───────────────────────────────────────────────────────
 * Character card V1/V2 normalisation, workspace export/import
 * ─────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const JAI_CATEGORIES = [
    'Anime', 'Games', 'Movies & TV', 'Books & Literature',
    'Historical', 'Fantasy', 'Sci-Fi', 'Slice of Life',
    'Romance', 'Action & Adventure', 'Horror', 'Comedy',
    'OC (Original Character)', 'Celebrity', 'VTuber', 'Other'
  ];

  /* Build a blank card with the new schema */
  function blankCard(name = 'New Character') {
    const { uid } = window.App.UI;
    return {
      id:        uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      spec:          'chara_card_v2',
      spec_version:  '2.0',
      data: {
        name,
        description:                '',
        personality:                '',
        scenario:                   '',
        first_mes:                  '',
        mes_example:                '',
        creator_notes:              '',
        system_prompt:              '',
        post_history_instructions:  '',
        alternate_greetings:        [],
        character_book:             { entries: [] },
        tags:                       [],
        creator:                    '',
        character_version:          '1.0',
        extensions:                 {}
      },
      _jai: {
        bio:          '',
        nsfw:         false,
        visibility:   'private',
        category:     '',
        jai_tags:     [],
        images:       [],
        activeImageId: null,
        versions:     [],
        lorebookRefs: []   // IDs of attached standalone lorebooks
      }
    };
  }

  /* Normalise a parsed JSON object (V1 or V2) into an internal card */
  function normaliseCard(json) {
    let data;
    if (json.spec === 'chara_card_v2' && json.data) {
      data = json.data;
    } else if (json.name || json.description) {
      // V1 flat format
      data = {
        name:                       json.name || '',
        description:                json.description || '',
        personality:                json.personality || '',
        scenario:                   json.scenario || '',
        first_mes:                  json.first_mes || '',
        mes_example:                json.mes_example || '',
        creator_notes:              json.creator_notes || json.creatorcomment || '',
        system_prompt:              json.system_prompt || '',
        post_history_instructions:  json.post_history_instructions || '',
        alternate_greetings:        json.alternate_greetings || [],
        character_book:             json.character_book || { entries: [] },
        tags:                       json.tags || [],
        creator:                    json.creator || json.author || '',
        character_version:          json.character_version || '1.0',
        extensions:                 json.extensions || {}
      };
    } else {
      return null; // unrecognised format
    }

    const card = blankCard(data.name || 'Imported');
    Object.assign(card.data, data);

    // Restore _jai extras if they were exported
    if (json._jai) {
      Object.assign(card._jai, json._jai);
    }

    return card;
  }

  /* Build the V2 export JSON (clean, no internal fields) */
  function buildExportJson(card) {
    const data = JSON.parse(JSON.stringify(card.data));
    // Strip internal _open flag from lorebook entries
    if (data.character_book?.entries) {
      data.character_book.entries = data.character_book.entries.map(e => {
        const { _open, ...rest } = e;
        return rest;
      });
    }
    return {
      spec:         'chara_card_v2',
      spec_version: '2.0',
      data
    };
  }

  /* Build full export including _jai extras */
  function buildFullExportJson(card) {
    return {
      ...buildExportJson(card),
      _jai: JSON.parse(JSON.stringify(card._jai))
    };
  }

  /* Export the whole workspace as a single JSON file */
  async function exportWorkspace() {
    const data = await window.App.DB.exportAll();
    return data;
  }

  /* Import workspace from JSON — replaces all existing data */
  async function importWorkspace(json) {
    // Validate
    const hasAny = App.DB.STORES.some(s => Array.isArray(json[s]));
    if (!hasAny) throw new Error('Not a valid workspace export');
    await window.App.DB.importAll(json);
  }

  /* Blank lorebook */
  function blankLorebook(name = 'New Lorebook') {
    const { uid } = window.App.UI;
    return {
      id:        uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name,
      description: '',
      entries:     [],
      versions:    [],
      tags:        []
    };
  }

  /* Blank lorebook entry */
  function blankLoreEntry(index = 0) {
    const { uid } = window.App.UI;
    return {
      id:              uid(),
      keys:            [],
      content:         '',
      enabled:         true,
      insertion_order: index,
      priority:        10,
      comment:         '',
      _open:           true
    };
  }

  /* Blank persona */
  function blankPersona(name = 'New Persona') {
    const { uid } = window.App.UI;
    return {
      id:        uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name,
      description:    '',
      personality:    '',
      appearance:     '',
      backstory:      '',
      customFields:   [],
      isActive:       false,
      versions:       [],
      tags:           []
    };
  }

  /* Blank preset */
  function blankPreset(name = 'New Preset') {
    const { uid } = window.App.UI;
    return {
      id:        uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name,
      description:             '',
      systemPrompt:            '',
      postHistoryInstructions: '',
      notes:                   '',
      versions:                [],
      tags:                    []
    };
  }

  /* Blank note */
  function blankNote(title = 'Untitled Note') {
    const { uid } = window.App.UI;
    return {
      id:        uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title,
      fields:    [],
      tags:      []
    };
  }

  /* ── PNG Character Card Parser ──────────────────────────────────────────
   * PNG character cards (used by JanitorAI, CharacterAI, SillyTavern, etc.)
   * embed JSON in a PNG tEXt chunk with keyword "chara" (base64-encoded).
   * Some exporters use iTXt chunks instead.
   * Returns a parsed JSON object suitable for normaliseCard().
   */
  async function parsePNGCard(file) {
    const buffer = await file.arrayBuffer();
    const bytes  = new Uint8Array(buffer);

    // Validate PNG signature: 8 magic bytes
    const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== PNG_SIG[i]) throw new Error('Not a valid PNG file');
    }

    let offset = 8; // skip signature

    while (offset + 12 <= bytes.length) {
      // Each chunk: 4-byte length (big-endian) + 4-byte type + <length> bytes data + 4-byte CRC
      const length   = ((bytes[offset] << 24) | (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3]) >>> 0;
      const typeStr  = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
      const dataStart = offset + 8;
      const data     = bytes.slice(dataStart, dataStart + length);

      if (typeStr === 'tEXt') {
        // Format: null-terminated keyword + raw text (Latin-1)
        let nullIdx = -1;
        for (let i = 0; i < data.length; i++) { if (data[i] === 0) { nullIdx = i; break; } }
        if (nullIdx >= 0) {
          const keyword = String.fromCharCode(...data.slice(0, nullIdx));
          if (keyword === 'chara') {
            // Text bytes after null — convert Latin-1 bytes to string then atob
            const latin1 = Array.from(data.slice(nullIdx + 1), b => String.fromCharCode(b)).join('');
            return JSON.parse(atob(latin1));
          }
        }
      }

      if (typeStr === 'iTXt') {
        // Format: null-terminated keyword + compression flag (1) + compression method (1)
        //         + null-terminated language tag + null-terminated translated keyword + text (UTF-8)
        let pos = 0;
        let nullIdx = -1;
        for (let i = pos; i < data.length; i++) { if (data[i] === 0) { nullIdx = i; break; } }
        if (nullIdx < 0) { offset += 12 + length; continue; }
        const keyword = String.fromCharCode(...data.slice(0, nullIdx));
        if (keyword !== 'chara') { offset += 12 + length; continue; }
        pos = nullIdx + 1;           // skip keyword null
        // const comprFlag = data[pos];
        pos += 2;                    // skip compression flag + compression method
        // Skip language tag (null-terminated)
        while (pos < data.length && data[pos] !== 0) pos++;
        pos++;                       // skip null
        // Skip translated keyword (null-terminated)
        while (pos < data.length && data[pos] !== 0) pos++;
        pos++;                       // skip null
        // Remaining bytes: text (UTF-8)
        const textBytes = data.slice(pos);
        const text = new TextDecoder('utf-8').decode(textBytes);
        return JSON.parse(atob(text));
      }

      if (typeStr === 'IEND') break; // end of PNG

      offset += 12 + length; // advance past this chunk (length + type + data + CRC)
    }

    throw new Error('No character data found in this PNG (missing "chara" chunk)');
  }

  window.App = window.App || {};
  window.App.Factory = {
    blankCard, normaliseCard,
    buildExportJson, buildFullExportJson,
    exportWorkspace, importWorkspace,
    blankLorebook, blankLoreEntry,
    blankPersona,
    blankPreset,
    blankNote,
    JAI_CATEGORIES,
    parsePNGCard
  };
})();
