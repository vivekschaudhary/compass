"use client";

// The dropdown that says WHAT a workflow is being started for — an epic, a story, whatever kind
// `lib/subject-kinds.ts` registers. One component so every start screen offers the choice the same
// way; the screen owns the selected value and what Start does with it.

import { SUBJECT_KINDS, describeChoice, type SubjectChoice, type SubjectKind } from "@/app/lib/subject-kinds";

export function SubjectPicker({
  kind, choices, value, onChange, disabled, label, id,
}: {
  kind: SubjectKind;
  choices: SubjectChoice[];
  value: string;
  onChange: (ref: string) => void;
  disabled?: boolean;
  /** What a screen reader hears: "Story to start Build for". */
  label: string;
  id?: string;
}) {
  const noun = SUBJECT_KINDS[kind].noun;
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{choices.length ? `Choose ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}…` : `No ${noun === "story" ? "stories" : `${noun}s`} on the board yet`}</option>
      {choices.map((c) => (
        <option key={c.ref} value={c.ref}>{describeChoice(c)}</option>
      ))}
    </select>
  );
}
