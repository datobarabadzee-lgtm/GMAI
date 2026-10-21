'use client';

import { useState } from 'react';
import { clearPatientSession } from './session-clear';

/** Removes the case, conversation, confirmed products and attestation from this browser. */
export function ClearSessionButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn text-[13px]"
      onClick={() => {
        clearPatientSession();
        setDone(true);
      }}
    >
      {done ? 'სესია გასუფთავდა' : 'სესიის მონაცემების წაშლა ამ ბრაუზერიდან'}
    </button>
  );
}
