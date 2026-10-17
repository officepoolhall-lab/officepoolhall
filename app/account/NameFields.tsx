import { Field, inputClass } from "@/components/ui";

/** First and last name inputs, shared by /welcome and /account. */
export function NameFields({ first, last, autoFocus = false }: { first?: string | null; last?: string | null; autoFocus?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name">
        <input
          name="first_name" required maxLength={50} autoComplete="given-name" autoFocus={autoFocus}
          defaultValue={first ?? ""} className={inputClass}
        />
      </Field>
      <Field label="Last name">
        <input name="last_name" required maxLength={50} autoComplete="family-name" defaultValue={last ?? ""} className={inputClass} />
      </Field>
    </div>
  );
}
